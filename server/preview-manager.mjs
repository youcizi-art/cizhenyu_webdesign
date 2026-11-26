/**
 * 单站本地预览进程管理与异常自愈模块：
 * 1. 严格空闲端口检测（TCP 连接拒绝 + IPv4/IPv6 exclusive 试绑），避开任何被其他程序占用的端口；
 * 2. 以子进程 stdout 实际输出的监听端口为唯一真源，并校验 /robots.txt === 200，彻底杜绝把其他软件误判为预览成功；
 * 3. 按站点绝对路径精准回收孤儿进程（绝不按端口号误杀其他软件），遇到 workerd / 缓存锁自动清理并重试；
 * 4. 实时校验 PID 存活状态，防止外部关闭进程后界面状态失真。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  return /workerd|miniflare|CreateDirectory|EACCES|EBUSY|EPERM|EADDRINUSE|\.wrangler|拒绝访问|optimizeDeps/i.test(
    cleanText
  );
}

function formatFriendlyPreviewError(rawText, autoHealed) {
  const clean = stripAnsi(rawText);
  if (/miniflare|workerd|CreateDirectory|拒绝访问|EACCES|EBUSY|EPERM/i.test(clean)) {
    return autoHealed
      ? '本地预览运行时缓存目录被系统或安全软件临时锁定（已自动清理残留进程与缓存并重试一次，仍未解除）。请稍等 3 秒再点「预览」，或检查安全软件是否拦截了 workerd.exe。'
      : '本地预览运行时临时目录权限冲突，正在自动清理修复…';
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

function cleanupStalePreviewCaches(siteDir) {
  const targets = [join(siteDir, '.wrangler', 'state'), join(siteDir, 'node_modules', '.vite')];
  for (const t of targets) {
    if (!existsSync(t)) continue;
    try {
      rmSync(t, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
    } catch {
      // ignore locked files
    }
  }
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

/**
 * 启动站点本地预览（严格避让第三方占用端口 + 孤儿回收 + 异常自愈重试）。
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

  const first = await launchPreviewOnce(siteKey, siteDir);
  if (first.ok) {
    return first.status;
  }

  const cleanErr = stripAnsi(first.rawError);
  if (isRecoverablePreviewError(cleanErr)) {
    killOrphanProcessesForSite(siteKey, siteDir);
    cleanupStalePreviewCaches(siteDir);
    await new Promise((r) => setTimeout(r, 600));

    const freshTmp = join(homeDir(), 'tmp', `${siteKey}-${Date.now()}`);
    const retry = await launchPreviewOnce(siteKey, siteDir, freshTmp);
    if (retry.ok) {
      return retry.status;
    }
    throw new Error(formatFriendlyPreviewError(retry.rawError, true));
  }

  throw new Error(formatFriendlyPreviewError(first.rawError, false));
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
