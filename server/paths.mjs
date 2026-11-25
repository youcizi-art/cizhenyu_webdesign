/**
 * 路径与运行环境解析：严格区分工具安装目录与用户工作根 `{workRoot}/sites`。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');

export function defaultPort() {
  return 20190;
}

export function homeDir() {
  return join(ROOT, 'home');
}

export function ensureHome() {
  mkdirSync(homeDir(), { recursive: true });
}

export function pidPath() {
  return join(homeDir(), 'service.pid');
}

export function portPath() {
  return join(homeDir(), 'service.port');
}

export function logPath() {
  return join(homeDir(), 'service.log');
}

export function resolveNode() {
  return process.execPath || 'node';
}

export function resolveSystemRoot() {
  const fromEnv = String(process.env.CIZHENYU_SYSTEM_ROOT || '').trim();
  if (fromEnv) return resolve(fromEnv);
  const authDir = String(process.env.CIZHENYU_AUTH_DIR || '').trim();
  if (authDir) return resolve(authDir, '..');
  // 回退：若在 .cizhenyu/scripts/webdesign 下，向上两级即为 .cizhenyu
  const up2 = resolve(ROOT, '..', '..');
  if (existsSync(join(up2, 'scripts')) && existsSync(join(up2, 'credentials'))) {
    return up2;
  }
  return up2;
}

export function resolveCredentialsDir() {
  const fromEnv = String(process.env.CIZHENYU_AUTH_DIR || '').trim();
  if (fromEnv) return resolve(fromEnv);
  return join(resolveSystemRoot(), 'credentials');
}

/**
 * 解析用户可见的站点工程根目录 `{workRoot}/sites`。
 */
export function resolveSitesRoot(bridgeContextSitesDir = '') {
  const testOverride = String(process.env.CIZHENYU_SITES_DIR_OVERRIDE || '').trim();
  if (testOverride) {
    const dir = resolve(testOverride);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  if (bridgeContextSitesDir && String(bridgeContextSitesDir).trim()) {
    const dir = resolve(String(bridgeContextSitesDir).trim());
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const envSites = String(process.env.CIZHENYU_SITES_DIR || '').trim();
  if (envSites) {
    const dir = resolve(envSites);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const envWork = String(process.env.CIZHENYU_WORK_ROOT || '').trim();
  if (envWork) {
    const dir = join(resolve(envWork), 'sites');
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  // 本地独立调试兜底：尝试从 LocalAppData/cizhenyu_deploy/ops/work_root.json 读取用户真实 workRoot
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const stateFile = join(localAppData, 'cizhenyu_deploy', 'ops', 'work_root.json');
    if (existsSync(stateFile)) {
      try {
        const parsed = JSON.parse(readFileSync(stateFile, 'utf8'));
        if (parsed?.workRoot) {
          const dir = join(resolve(parsed.workRoot), 'sites');
          mkdirSync(dir, { recursive: true });
          return dir;
        }
      } catch {
        // ignore
      }
    }
  }
  const fallback = join(resolve(resolveSystemRoot(), '..'), 'cizhenyu', 'sites');
  mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function sanitizeSiteKey(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  if (!cleaned || !/^[a-z][a-z0-9-_]{0,48}$/.test(cleaned)) {
    throw new Error('站点标识 (siteKey) 须以英文字母开头，仅含小写字母、数字、连字符或下划线');
  }
  return cleaned;
}
