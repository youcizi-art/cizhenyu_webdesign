/**
 * 站点工程管理：创建 `{workRoot}/sites/<siteKey>`、注入 Skills、异步安装依赖、SEO/GEO 体检、集合契约校验与生产构建。
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { generateSiteAgentsMd, validateCmsContract } from './platform-spec.mjs';
import { ROOT, resolveSitesRoot, sanitizeSiteKey } from './paths.mjs';
import {
  getPreviewStatus,
  startPreviewForSite,
  stopAllPreviews,
  stopSitePreview,
} from './preview-manager.mjs';

export { getPreviewStatus, stopAllPreviews, stopSitePreview };

const STARTER_DIR = join(ROOT, 'templates', 'astro-site-starter');
const SKILLS_SRC_DIR = join(ROOT, 'skills');

const AGENT_SKILL_REL_DIRS = [
  join('.agents', 'skills'),
  join('.opencode', 'skill'),
  join('.cursor', 'skills'),
  join('.claude', 'skills'),
];

/** @type {Map<string, { state: 'installing' | 'error', startedAt: string, error?: string, child?: import('node:child_process').ChildProcess }>} */
const installJobs = new Map();

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

function syncSkillsIntoSite(siteDir) {
  if (!existsSync(SKILLS_SRC_DIR)) return;
  const skillEntries = readdirSync(SKILLS_SRC_DIR, { withFileTypes: true }).filter((e) =>
    e.isDirectory()
  );
  for (const relTarget of AGENT_SKILL_REL_DIRS) {
    const destBase = join(siteDir, relTarget);
    mkdirSync(destBase, { recursive: true });
    for (const sk of skillEntries) {
      cpSync(join(SKILLS_SRC_DIR, sk.name), join(destBase, sk.name), { recursive: true });
    }
  }
}

function runNpmCommand(cwd, args, timeoutMs = 900000, onSpawn = undefined) {
  return new Promise((resolveCmd, reject) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'cmd.exe' : 'npm';
    const fullArgs = isWin ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
    const child = spawn(cmd, fullArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (onSpawn) onSpawn(child);
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
        reject(new Error(`npm ${args.join(' ')} 退出码 ${code}:\n${(err || out).slice(-800)}`));
      }
    });
  });
}

