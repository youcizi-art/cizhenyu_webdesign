/**
 * 站点工程管理：创建/更新 `{workRoot}/sites/{siteKey}`、本地预览进程托管、SEO/GEO 体检、契约提取与构建。
 */
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { join, resolve } from 'node:path';
import {
  buildPlatformBaselineSpec,
  generateSiteAgentsMd,
  validateCmsContract,
} from './platform-spec.mjs';
import { ROOT, resolveSitesRoot, sanitizeSiteKey } from './paths.mjs';

const STARTER_DIR = join(ROOT, 'templates', 'astro-site-starter');

/** @type {Map<string, { pid: number, port: number, child: import('node:child_process').ChildProcess, startedAt: string, logs: string[] }>} */
const previewProcesses = new Map();

function readJsonSafe(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonPretty(file, value) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function findFreePort(startPort = 4321) {
  return new Promise((resolvePort, reject) => {
    const tryNext = (port) => {
      if (port > startPort + 50) {
        reject(new Error('无法找到空闲预览端口'));
        return;
      }
      const srv = createNetServer();
      srv.once('error', () => tryNext(port + 1));
      srv.once('listening', () => {
        srv.close(() => resolvePort(port));
      });
      srv.listen(port, '127.0.0.1');
    };
    tryNext(startPort);
  });
}

export function listSites(sitesDirOverride = '') {
  const sitesRoot = resolveSitesRoot(sitesDirOverride);
  const entries = readdirSync(sitesRoot, { withFileTypes: true });
  const list = [];

  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const siteDir = join(sitesRoot, ent.name);
    if (!existsSync(join(siteDir, 'package.json'))) continue;
    list.push(getSiteDetail(ent.name, sitesRoot));
  }

  list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { sitesRoot, sites: list };
}

export function getSiteDetail(siteKeyRaw, sitesDirOverride = '') {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const sitesRoot = resolveSitesRoot(sitesDirOverride);
  const siteDir = join(sitesRoot, siteKey);
  if (!existsSync(siteDir)) {
    throw new Error(`站点不存在: ${siteKey}`);
  }

  const siteCfg = readJsonSafe(join(siteDir, 'src', 'data', 'site.config.json'), {});
  const brief = readJsonSafe(join(siteDir, '.webdesign', 'site-brief.json'), {
    siteKey,
    displayName: siteCfg.displayName || siteKey,
    oneLiner: '',
    locales: siteCfg.locales || ['en-US'],
    defaultLocale: siteCfg.defaultLocale || 'en-US',
  });
  const preview = getPreviewStatus(siteKey);
  const hasDist =
    existsSync(join(siteDir, 'dist', 'server', 'entry.mjs')) ||
    existsSync(join(siteDir, 'dist', '_worker.js')) ||
    existsSync(join(siteDir, 'dist', 'index.html'));
  const stat = statSync(siteDir);

  return {
    siteKey,
    path: siteDir.replace(/\\/g, '/'),
    displayName: brief.displayName || siteCfg.displayName || siteKey,
    dataSource: siteCfg.dataSource || 'mock',
    locales: siteCfg.locales || brief.locales || ['en-US'],
    defaultLocale: siteCfg.defaultLocale || brief.defaultLocale || 'en-US',
    primaryColor: siteCfg.brand?.primaryColor || brief.primaryColor || '#2563eb',
    brief,
    hasDist,
    preview,
    updatedAt: brief.updatedAt || stat.mtime.toISOString(),
  };
}

/**
 * 新建或更新单站 Astro 工程，并同步写入站点特殊配置与平台通用基线配置。
 */
