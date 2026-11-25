/**
 * 运行时环境变量读取：优先 Cloudflare Workers/Pages runtime env，其次 import.meta.env。
 */
import siteConfig from '@/data/site.config.json';

type EnvMap = Record<string, unknown>;

let cachedCfEnv: EnvMap | null | undefined;

async function loadCloudflareEnv(): Promise<EnvMap | null> {
  if (cachedCfEnv !== undefined) return cachedCfEnv;
  try {
    const mod = await import('cloudflare:workers');
    const env = (mod as { env?: EnvMap }).env;
    cachedCfEnv = env && typeof env === 'object' ? env : null;
  } catch {
    cachedCfEnv = null;
  }
  return cachedCfEnv;
}

function fromImportMeta(name: string): string {
  const bag = import.meta.env as Record<string, unknown>;
  const val = bag?.[name];
  return val == null ? '' : String(val).trim();
}

export async function warmRuntimeEnv(): Promise<void> {
  await loadCloudflareEnv();
}

export function envSync(name: string): string {
  if (cachedCfEnv && typeof cachedCfEnv[name] === 'string') {
    return String(cachedCfEnv[name]).trim();
  }
  return fromImportMeta(name);
}

export async function envAsync(name: string): Promise<string> {
  const cf = await loadCloudflareEnv();
  if (cf && typeof cf[name] === 'string') {
    const val = String(cf[name]).trim();
    if (val) return val;
  }
  return fromImportMeta(name);
}

export async function getCloudflareEnv(): Promise<EnvMap | null> {
  return loadCloudflareEnv();
}

export function getSiteConfig() {
  return siteConfig;
}

export function getSiteKey(): string {
  return envSync('SITE_KEY') || siteConfig.siteKey || 'demo';
}

export function getSiteOrigin(fallbackOrigin = ''): string {
  const raw = envSync('PUBLIC_SITE_URL') || siteConfig.siteOrigin || fallbackOrigin;
  return raw.replace(/\/$/, '').trim();
}

/**
 * 判断当前数据源模式：环境变量 PUBLIC_DATA_SOURCE 优先，否则读 site.config.json。
 */
export function getDataSourceMode(): 'mock' | 'cms' {
  const override = envSync('PUBLIC_DATA_SOURCE').toLowerCase();
  if (override === 'cms' || override === 'mock') return override;
  return siteConfig.dataSource === 'cms' ? 'cms' : 'mock';
}
