#!/usr/bin/env node
/**
 * 启停本机 WebDesign Studio 常驻服务（对齐 Deploy tool_service.rs manage.mjs 协议）
 *
 *   node manage.mjs start|stop|status|serve|open
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import {
  ROOT,
  defaultPort,
  ensureHome,
  logPath,
  pidPath,
  portPath,
  resolveNode,
  resolveSystemRoot,
} from './server/paths.mjs';

const cmd = (process.argv[2] || 'status').toLowerCase();

function readPid() {
  if (!existsSync(pidPath())) return null;
  const n = Number(readFileSync(pidPath(), 'utf8').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readPort() {
  if (existsSync(portPath())) {
    const n = Number(readFileSync(portPath(), 'utf8').trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Number(process.env.CIZHENYU_WEBDESIGN_PORT || defaultPort());
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portOpen(port) {
  return new Promise((resolvePort) => {
    const s = createConnection({ host: '127.0.0.1', port }, () => {
      s.end();
      resolvePort(true);
    });
    s.on('error', () => resolvePort(false));
    s.setTimeout(400, () => {
      s.destroy();
      resolvePort(false);
    });
  });
}

async function health(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function cmdStatus() {
  const port = readPort();
  const h = await health(port);
  if (h?.ok) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          running: true,
          port,
          pid: readPid(),
          ui: `http://127.0.0.1:${port}/`,
          ...h,
        },
        null,
        2
      )
    );
    return 0;
  }
  console.log(JSON.stringify({ ok: false, running: false, port, message: 'down' }));
  return 1;
}

async function cmdStart() {
  ensureHome();
  const port = readPort();
  const existing = await health(port);
  if (existing?.ok) {
    console.log(JSON.stringify({ ok: true, running: true, port }));
    return 0;
  }

  mkdirSync(join(ROOT, 'home'), { recursive: true });
  const outFd = openSync(logPath(), 'a');
  const child = spawn(resolveNode(), [join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: {
      ...process.env,
      CIZHENYU_WEBDESIGN_PORT: String(port),
      CIZHENYU_SYSTEM_ROOT: resolveSystemRoot(),
    },
    windowsHide: true,
  });
  child.unref();
  writeFileSync(pidPath(), String(child.pid), 'utf8');
  writeFileSync(portPath(), String(port), 'utf8');

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const h = await health(port);
    if (h?.ok) {
      console.log(JSON.stringify({ ok: true, running: true, port, pid: child.pid }));
      return 0;
    }
    if (!alive(child.pid) && i > 4) break;
  }
  console.error(`error: webdesign service not healthy; see ${logPath()}`);
  return 1;
}

function killPid(pid) {
  if (!pid || !alive(pid)) return false;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}

async function cmdStop() {
  const port = readPort();
  const pid = readPid();
  killPid(pid);
  for (let i = 0; i < 20; i++) {
    if (!(await portOpen(port))) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    unlinkSync(pidPath());
  } catch {
    // ignore
  }
  console.log(JSON.stringify({ ok: true, running: false, port }));
  return 0;
}

function cmdServe() {
  const port = readPort();
  const r = spawnSync(resolveNode(), [join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CIZHENYU_WEBDESIGN_PORT: String(port) },
  });
  return r.status ?? 1;
}

async function cmdOpen() {
  const url = `http://127.0.0.1:${readPort()}/`;
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
  console.log(url);
  return 0;
}

let code = 2;
if (cmd === 'status') code = await cmdStatus();
else if (cmd === 'start') code = await cmdStart();
else if (cmd === 'stop') code = await cmdStop();
else if (cmd === 'serve') code = cmdServe();
else if (cmd === 'open') code = await cmdOpen();
else console.error('usage: node manage.mjs <start|stop|status|serve|open>');

process.exit(code);
