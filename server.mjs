#!/usr/bin/env node
/**
 * WebDesign Studio 本机服务 (:20190)：托管 React Web 管理台与站点构建/对接/部署 API。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import {
  callDeployToolMcp,
  deployStandaloneSiteViaBridge,
  dispatchToDeployAgent,
  getBridgeContextSafe,
  listDeployAgents,
  listDeployTools,
  openDeployCmsLogin,
} from './server/bridge-client.mjs';
import {
  defaultPort,
  ensureHome,
  pidPath,
  portPath,
  ROOT,
} from './server/paths.mjs';
import {
  generateStage1TaskMarkdown,
  generateStage2TaskMarkdown,
} from './server/platform-spec.mjs';
import {
  auditSiteSeoGeo,
  buildSiteForProduction,
  getSiteDetail,
  inspectSiteCmsContract,
  listSites,
  saveSiteCmsContract,
  startSitePreview,
  stopAllPreviews,
  stopSitePreview,
  upsertSiteProject,
} from './server/site-manager.mjs';

ensureHome();
writeFileSync(pidPath(), String(process.pid), 'utf8');

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
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('仅允许打开 http(s) 链接');
  }
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

async function handleRequest(req, res) {
  const method = req.method || 'GET';
  const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = parsedUrl.pathname;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (pathname === '/health' && method === 'GET') {
    sendJson(res, 200, { ok: true, service: 'cizhenyu-webdesign', pid: process.pid });
    return;
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const [ctx, agentsRes, toolsRes] = await Promise.all([
      getBridgeContextSafe(),
      listDeployAgents(),
      listDeployTools().catch(() => ({ tools: [] })),
    ]);
    const sitesInfo = listSites(ctx?.sitesDir || '');
    sendJson(res, 200, {
      ok: true,
      context: ctx,
      sitesRoot: sitesInfo.sitesRoot.replace(/\\/g, '/'),
      sites: sitesInfo.sites,
      agents: agentsRes.agents || [],
      tools: toolsRes.tools || [],
    });
    return;
  }

  if (pathname === '/api/open-url' && method === 'POST') {
    const body = await readJsonBody(req);
    openExternalUrl(String(body.url || '').trim());
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/api/open-folder' && method === 'POST') {
    const body = await readJsonBody(req);
    const detail = getSiteDetail(body.siteKey);
    openLocalFolder(detail.path);
    sendJson(res, 200, { ok: true, path: detail.path });
    return;
  }

  if (pathname === '/api/cms/open-login' && method === 'POST') {
    const body = await readJsonBody(req);
    const r = await openDeployCmsLogin(String(body.origin || ''));
    sendJson(res, 200, r);
    return;
  }

  if (pathname === '/api/cms/live-schema' && method === 'GET') {
    const siteKey = parsedUrl.searchParams.get('siteKey') || '';
    const [models, collections] = await Promise.all([
      callDeployToolMcp('cmsmcp', 'cms_models_list', {}),
      callDeployToolMcp('cmsmcp', 'cms_collections_list', {
        siteKey: siteKey.replace(/-/g, '_'),
      }),
    ]);
    sendJson(res, 200, {
      ok: true,
      models: models.data?.models || [],
      collections: collections.data?.collections || [],
    });
    return;
  }

  if (pathname === '/api/sites' && method === 'POST') {
    const body = await readJsonBody(req);
    const ctx = await getBridgeContextSafe();
    const out = upsertSiteProject(body, ctx?.sitesDir || '');
    sendJson(res, 200, { ok: true, ...out });
    return;
  }

  const siteMatch = pathname.match(/^\/api\/sites\/([a-zA-Z0-9-_]+)(?:\/([a-z-]+))?$/);
  if (siteMatch) {
    const siteKey = siteMatch[1];
    const subAction = siteMatch[2] || '';
    const ctx = await getBridgeContextSafe();
    const sitesDir = ctx?.sitesDir || '';

    if (!subAction && method === 'GET') {
      sendJson(res, 200, { ok: true, site: getSiteDetail(siteKey, sitesDir) });
      return;
    }

    if (!subAction && method === 'PUT') {
      const body = await readJsonBody(req);
      const out = upsertSiteProject({ ...body, siteKey }, sitesDir);
      sendJson(res, 200, { ok: true, ...out });
      return;
    }

    if (subAction === 'audit' && method === 'GET') {
      sendJson(res, 200, { ok: true, audit: auditSiteSeoGeo(siteKey, sitesDir) });
      return;
    }

    if (subAction === 'contract' && method === 'GET') {
      sendJson(res, 200, { ok: true, contract: inspectSiteCmsContract(siteKey, sitesDir) });
      return;
    }

    if (subAction === 'contract' && method === 'PUT') {
      const body = await readJsonBody(req);
      const contract = saveSiteCmsContract(siteKey, body.collections || [], sitesDir);
      sendJson(res, 200, { ok: true, contract });
      return;
    }

    if (subAction === 'preview-start' && method === 'POST') {
      const preview = await startSitePreview(siteKey, sitesDir);
      sendJson(res, 200, { ok: true, preview });
      return;
    }

    if (subAction === 'preview-stop' && method === 'POST') {
      const preview = stopSitePreview(siteKey);
      sendJson(res, 200, { ok: true, preview });
      return;
    }

    if (subAction === 'dispatch-stage1' && method === 'POST') {
      const body = await readJsonBody(req);
      if (body.brief) {
        upsertSiteProject({ ...body.brief, siteKey }, sitesDir);
      }
      const detail = getSiteDetail(siteKey, sitesDir);
      const taskMd = generateStage1TaskMarkdown(detail.brief, body.extraInstruction || '');
      const toolIds = ['webdesign'];
      if ((detail.brief.referenceUrls || []).length > 0) {
        toolIds.push('firecrawl');
      }
      const dispatch = await dispatchToDeployAgent({
        agentId: body.agentId || 'opencode_agent',
        workspacePath: detail.path,
        toolIds,
        taskFileRel: '.webdesign/TASK.md',
        taskMarkdown: taskMd,
      });
      sendJson(res, 200, {
        ok: true,
        dispatch,
        recommendedPrompt:
          '请阅读项目根目录 AGENTS.md 与 .webdesign/TASK.md，按规范完成当前站点阶段一全静态构建并执行 SEO/GEO 自检。',
      });
      return;
    }

    if (subAction === 'dispatch-stage2' && method === 'POST') {
      const body = await readJsonBody(req);
      const detail = getSiteDetail(siteKey, sitesDir);
      const validation = inspectSiteCmsContract(siteKey, sitesDir);
      if (!validation.valid) {
        sendJson(res, 400, {
          ok: false,
          error: `CMS 字段契约校验未通过：${validation.errors.join('；')}`,
          validation,
        });
        return;
      }
      const cmsOrigin = ctx?.cms?.origin || '';
      const taskMd = generateStage2TaskMarkdown(
        detail.brief,
        validation,
        cmsOrigin,
        body.extraInstruction || ''
      );
      const dispatch = await dispatchToDeployAgent({
        agentId: body.agentId || 'opencode_agent',
        workspacePath: detail.path,
        toolIds: ['webdesign', 'cmsmcp'],
        taskFileRel: '.webdesign/TASK.md',
        taskMarkdown: taskMd,
      });
      sendJson(res, 200, {
        ok: true,
        dispatch,
        recommendedPrompt:
          '请阅读 .webdesign/TASK.md 与 .webdesign/cms-contract.json，用户已批准本次建模对接（可传 confirm=true），请调用 cmsmcp 完成集合创建、初始数据导入并将站点切换至 CMS 动态模式。',
      });
      return;
    }

    if (subAction === 'build' && method === 'POST') {
      const built = await buildSiteForProduction(siteKey, sitesDir);
      sendJson(res, 200, built);
      return;
    }

    if (subAction === 'publish' && method === 'POST') {
      const body = await readJsonBody(req);
      const detail = getSiteDetail(siteKey, sitesDir);
      const built = await buildSiteForProduction(siteKey, sitesDir);
      const deployed = await deployStandaloneSiteViaBridge({
        siteKey: detail.siteKey.replace(/-/g, '_'),
        displayName: detail.displayName,
        distDir: built.distDir,
        domain: body.domain || '',
        projectName: body.projectName || '',
        cmsOrigin: body.cmsOrigin || ctx?.cms?.origin || '',
        syncCmsFrontendSite: detail.dataSource === 'cms',
      });
      sendJson(res, 200, { ok: true, build: built, deploy: deployed });
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
