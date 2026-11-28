/**
 * 单站本地预览进程管理与异常自愈模块：
 * 1. 严格空闲端口检测（TCP 连接拒绝 + IPv4/IPv6 exclusive 试绑），避开任何被其他程序占用的端口；
 * 2. 以子进程 stdout 实际输出的监听端口为唯一真源，并校验 /robots.txt === 200，彻底杜绝把其他软件误判为预览成功；
 * 3. 按站点绝对路径精准回收孤儿进程（绝不按端口号误杀其他软件），遇到 workerd / 缓存锁自动清理并重试；
 * 4. Windows 下自动修复被沙箱/安全软件毒化的 NTFS ACL 与完整性级别（CreateDirectory #5）；
 * 5. 确保 astro cloudflare adapter persistState:false，并隔离 TMP 后重试；
 * 6. 实时校验 PID 存活状态，防止外部关闭进程后界面状态失真。
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createConnection, createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { ensureHome, homeDir, sanitizeSiteKey } from './paths.mjs';

/** @type {Map<string, { pid: number, port: number, url: string, siteDir: string, child: import('node:child_process').ChildProcess }>} */
const previewJobs = new Map();

function previewStateFile() {
  return join(homeDir(), 'previews.json');
}

function readPersistedPreviews() {
  const file = previewStateFile();
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePersistedPreviews(mapObj) {
  try {
    ensureHome();
    writeFileSync(previewStateFile(), `${JSON.stringify(mapObj, null, 2)}\n`, 'utf8');
  } catch {
    // ignore
  }
}

function recordPreviewPid(siteKey, pid, port, siteDir) {
  const all = readPersistedPreviews();
  all[siteKey] = { pid, port, siteDir, updatedAt: new Date().toISOString() };
  writePersistedPreviews(all);
}

function removePreviewPid(siteKey) {
  const all = readPersistedPreviews();
  if (siteKey in all) {
    delete all[siteKey];
    writePersistedPreviews(all);
  }
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPidTree(pid, child = null) {
  try {
    if (process.platform === 'win32' && pid) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } else if (child) {
      child.kill('SIGINT');
    } else if (pid) {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // ignore
  }
}

/**
 * 精准清理指定站点目录残留的孤儿 astro / workerd 进程（按站点路径匹配，绝不误杀其他程序）。
 */
function killOrphanProcessesForSite(siteKey, siteDir) {
  const persisted = readPersistedPreviews();
  if (persisted[siteKey]?.pid) {
    killPidTree(persisted[siteKey].pid);
    removePreviewPid(siteKey);
  }

  if (process.platform === 'win32' && siteDir) {
    const normPath = siteDir.replace(/\//g, '\\').replace(/'/g, "''");
    const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf('${normPath}', [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and ($_.Name -ieq 'node.exe' -or $_.Name -ieq 'workerd.exe') } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }`;
    try {
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        windowsHide: true,
        timeout: 6000,
      });
    } catch {
      // ignore
    }
  }
}

/**
 * 服务启动时调用：回收上次软件意外关闭遗留的孤儿预览进程。
 */
export function reapOrphanPreviewsOnBoot() {
  const persisted = readPersistedPreviews();
  const keys = Object.keys(persisted);
  if (keys.length === 0) return;
  for (const key of keys) {
    const entry = persisted[key];
    killOrphanProcessesForSite(key, entry?.siteDir || '');
  }
  writePersistedPreviews({});
}

function isPortListening(port, host) {
  return new Promise((resolveOpen) => {
    let connected = false;
    const sock = createConnection({ host, port });
    sock.setTimeout(250);
    sock.on('connect', () => {
      connected = true;
      sock.destroy();
    });
    sock.on('timeout', () => sock.destroy());
    sock.on('error', () => {});
    sock.on('close', () => resolveOpen(connected));
  });
}

function canBindExclusive(port, host) {
  return new Promise((resolveOk) => {
    const srv = createNetServer();
    srv.once('error', (err) => {
      if (host === '::1' && (err?.code === 'EADDRNOTAVAIL' || err?.code === 'EAFNOSUPPORT')) {
        resolveOk(true);
        return;
      }
      resolveOk(false);
    });
    srv.once('listening', () => {
      srv.close(() => resolveOk(true));
    });
    srv.listen({ port, host, exclusive: true });
  });
}

function allocateOsEphemeralPort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer();
    srv.once('error', reject);
    srv.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => {
        if (port > 0) resolvePort(port);
        else reject(new Error('无法向操作系统申请空闲端口'));
      });
    });
  });
}

async function findFreePort(startPort = 4321, endPort = 4499) {
  for (let port = startPort; port <= endPort; port++) {
    const inUseV4 = await isPortListening(port, '127.0.0.1');
    if (inUseV4) continue;
    const inUseV6 = await isPortListening(port, '::1');
    if (inUseV6) continue;
    if ((await canBindExclusive(port, '127.0.0.1')) && (await canBindExclusive(port, '::1'))) {
      return port;
    }
  }
  return allocateOsEphemeralPort();
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
}

function parseAstroListeningPort(stdoutChunk) {
  const clean = stripAnsi(stdoutChunk);
  const match = clean.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : null;
}

function isRecoverablePreviewError(cleanText) {
  return /workerd|miniflare|CreateDirectory|EACCES|EBUSY|EPERM|EADDRINUSE|\.wrangler|拒绝访问|Access is denied|optimizeDeps|filesystem-disk-win32/i.test(
    cleanText
  );
}

function isAclOrAccessDeniedError(cleanText) {
  return /CreateDirectory|拒绝访问|Access is denied|EACCES|EPERM|filesystem-disk-win32|Mandatory Label|integrity/i.test(
    cleanText
  );
}

function formatFriendlyPreviewError(rawText, autoHealed) {
  const clean = stripAnsi(rawText);
  if (isAclOrAccessDeniedError(clean) || /miniflare|workerd/i.test(clean)) {
    return autoHealed
      ? '本地预览仍无法写入站点目录（已自动修复 NTFS 权限、清理缓存并重试）。请稍等几秒再点「预览」；若仍失败，请暂时排除杀毒对 workerd.exe 的拦截，或在站点目录手动执行一次「安装依赖」后重试。'
      : '本地预览运行时目录权限冲突，正在自动清理修复…';
  }
  if (/EADDRINUSE/i.test(clean)) {
    return '预览端口刚被其他程序占用，请重新点击「预览」以自动分配新端口。';
  }
  if (/Cannot find module|ERR_MODULE_NOT_FOUND/i.test(clean)) {
    return '站点依赖不完整，请先点击「安装依赖」后再启动预览。';
  }
  const firstLine =
    clean.split(/\r?\n/).find((l) => l.trim().length > 0) || '请检查站点代码是否有语法错误';
  return `本地预览启动失败：${firstLine.slice(0, 180)}`;
}

function runIcacls(args, timeoutMs = 90000) {
  try {
    return spawnSync('icacls', args, {
      windowsHide: true,
      timeout: timeoutMs,
      encoding: 'utf8',
    });
  } catch {
    return null;
  }
}

/**
 * 探测站点根目录是否允许创建子目录。
 * 注意：Node mkdir 成功不能代表 workerd/KJ 也能建目录；Windows 上仍须配合 ACL 检查。
 */
export function canCreateDirInSite(siteDir) {
  if (!siteDir || !existsSync(siteDir)) return false;
  const probe = join(siteDir, `.cizhenyu-write-probe-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(probe);
    rmSync(probe, { recursive: true, force: true });
    return true;
  } catch {
    try {
      rmSync(probe, { recursive: true, force: true });
    } catch {
      // ignore
    }
    return false;
  }
}

/** 检测站点目录是否被写入 DENY(CreateDirectories) 或 Low Integrity（workerd CreateDirectory #5 的常见根因）。 */
export function hasPoisonedWindowsAcl(siteDir) {
  if (process.platform !== 'win32' || !siteDir || !existsSync(siteDir)) return false;
  const r = runIcacls([siteDir], 20000);
  const out = `${r?.stdout || ''}\n${r?.stderr || ''}`;
  return /\(DENY\)|Low Mandatory Level/i.test(out);
}

/**
 * 修复 Windows 站点目录被沙箱/安全软件写入的 DENY ACE 与 Low Integrity，
 * 否则 workerd 会在创建 miniflare-* 时报 CreateDirectory #5。
 * @param {string} siteDir
 * @param {{ deep?: boolean }} [opts] deep=true 时对已有子树 /T 重置（较慢，仅作最后手段）
 */
export function normalizeSiteFilesystemAccess(siteDir, opts = {}) {
  if (process.platform !== 'win32' || !siteDir || !existsSync(siteDir)) return;
  const deep = Boolean(opts.deep);
  const trail = deep ? ['/T', '/C', '/Q'] : ['/C', '/Q'];
  const targets = [];
  const wranglerDir = join(siteDir, '.wrangler');
  if (existsSync(wranglerDir)) targets.push(wranglerDir);
  targets.push(siteDir);

  for (const target of targets) {
    runIcacls([target, '/remove:d', 'Everyone', ...trail]);
    runIcacls([target, '/remove:d', '*S-1-1-0', ...trail]);
    runIcacls([target, '/reset', ...trail], deep ? 180000 : 30000);
    runIcacls([target, '/setintegritylevel', '(OI)(CI)M', ...trail]);
    const user = String(process.env.USERNAME || '').trim();
    if (user) {
      runIcacls([target, '/grant', `${user}:(OI)(CI)F`, ...trail]);
    }
    runIcacls([target, '/grant', 'BUILTIN\\Users:(OI)(CI)M', ...trail]);
  }
}

/**
 * 确保 Astro Cloudflare adapter 关闭本地 persist，避免 workerd 在站点 cwd 强行建 miniflare 持久化目录。
 */
export function ensurePersistStateDisabled(siteDir) {
  const cfgPath = join(siteDir, 'astro.config.mjs');
  if (!existsSync(cfgPath)) return false;
  let raw = readFileSync(cfgPath, 'utf8');
  if (/persistState\s*:\s*false/.test(raw)) return false;
  let next = raw;
  if (/persistState\s*:\s*true/.test(next)) {
    next = next.replace(/persistState\s*:\s*true/g, 'persistState: false');
  } else if (/cloudflare\s*\(\s*\{/.test(next)) {
    next = next.replace(/cloudflare\s*\(\s*\{/, 'cloudflare({\n    persistState: false,');
  } else if (/cloudflare\s*\(\s*\)/.test(next)) {
    next = next.replace(/cloudflare\s*\(\s*\)/, 'cloudflare({ persistState: false })');
  } else {
    return false;
  }
  if (next === raw) return false;
  writeFileSync(cfgPath, next, 'utf8');
  return true;
}

function cleanupStalePreviewCaches(siteDir) {
  const targets = [
    join(siteDir, '.wrangler'),
    join(siteDir, 'node_modules', '.vite'),
    join(siteDir, 'miniflare-email-store'),
    join(siteDir, '.mf'),
  ];
  try {
    for (const name of readdirSync(siteDir)) {
      if (name.startsWith('miniflare-') || name === '.wrangler' || name === '.mf') {
        targets.push(join(siteDir, name));
      }
    }
  } catch {
    // ignore
  }

  const uniq = [...new Set(targets)];
  for (const t of uniq) {
    if (!existsSync(t)) continue;
    try {
      rmSync(t, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
    } catch {
      // ignore locked files
    }
  }
}

function makeIsolatedTmp(siteKey) {
  const dir = join(homeDir(), 'tmp', `preview-${siteKey}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function launchPreviewOnce(siteKey, siteDir, isolatedTmpDir = '') {
  const requestedPort = await findFreePort(4321);
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npm';
  const args = isWin
    ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${requestedPort}`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(requestedPort)];

  const env = { ...process.env };
  if (isolatedTmpDir) {
    mkdirSync(isolatedTmpDir, { recursive: true });
    env.TMP = isolatedTmpDir;
    env.TEMP = isolatedTmpDir;
  }

  const child = spawn(cmd, args, {
    cwd: siteDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let outputTail = '';
  let announcedPort = null;
  const onOutput = (chunk) => {
    const str = chunk.toString();
    outputTail = (outputTail + str).slice(-2400);
    if (!announcedPort) {
      const parsed = parseAstroListeningPort(str);
      if (parsed) {
        announcedPort = parsed;
      }
    }
  };
  child.stdout?.on('data', onOutput);
  child.stderr?.on('data', onOutput);

  const pid = child.pid || 0;
  const initialUrl = `http://127.0.0.1:${requestedPort}/`;
  previewJobs.set(siteKey, { pid, port: requestedPort, url: initialUrl, siteDir, child });
  recordPreviewPid(siteKey, pid, requestedPort, siteDir);

  child.on('exit', () => {
    if (previewJobs.get(siteKey)?.child === child) {
      previewJobs.delete(siteKey);
      removePreviewPid(siteKey);
    }
  });

  // 必须先等当前子进程在 stdout 打印出真实监听端口，再校验该端口 /robots.txt === 200，彻底杜绝误判其他软件
  for (let i = 0; i < 45; i++) {
    if (!previewJobs.has(siteKey)) {
      return { ok: false, rawError: outputTail };
    }
    if (announcedPort) {
      const realUrl = `http://127.0.0.1:${announcedPort}/`;
      const cur = previewJobs.get(siteKey);
      if (cur && cur.port !== announcedPort) {
        cur.port = announcedPort;
        cur.url = realUrl;
        recordPreviewPid(siteKey, pid, announcedPort, siteDir);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${announcedPort}/robots.txt`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.status === 200) {
          return { ok: true, status: getPreviewStatus(siteKey) };
        }
        if (isRecoverablePreviewError(stripAnsi(outputTail))) {
          stopSitePreview(siteKey);
          return { ok: false, rawError: outputTail };
        }
      } catch {
        // keep waiting
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  stopSitePreview(siteKey);
  return { ok: false, rawError: outputTail || `端口 ${requestedPort} 启动超时` };
}

export function getPreviewStatus(siteKeyRaw) {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const item = previewJobs.get(siteKey);
  if (!item) {
    return { running: false, port: null, url: null };
  }
  if (!isPidAlive(item.pid)) {
    previewJobs.delete(siteKey);
    removePreviewPid(siteKey);
    return { running: false, port: null, url: null };
  }
  return { running: true, port: item.port, url: item.url };
}

async function isPreviewHealthy(url) {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/robots.txt`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

function prepareSiteForPreview(siteDir, { deepAcl = false } = {}) {
  ensurePersistStateDisabled(siteDir);
  if (process.platform === 'win32') {
    // Node mkdir 成功不能排除 workerd 因 DENY/Low Integrity 失败；每次预览前浅层规范化，失败重试再 deep。
    normalizeSiteFilesystemAccess(siteDir, { deep: Boolean(deepAcl) });
  }
  cleanupStalePreviewCaches(siteDir);
}

/**
 * 启动站点本地预览（严格避让第三方占用端口 + 孤儿回收 + ACL/缓存自愈重试）。
 */
export async function startPreviewForSite(siteKey, siteDir) {
  const existing = previewJobs.get(siteKey);
  if (existing) {
    if (isPidAlive(existing.pid) && (await isPreviewHealthy(existing.url))) {
      return getPreviewStatus(siteKey);
    }
    stopSitePreview(siteKey);
  }
  if (!existsSync(join(siteDir, 'node_modules', 'astro'))) {
    throw new Error('站点依赖尚未安装完成，请等待「依赖已就绪」后再启动预览');
  }

  killOrphanProcessesForSite(siteKey, siteDir);
  prepareSiteForPreview(siteDir, { deepAcl: false });

  const first = await launchPreviewOnce(siteKey, siteDir, makeIsolatedTmp(siteKey));
  if (first.ok) {
    return first.status;
  }

  const cleanErr = stripAnsi(first.rawError);
  if (!isRecoverablePreviewError(cleanErr)) {
    throw new Error(formatFriendlyPreviewError(first.rawError, false));
  }

  // 自愈第 1 次：浅层 ACL + 清缓存 + 隔离 TMP
  killOrphanProcessesForSite(siteKey, siteDir);
  prepareSiteForPreview(siteDir, { deepAcl: false });
  normalizeSiteFilesystemAccess(siteDir, { deep: false });
  await new Promise((r) => setTimeout(r, 700));

  const retry1 = await launchPreviewOnce(siteKey, siteDir, makeIsolatedTmp(siteKey));
  if (retry1.ok) {
    return retry1.status;
  }

  // 自愈第 2 次：深层 ACL（含子树）后再试一次
  killOrphanProcessesForSite(siteKey, siteDir);
  prepareSiteForPreview(siteDir, { deepAcl: true });
  await new Promise((r) => setTimeout(r, 900));

  const retry2 = await launchPreviewOnce(siteKey, siteDir, makeIsolatedTmp(siteKey));
  if (retry2.ok) {
    return retry2.status;
  }

  throw new Error(formatFriendlyPreviewError(retry2.rawError, true));
}

export function stopSitePreview(siteKeyRaw) {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const item = previewJobs.get(siteKey);
  previewJobs.delete(siteKey);
  if (item) {
    killPidTree(item.pid, item.child);
    killOrphanProcessesForSite(siteKey, item.siteDir);
  } else {
    const persisted = readPersistedPreviews();
    if (persisted[siteKey]) {
      killOrphanProcessesForSite(siteKey, persisted[siteKey].siteDir || '');
    }
  }
  removePreviewPid(siteKey);
  return { running: false, port: null, url: null };
}

export function stopAllPreviews() {
  for (const key of [...previewJobs.keys()]) {
    stopSitePreview(key);
  }
}