export function triggerSiteNpmInstall(siteKeyRaw, sitesDirOverride = '') {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const sitesRoot = resolveSitesRoot(sitesDirOverride);
  const siteDir = join(sitesRoot, siteKey);
  if (!existsSync(join(siteDir, 'package.json'))) {
    throw new Error(`站点不存在: ${siteKey}`);
  }
  const current = installJobs.get(siteKey);
  if (current?.state === 'installing') {
    return;
  }

  installJobs.set(siteKey, {
    state: 'installing',
    startedAt: new Date().toISOString(),
  });

  runNpmCommand(
    siteDir,
    ['install', '--prefer-offline', '--no-audit', '--no-fund'],
    900000,
    (child) => {
      const job = installJobs.get(siteKey);
      if (job) job.child = child;
    }
  )
    .then(() => {
      installJobs.delete(siteKey);
    })
    .catch((err) => {
      // 删除站点时主动终止安装会走到这里，此时任务已被移除，无需再记录错误
      if (!installJobs.has(siteKey)) return;
      installJobs.set(siteKey, {
        state: 'error',
        startedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/** 终止站点正在进行的依赖安装进程树，避免 Windows 下目录被占用而无法删除。 */
function killInstallJob(siteKey) {
  const job = installJobs.get(siteKey);
  installJobs.delete(siteKey);
  const pid = job?.child?.pid;
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      job.child.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
}

function getInstallStatus(siteKey, siteDir) {
  const job = installJobs.get(siteKey);
  if (job?.state === 'installing') {
    return { status: 'installing', error: null };
  }
  if (existsSync(join(siteDir, 'node_modules', 'astro'))) {
    return { status: 'ready', error: null };
  }
  if (job?.state === 'error') {
    return { status: 'error', error: job.error || '依赖安装失败' };
  }
  return { status: 'pending', error: null };
}

export function getSiteDetail(siteKeyRaw, sitesDirOverride = '') {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const sitesRoot = resolveSitesRoot(sitesDirOverride);
  const siteDir = join(sitesRoot, siteKey);
  if (!existsSync(siteDir)) {
    throw new Error(`站点不存在: ${siteKey}`);
  }

  const siteCfg = readJsonSafe(join(siteDir, 'src', 'data', 'site.config.json'), {});
  const install = getInstallStatus(siteKey, siteDir);
  const preview = getPreviewStatus(siteKey);
  const hasDist =
    existsSync(join(siteDir, 'dist', 'server', 'entry.mjs')) ||
    existsSync(join(siteDir, 'dist', '_worker.js')) ||
    existsSync(join(siteDir, 'dist', 'index.html'));
  const stat = statSync(siteDir);

  return {
    siteKey,
    namespace: siteKey.replace(/-/g, '_'),
    path: siteDir.replace(/\\/g, '/'),
    displayName: siteCfg.displayName || siteKey,
    dataSource: siteCfg.dataSource || 'mock',
    locales: siteCfg.locales || ['en-US', 'zh-CN'],
    defaultLocale: siteCfg.defaultLocale || 'en-US',
    installStatus: install.status,
    installError: install.error,
    preview,
    hasDist,
    updatedAt: stat.mtime.toISOString(),
  };
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

/**
 * 在 `{workRoot}/sites/<siteKey>` 创建新站点：移入 Astro v7 基础代码、注入 Skills/AGENTS.md，并启动后台依赖安装。
 */
export function createSiteProject(input, sitesDirOverride = '') {
  const siteKey = sanitizeSiteKey(input.siteKey);
  const sitesRoot = resolveSitesRoot(sitesDirOverride);
  const siteDir = join(sitesRoot, siteKey);

  if (existsSync(join(siteDir, 'package.json'))) {
    throw new Error(`站点 "${siteKey}" 已存在，请直接点击「用 Agent 打开」`);
  }
  if (!existsSync(STARTER_DIR)) {
    throw new Error(`缺少 Astro 基础工程模板: ${STARTER_DIR}`);
  }

  mkdirSync(siteDir, { recursive: true });
  cpSync(STARTER_DIR, siteDir, { recursive: true });

  const displayName = String(input.displayName || '').trim() || siteKey;
  const ns = siteKey.replace(/-/g, '_');

  const siteCfgFile = join(siteDir, 'src', 'data', 'site.config.json');
  const existingCfg = readJsonSafe(siteCfgFile, {});
  writeJsonPretty(siteCfgFile, {
    ...existingCfg,
    siteKey: ns,
    displayName,
    dataSource: 'mock',
  });

  const wranglerPath = join(siteDir, 'wrangler.jsonc');
  const existingWrangler = readJsonSafe(wranglerPath, null);
  if (existingWrangler) {
    existingWrangler.name = `site-${siteKey}`;
    writeJsonPretty(wranglerPath, existingWrangler);
  }

  writeFileSync(join(siteDir, 'AGENTS.md'), generateSiteAgentsMd(siteKey, displayName), 'utf8');
  syncSkillsIntoSite(siteDir);
  triggerSiteNpmInstall(siteKey, sitesRoot);

  return getSiteDetail(siteKey, sitesRoot);
}

/**
 * 刷新已有站点的 Skills 与 AGENTS.md（打开 Agent 前调用，确保老站点也能获得最新规范）。
 */
export function refreshSiteInjectedAssets(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  syncSkillsIntoSite(detail.path);
  const agentsMdPath = join(detail.path, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) {
    writeFileSync(agentsMdPath, generateSiteAgentsMd(detail.siteKey, detail.displayName), 'utf8');
  }
  return detail;
}

export function deleteSiteProject(siteKeyRaw, sitesDirOverride = '') {
  const siteKey = sanitizeSiteKey(siteKeyRaw);
  const sitesRoot = resolve(resolveSitesRoot(sitesDirOverride));
  const siteDir = resolve(join(sitesRoot, siteKey));
  if (!siteDir.startsWith(sitesRoot) || siteDir === sitesRoot) {
    throw new Error('非法的站点目录路径');
  }
  if (!existsSync(siteDir)) {
    throw new Error(`站点不存在: ${siteKey}`);
  }
  killInstallJob(siteKey);
  stopSitePreview(siteKey);
  rmSync(siteDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  return { deleted: siteKey };
}

export function extractCollectionsFromContractTs(siteDir) {
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
    const fn = new Function(`"use strict"; return (${literal});`);
    const parsed = fn();
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function inspectSiteCmsContract(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  const collections = extractCollectionsFromContractTs(detail.path);
  return validateCmsContract(detail.siteKey, collections);
}

/**
 * 确定性 SEO & GEO 合规体检器（供 Agent 在对话开发与上线前调用）。
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
    '保障 Cloudflare 高并发命中率与后台更新精准清缓存'
  );

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
    geoAnswerUsedCount >= 2 ? '首页与详情页已挂载 GEO 简答摘要' : '建议至少在首页与详情页挂载 <GeoAnswer />'
  );

  const companySeed = readJsonSafe(join(siteDir, 'seed', 'company_info.json'), {});
  const defLoc = detail.defaultLocale || 'en-US';
  const firstLocales = companySeed?.items?.[0]?.locales || {};
  const companyRow = firstLocales[defLoc] || Object.values(firstLocales)[0] || {};
  const companyShort = companyRow?.short_answer;
  push(
    'seed-short-answer',
    'GEO',
    Boolean(companyShort && String(companyShort).trim().length >= 20),
    'seed/company_info.json 企业 GEO 简答完备度',
    companyShort ? '已提供高信息密度的企业核心摘要' : 'seed/company_info.json 缺少 short_answer'
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

/**
 * 启动站点本地预览服务（委托给 preview-manager，内置孤儿回收与异常自愈）。
 */
export async function startSitePreview(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  return startPreviewForSite(detail.siteKey, detail.path);
}

export async function buildSiteForProduction(siteKeyRaw, sitesDirOverride = '') {
  const detail = getSiteDetail(siteKeyRaw, sitesDirOverride);
  if (!existsSync(join(detail.path, 'node_modules', 'astro'))) {
    await runNpmCommand(
      detail.path,
      ['install', '--prefer-offline', '--no-audit', '--no-fund'],
      900000
    );
  }
  const res = await runNpmCommand(detail.path, ['run', 'build'], 300000);
  const distDir = join(detail.path, 'dist').replace(/\\/g, '/');
  return {
    ok: true,
    siteKey: detail.siteKey,
    distDir,
    logs: (res.stdout + '\n' + res.stderr).trim().slice(-2000),
  };
}