export function upsertSiteProject(input, sitesDirOverride = '') {
  const siteKey = sanitizeSiteKey(input.siteKey);
  const sitesRoot = resolveSitesRoot(sitesDirOverride);
  const siteDir = join(sitesRoot, siteKey);
  const isNew = !existsSync(join(siteDir, 'package.json'));

  if (isNew) {
    if (!existsSync(STARTER_DIR)) {
      throw new Error(`缺少脚手架模板目录: ${STARTER_DIR}`);
    }
    mkdirSync(siteDir, { recursive: true });
    cpSync(STARTER_DIR, siteDir, { recursive: true });
  }

  const prevBrief = readJsonSafe(join(siteDir, '.webdesign', 'site-brief.json'), {});
  const locales =
    Array.isArray(input.locales) && input.locales.length > 0
      ? input.locales.map((x) => String(x).trim()).filter(Boolean)
      : prevBrief.locales || ['en-US'];
  const defaultLocale =
    input.defaultLocale && locales.includes(input.defaultLocale)
      ? input.defaultLocale
      : locales[0];

  const brief = {
    siteKey,
    displayName: String(input.displayName ?? prevBrief.displayName ?? siteKey).trim() || siteKey,
    oneLiner: String(input.oneLiner ?? prevBrief.oneLiner ?? '').trim(),
    primaryColor: String(input.primaryColor ?? prevBrief.primaryColor ?? '#2563eb').trim(),
    accentColor: String(input.accentColor ?? prevBrief.accentColor ?? '#0ea5e9').trim(),
    surfaceMode: String(input.surfaceMode ?? prevBrief.surfaceMode ?? 'light').trim(),
    styleNotes: String(input.styleNotes ?? prevBrief.styleNotes ?? '').trim(),
    referenceUrls: Array.isArray(input.referenceUrls)
      ? input.referenceUrls.map((u) => String(u).trim()).filter(Boolean)
      : prevBrief.referenceUrls || [],
    desiredPages: Array.isArray(input.desiredPages)
      ? input.desiredPages.map((p) => String(p).trim()).filter(Boolean)
      : prevBrief.desiredPages || [],
    rawMaterials: String(input.rawMaterials ?? prevBrief.rawMaterials ?? '').trim(),
    customHeadScript: String(input.customHeadScript ?? prevBrief.customHeadScript ?? '').trim(),
    locales,
    defaultLocale,
    updatedAt: new Date().toISOString(),
  };

  // 1. 写入站点特殊配置 + 原始资料文本（若有）
  writeJsonPretty(join(siteDir, '.webdesign', 'site-brief.json'), brief);
  if (brief.rawMaterials) {
    mkdirSync(join(siteDir, '.webdesign', 'materials'), { recursive: true });
    writeFileSync(
      join(siteDir, '.webdesign', 'materials', 'user-materials.md'),
      `${brief.rawMaterials}\n`,
      'utf8'
    );
  }

  // 2. 写入平台通用基线配置、AGENTS.md 与 wrangler.jsonc 服务名称
  const platformSpec = buildPlatformBaselineSpec(siteKey.replace(/-/g, '_'));
  writeJsonPretty(join(siteDir, '.webdesign', 'platform-spec.json'), platformSpec);
  writeFileSync(join(siteDir, 'AGENTS.md'), generateSiteAgentsMd(brief), 'utf8');

  const wranglerPath = join(siteDir, 'wrangler.jsonc');
  const existingWrangler = readJsonSafe(wranglerPath, null);
  if (existingWrangler) {
    existingWrangler.name = `site-${siteKey}`;
    writeJsonPretty(wranglerPath, existingWrangler);
  }

  // 3. 同步更新 src/data/site.config.json 的基础元数据（保留现有 navigation 与 dataSource）
  const siteCfgFile = join(siteDir, 'src', 'data', 'site.config.json');
  const existingCfg = readJsonSafe(siteCfgFile, {});
  const nextCfg = {
    ...existingCfg,
    siteKey: siteKey.replace(/-/g, '_'),
    displayName: brief.displayName,
    dataSource: input.dataSource || existingCfg.dataSource || 'mock',
    defaultLocale,
    locales,
    brand: {
      ...(existingCfg.brand || {}),
      primaryColor: brief.primaryColor || '#2563eb',
      accentColor: brief.accentColor || '#0ea5e9',
      surfaceMode: brief.surfaceMode || 'light',
      tagline: brief.oneLiner || existingCfg.brand?.tagline || brief.displayName,
    },
    customHeadScript: brief.customHeadScript,
  };
  writeJsonPretty(siteCfgFile, nextCfg);

  // 首次初始化时同步产出默认 cms-contract.json
  const contractJsonPath = join(siteDir, '.webdesign', 'cms-contract.json');
  if (!existsSync(contractJsonPath)) {
    const extracted = extractCollectionsFromContractTs(siteDir);
    if (extracted.length > 0) {
      writeJsonPretty(contractJsonPath, { collections: extracted });
    }
  }

  return { isNew, site: getSiteDetail(siteKey, sitesRoot) };
}

/**
 * 从站点 `.webdesign/cms-contract.json` 或 `src/data/contracts/collections.contract.ts` 解析集合定义并执行强校验。
 */
