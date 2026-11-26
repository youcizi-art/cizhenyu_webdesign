/**
 * 单站本地预览进程管理与异常自愈模块：
 * 1. 将预览进程 PID 持久化到 home/previews.json，软件异常关闭重启后自动清理孤儿进程；
 * 2. 遇到 Windows 下 workerd / miniflare / .wrangler 缓存或临时目录锁冲突（如 CreateDirectory #5 拒绝访问）时，
 *    自动清理锁残留、切换干净临时目录并重试一次，无需用户懂代码手动排查；
 * 3. 剥离终端 ANSI 乱码并将底层错误翻译为通俗中文提示。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
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
 * 清理指定站点目录可能残留的孤儿 astro / workerd 进程（防止软件异常关闭后文件句柄仍被锁住）。
 */
function killOrphanProcessesForSite(siteKey, siteDir) {
  const persisted = readPersistedPreviews();
  if (persisted[siteKey]?.pid) {
    killPidTree(persisted[siteKey].pid);
    removePreviewPid(siteKey);
  }

  if (process.platform === 'win32' && siteDir) {
    // 精确匹配命令行包含当前站点绝对路径的 astro/workerd 进程，绝不误杀其它站点或宿主软件
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
 * 服务启动时调用：回收上次软件异常退出遗留的所有本地预览孤儿进程。
 */
export function reapOrphanPreviewsOnBoot() {
  const persisted = readPersistedPreviews();
  const keys = Object.keys(persisted);
  if (keys.length === 0) return;
  for (const key of keys) {
    const entry = persisted[key];
    if (entry?.pid) {
      killPidTree(entry.pid);
    }
  }
  writePersistedPreviews({});
}

function canBindPort(port, host) {
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
    srv.listen(port, host);
  });
}

async function findFreePort(startPort = 4321) {
  for (let port = startPort; port <= startPort + 50; port++) {
    if ((await canBindPort(port, '127.0.0.1')) && (await canBindPort(port, '::1'))) {
      return port;
    }
  }
  throw new Error('本机 4321-4371 预览端口均被占用，请关闭部分本地服务后重试');
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
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
      ? '本地预览运行时缓存目录被系统或安全软件临时锁定（工具已自动清理残留进程与缓存并重试一次，仍未解除）。请稍等 3 秒再点「预览」，或检查杀毒软件是否拦截了 workerd.exe。'
      : '本地预览运行时临时目录权限冲突，正在自动清理修复…';
  }
  if (/EADDRINUSE/i.test(clean)) {
    return '预览端口刚被其他程序占用，请重新点击「预览」以自动分配新端口。';
  }
  if (/Cannot find module|ERR_MODULE_NOT_FOUND/i.test(clean)) {
    return '站点依赖不完整，请先点击「安装依赖」后再启动预览。';
  }
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim().length > 0) || '请检查站点代码是否有语法错误';
  return `本地预览启动失败：${firstLine.slice(0, 180)}`;
}

function cleanupStalePreviewCaches(siteDir) {
  const targets = [
    join(siteDir, '.wrangler', 'state'),
    join(siteDir, 'node_modules', '.vite'),
  ];
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
  const port = await findFreePort(4321);
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npm';
  const args = isWin
    ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${port}`]
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)];

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
  const appendTail = (chunk) => {
    outputTail = (outputTail + chunk.toString()).slice(-2400);
  };
  child.stdout?.on('data', appendTail);
  child.stderr?.on('data', appendTail);

  const url = `http://127.0.0.1:${port}/`;
  const pid = child.pid || 0;
  previewJobs.set(siteKey, { pid, port, url, siteDir, child });
  recordPreviewPid(siteKey, pid, port, siteDir);

  child.on('exit', () => {
    if (previewJobs.get(siteKey)?.child === child) {
      previewJobs.delete(siteKey);
      removePreviewPid(siteKey);
    }
  });

  // 等待 Astro dev 服务器真正监听并可响应页面请求（最长约 18 秒）
  for (let i = 0; i < 45; i++) {
    if (!previewJobs.has(siteKey)) {
      return { ok: false, rawError: outputTail };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.status < 500) {
        return { ok: true, status: getPreviewStatus(siteKey) };
      }
      // 500 常见于 workerd 启动崩溃并把异常打到 stderr，稍等捕获完整日志
      if (isRecoverablePreviewError(stripAnsi(outputTail))) {
        stopSitePreview(siteKey);
        return { ok: false, rawError: outputTail };
      }
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  stopSitePreview(siteKey);
  return { ok: false, rawError: outputTail || `端口 ${port} 启动超时` };
}

export function getPreviewStatus(siteKeyRaw) {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const item = previewJobs.get(siteKey);
  if (!item) {
    return { running: false, port: null, url: null };
  }
  return { running: true, port: item.port, url: item.url };
}

/**
 * 启动站点本地预览（内置孤儿进程回收 + workerd/缓存冲突自动修复重试）。
 */
export async function startPreviewForSite(siteKey, siteDir) {
  const existing = previewJobs.get(siteKey);
  if (existing) {
    return getPreviewStatus(siteKey);
  }
  if (!existsSync(join(siteDir, 'node_modules', 'astro'))) {
    throw new Error('站点依赖尚未安装完成，请等待「依赖已就绪」后再启动预览');
  }

  // 首次启动前先回收可能因上次软件异常关闭留下的孤儿进程
  killOrphanProcessesForSite(siteKey, siteDir);

  const first = await launchPreviewOnce(siteKey, siteDir);
  if (first.ok) {
    return first.status;
  }

  const cleanErr = stripAnsi(first.rawError);
  if (isRecoverablePreviewError(cleanErr)) {
    // 自动自愈：彻底终止残留进程树 + 清理 .wrangler/state 与 .vite 缓存 + 分配全新隔离临时目录后重试
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
  } else {
    const persisted = readPersistedPreviews();
    if (persisted[siteKey]?.pid) {
      killPidTree(persisted[siteKey].pid);
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
