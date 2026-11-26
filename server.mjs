#!/usr/bin/env node
/**
 * WebDesign Studio 极简本机服务 (:20190)：仅负责创建 Astro v7 站点工程、安装依赖、注入 Skills/MCP 并一键拉起 Agent。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import {
  dispatchToDeployAgent,
  getBridgeContextSafe,
  listDeployAgents,
  listDeployTools,
} from './server/bridge-client.mjs';
import {
  codeStamp,
  defaultPort,
  ensureHome,
  pidPath,
  portPath,
  ROOT,
} from './server/paths.mjs';
import {
  reapOrphanPreviewsOnBoot,
} from './server/preview-manager.mjs';
import {
  createSiteProject,
  deleteSiteProject,
  getSiteDetail,
  listSites,
  refreshSiteInjectedAssets,
  startSitePreview,
  stopAllPreviews,
  stopSitePreview,
  triggerSiteNpmInstall,
} from './server/site-manager.mjs';

ensureHome();
writeFileSync(pidPath(), String(process.pid), 'utf8');
// 启动时回收上次软件异常退出遗留的孤儿预览进程
reapOrphanPreviewsOnBoot();
// 启动时记录代码指纹，供 manage.mjs 判断常驻进程是否已过期
const STARTED_CODE_STAMP = codeStamp();

function readJsonBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolveBody({});
      try {
        resolveBody(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function mimeType(file) {
  switch (extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function serveStaticFile(res, urlPath) {
  const publicDir = join(ROOT, 'public');
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const candidate = normalize(join(publicDir, rel));
  if (!candidate.startsWith(publicDir)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }
  const target = existsSync(candidate) ? candidate : join(publicDir, 'index.html');
  if (!existsSync(target)) {
    sendJson(res, 404, { ok: false, error: 'UI assets not built (public/index.html missing)' });
    return;
  }
  res.writeHead(200, { 'Content-Type': mimeType(target) });
  res.end(readFileSync(target));
}

function openExternalUrl(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (process.env.CIZHENYU_NO_BROWSER_OPEN === '1') return;
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function openLocalFolder(folderPath) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [folderPath.replace(/\//g, '\\')], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [folderPath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function resolveInjectableToolIds() {
  const desired = new Set(['webdesign', 'cmsmcp', 'crmmcp']);
  const toolsRes = await listDeployTools();
  const installedIds = new Set();
  for (const t of toolsRes.tools || []) {
    if (t.installed) {
      installedIds.add(t.id);
      if (t.enabled && t.id === 'firecrawl') {
        desired.add('firecrawl');
      }
    }
  }
  // 若 Deploy 在线则仅传已安装的工具 ID，避免缺失工具阻塞注入
  if (installedIds.size > 0) {
    return [...desired].filter((id) => id === 'webdesign' || installedIds.has(id));
  }
  return ['webdesign', 'cmsmcp', 'crmmcp'];
}

async function handleRequest(req, res) {
  const method = req.method || 'GET';
  const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = parsedUrl.pathname;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (pathname === '/health' && method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'cizhenyu-webdesign',
      pid: process.pid,
      codeStamp: STARTED_CODE_STAMP,
    });
    return;
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const [ctx, agentsRes] = await Promise.all([
      getBridgeContextSafe(),
      listDeployAgents(),
    ]);
    const sitesInfo = listSites(ctx?.sitesDir || '');
    sendJson(res, 200, {
      ok: true,
      context: ctx,
      sitesRoot: sitesInfo.sitesRoot.replace(/\\/g, '/'),
      sites: sitesInfo.sites,
      agents: agentsRes.agents || [],
    });
    return;
  }

  if (pathname === '/api/open-folder' && method === 'POST') {
    const body = await readJsonBody(req);
    const ctx = await getBridgeContextSafe();
    const detail = getSiteDetail(body.siteKey, ctx?.sitesDir || '');
    openLocalFolder(detail.path);
    sendJson(res, 200, { ok: true, path: detail.path });
    return;
  }

  if (pathname === '/api/sites' && method === 'POST') {
    const body = await readJsonBody(req);
    const ctx = await getBridgeContextSafe();
    const site = createSiteProject(body, ctx?.sitesDir || '');
    sendJson(res, 200, { ok: true, site });
    return;
  }

  const siteMatch = pathname.match(/^\/api\/sites\/([a-zA-Z0-9-_]+)(?:\/([a-z-]+))?$/);
  if (siteMatch) {
    const siteKey = siteMatch[1];
    const subAction = siteMatch[2] || '';
    const ctx = await getBridgeContextSafe();
    const sitesDir = ctx?.sitesDir || '';

    if (!subAction && method === 'DELETE') {
      const out = deleteSiteProject(siteKey, sitesDir);
      sendJson(res, 200, { ok: true, ...out });
      return;
    }

    if (subAction === 'install' && method === 'POST') {
      triggerSiteNpmInstall(siteKey, sitesDir);
      sendJson(res, 200, { ok: true, site: getSiteDetail(siteKey, sitesDir) });
      return;
    }

    if (subAction === 'preview-start' && method === 'POST') {
      const preview = await startSitePreview(siteKey, sitesDir);
      if (preview?.url) {
        openExternalUrl(preview.url);
      }
      sendJson(res, 200, { ok: true, preview });
      return;
    }

    if (subAction === 'preview-stop' && method === 'POST') {
      const preview = stopSitePreview(siteKey);
      sendJson(res, 200, { ok: true, preview });
      return;
    }

    if (subAction === 'open-agent' && method === 'POST') {
      const body = await readJsonBody(req);
      const detail = refreshSiteInjectedAssets(siteKey, sitesDir);
      const toolIds = await resolveInjectableToolIds();
      const dispatch = await dispatchToDeployAgent({
        agentId: body.agentId || 'opencode_agent',
        workspacePath: detail.path,
        toolIds,
        skillDirs: [join(ROOT, 'skills')],
      });
      sendJson(res, 200, { ok: true, dispatch });
      return;
    }
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { ok: false, error: `Unknown API endpoint: ${pathname}` });
    return;
  }

  serveStaticFile(res, pathname);
}

const port = Number(process.env.CIZHENYU_WEBDESIGN_PORT || defaultPort());
writeFileSync(portPath(), String(port), 'utf8');

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: message });
    }
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`cizhenyu-webdesign listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  stopAllPreviews();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