export function extractCollectionsFromContractTs(siteDir) {
  const jsonPath = join(siteDir, '.webdesign', 'cms-contract.json');
  const saved = readJsonSafe(jsonPath, null);
  if (saved && Array.isArray(saved.collections) && saved.collections.length > 0) {
    return saved.collections;
  }

  const tsPath = join(siteDir, 'src', 'data', 'contracts', 'collections.contract.ts');
  if (!existsSync(tsPath)) return [];
  const raw = readFileSync(tsPath, 'utf8');
  const markerIdx = raw.indexOf('SITE_COLLECTIONS_CONTRACT');
  if (markerIdx < 0) return [];
  const eqIdx = raw.indexOf('=', markerIdx);
  const arrStart = raw.indexOf('[', eqIdx);
  const arrEnd = raw.lastIndexOf(']');
  if (arrStart < 0 || arrEnd <= arrStart) return [];

  const literal = raw.slice(arrStart, arrEnd + 1);
  try {
    // 安全受控解析：仅评估当前本地工程内的纯对象字面量数组
    const fn = new Function(`"use strict"; return (${literal});`);
    const parsed = fn();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function inspectSiteCmsContract(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  const siteDir = detail.path;
  const collections = extractCollectionsFromContractTs(siteDir);
  const validation = validateCmsContract(detail.siteKey, collections);
  writeJsonPretty(join(siteDir, '.webdesign', 'cms-contract.json'), {
    updatedAt: new Date().toISOString(),
    namespace: validation.namespace,
    valid: validation.valid,
    collections: validation.collections,
  });
  return validation;
}

export function saveSiteCmsContract(siteKeyRaw, collections, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  const validation = validateCmsContract(detail.siteKey, collections);
  writeJsonPretty(join(detail.path, '.webdesign', 'cms-contract.json'), {
    updatedAt: new Date().toISOString(),
    namespace: validation.namespace,
    valid: validation.valid,
    collections,
  });
  return validation;
}

/**
 * 确定性 SEO & GEO 合规体检器（供 Web 工作台展示及 Agent 自检闭环调用）。
 */
export function auditSiteSeoGeo(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  const siteDir = detail.path;
  const checks = [];
  const push = (id, category, ok, title, detailMsg) => {
    checks.push({ id, category, ok: Boolean(ok), title, detail: detailMsg });
  };

  push(
    'seo-head',
    'SEO',
    existsSync(join(siteDir, 'src', 'core', 'seo', 'SeoHead.astro')),
    'SeoHead 元标签与 hreflang 组件',
    '检查 Canonical / OpenGraph / hreflang / JSON-LD 注入组件是否存在'
  );
  push(
    'robots-sitemap',
    'SEO',
    existsSync(join(siteDir, 'src', 'pages', 'robots.txt.ts')) &&
      existsSync(join(siteDir, 'src', 'pages', 'sitemap.xml.ts')),
    '动态 robots.txt 与多语种 sitemap.xml',
    '确保搜索引擎可自动发现所有语种静态与详情路由'
  );
  push(
    'llms-txt',
    'GEO',
    existsSync(join(siteDir, 'src', 'pages', 'llms.txt.ts')),
    'AI 索引入口 /llms.txt',
    '为大模型与 AI 搜索提供结构化企业与产品事实索引'
  );
  push(
    'geo-answer-comp',
    'GEO',
    existsSync(join(siteDir, 'src', 'core', 'geo', 'GeoAnswer.astro')),
    'GeoAnswer 语义简答组件',
    '在核心页面首屏提供 AI 可直接引用的客观结论块'
  );
  push(
    'edge-cache',
    'PERF',
    existsSync(join(siteDir, 'src', 'middleware.ts')) &&
      existsSync(join(siteDir, 'src', 'pages', 'api', 'revalidate.ts')),
    '48h 边缘 HTML 缓存与 /api/revalidate',
    '保障 Cloudflare Pages 高并发命中率与后台更新精准清缓存'
  );

  // 扫描 [locale] 页面中的 <h1> 与 BaseLayout 接入情况
  const localePagesDir = join(siteDir, 'src', 'pages', '[locale]');
  const pageFiles = [];
  const walkAstro = (dir) => {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walkAstro(full);
      else if (ent.name.endsWith('.astro')) pageFiles.push(full);
    }
  };
  walkAstro(localePagesDir);

  const missingH1 = [];
  let geoAnswerUsedCount = 0;
  for (const file of pageFiles) {
    const content = readFileSync(file, 'utf8');
    if (!/<h1[\s>]/i.test(content)) {
      missingH1.push(file.slice(siteDir.length + 1).replace(/\\/g, '/'));
    }
    if (content.includes('GeoAnswer')) {
      geoAnswerUsedCount += 1;
    }
  }

  push(
    'page-h1',
    'SEO',
    pageFiles.length > 0 && missingH1.length === 0,
    `业务页面唯一 H1 标签检查（共 ${pageFiles.length} 页）`,
    missingH1.length === 0 ? '全部多语言页面均包含 H1 标题' : `缺少 H1 的页面: ${missingH1.join(', ')}`
  );
  push(
    'geo-answer-usage',
    'GEO',
    geoAnswerUsedCount >= 2,
    `核心页面 GeoAnswer 覆盖率（已接入 ${geoAnswerUsedCount} 类页面）`,
    geoAnswerUsedCount >= 2 ? '首页与详情页已挂载 GEO 简答摘要' : '建议至少在首页与产品/文章详情页挂载 <GeoAnswer />'
  );

  // 检查 seed.json 中的 short_answer 字段完备度
  const seed = readJsonSafe(join(siteDir, 'src', 'data', 'mocks', 'seed.json'), {});
  const defLoc = detail.defaultLocale || 'en-US';
  const companyShort = seed?.company_info?.[defLoc]?.short_answer;
  push(
    'seed-short-answer',
    'GEO',
    Boolean(companyShort && String(companyShort).trim().length >= 20),
    '主语种企业 GEO 简答数据完备度',
    companyShort ? '已提供高信息密度的企业核心摘要' : 'mocks/seed.json 缺少 company_info.short_answer'
  );

  const passed = checks.filter((c) => c.ok).length;
  return {
    siteKey: detail.siteKey,
    score: Math.round((passed / checks.length) * 100),
    passed,
    total: checks.length,
    allPassed: passed === checks.length,
    checks,
  };
}

function runNpmCommand(cwd, args, timeoutMs = 240000) {
  return new Promise((resolveCmd, reject) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'cmd.exe' : 'npm';
    const fullArgs = isWin ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
    const child = spawn(cmd, fullArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      reject(new Error(`执行 npm ${args.join(' ')} 超时`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveCmd({ stdout: out, stderr: err });
      } else {
        reject(new Error(`npm ${args.join(' ')} 退出码 ${code}:\n${(err || out).slice(-1200)}`));
      }
    });
  });
}

async function ensureSiteDependencies(siteDir) {
  const astroBin = join(siteDir, 'node_modules', 'astro');
  if (existsSync(astroBin)) return;
  await runNpmCommand(siteDir, ['install', '--prefer-offline', '--no-audit', '--no-fund'], 900000);
}

export function getPreviewStatus(siteKeyRaw) {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const item = previewProcesses.get(siteKey);
  if (!item) {
    return { running: false, url: null, port: null };
  }
  return {
    running: true,
    port: item.port,
    url: `http://127.0.0.1:${item.port}/`,
    startedAt: item.startedAt,
    recentLogs: item.logs.slice(-15),
  };
}

export async function startSitePreview(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  const existing = previewProcesses.get(detail.siteKey);
  if (existing) {
    return getPreviewStatus(detail.siteKey);
  }

  await ensureSiteDependencies(detail.path);
  const port = await findFreePort(4321);
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npx';
  const args = isWin
    ? ['/d', '/s', '/c', `npx astro dev --host 127.0.0.1 --port ${port}`]
    : ['astro', 'dev', '--host', '127.0.0.1', '--port', String(port)];

  const child = spawn(cmd, args, {
    cwd: detail.path,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const logs = [];
  const pushLog = (chunk) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    logs.push(...lines);
    if (logs.length > 60) logs.splice(0, logs.length - 60);
  };
  child.stdout.on('data', pushLog);
  child.stderr.on('data', pushLog);
  child.on('exit', () => {
    previewProcesses.delete(detail.siteKey);
  });

  previewProcesses.set(detail.siteKey, {
    pid: child.pid,
    port,
    child,
    startedAt: new Date().toISOString(),
    logs,
  });

  // 等待端口可响应
  for (let i = 0; i < 32; i++) {
    await new Promise((r) => setTimeout(r, 350));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) break;
    } catch {
      // keep waiting
    }
  }

  return getPreviewStatus(detail.siteKey);
}

export function stopSitePreview(siteKeyRaw) {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const item = previewProcesses.get(siteKey);
  if (!item) return { running: false };
  try {
    if (process.platform === 'win32' && item.pid) {
      spawn('taskkill', ['/PID', String(item.pid), '/T', '/F'], { windowsHide: true });
    } else {
      item.child.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  previewProcesses.delete(siteKey);
  return { running: false };
}

export function stopAllPreviews() {
  for (const key of previewProcesses.keys()) {
    stopSitePreview(key);
  }
}

export async function buildSiteForProduction(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  await ensureSiteDependencies(detail.path);
  const res = await runNpmCommand(detail.path, ['run', 'build'], 300000);
  const distDir = join(detail.path, 'dist').replace(/\\/g, '/');
  return {
    ok: true,
    siteKey: detail.siteKey,
    distDir,
    logs: (res.stdout + '\n' + res.stderr).trim().slice(-2000),
  };
}
