/**
 * 边缘 HTML 长缓存（默认 48 小时）+ Worker Cache API 回落 + Cloudflare Zone Purge。
 */
import { envAsync, envSync } from '@/core/cms/runtime-env';

const DEFAULT_TTL_SECONDS = 172800; // 48h

export interface PurgeRecord {
  at: string;
  paths: string[];
  deleted: number;
  cloudflare?: { ok: boolean; skipped?: boolean; detail?: string };
}

let lastPurgeRecord: PurgeRecord | null = null;

export function getLastPurge(): PurgeRecord | null {
  return lastPurgeRecord;
}

export function shouldUseHtmlCache(): boolean {
  if (import.meta.env.DEV) return false;
  return envSync('DISABLE_HTML_CACHE') !== '1';
}

export function applyHtmlCacheHeaders(headers: Headers, ttlSeconds = DEFAULT_TTL_SECONDS): void {
  if (!shouldUseHtmlCache()) {
    headers.set('Cache-Control', 'private, no-store');
    return;
  }
  const ttl = Math.max(86400, ttlSeconds);
  headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=600`);
  headers.set('CDN-Cache-Control', `public, max-age=${ttl}`);
}

function workerCacheKey(url: URL): string {
  const epoch = envSync('HTML_CACHE_EPOCH') || '1';
  const normalized = new URL(url.pathname + url.search, `https://cache.cizhenyu.local`);
  normalized.searchParams.set('__epoch', epoch);
  return normalized.toString();
}

function getWorkerCache(): Cache | null {
  const bag = globalThis as unknown as { caches?: { default?: Cache } };
  return bag.caches?.default ?? null;
}

export async function getCachedHtml(
  url: URL
): Promise<{ body: string; status: number; headers: Headers } | null> {
  const cache = getWorkerCache();
  if (!cache) return null;
  const hit = await cache.match(workerCacheKey(url));
  if (!hit) return null;
  const body = await hit.text();
  return { body, status: hit.status, headers: new Headers(hit.headers) };
}

export async function putCachedHtml(url: URL, response: Response): Promise<void> {
  const cache = getWorkerCache();
  if (!cache) return;
  await cache.put(workerCacheKey(url), response);
}

export async function purgeHtmlPaths(paths: string[], siteOrigin: string): Promise<PurgeRecord> {
  const cache = getWorkerCache();
  let deleted = 0;
  const cleanPaths = [...new Set(paths.map((p) => (p.startsWith('/') ? p : `/${p}`)))];

  if (cache) {
    for (const p of cleanPaths) {
      if (p === '/*') continue;
      const u = new URL(p, 'https://cache.cizhenyu.local');
      if (await cache.delete(workerCacheKey(u))) deleted += 1;
    }
  }

  const zoneId = await envAsync('CF_ZONE_ID');
  const apiToken = await envAsync('CF_API_TOKEN');
  let cloudflare: PurgeRecord['cloudflare'] = { ok: false, skipped: true };

  if (zoneId && apiToken && siteOrigin) {
    try {
      const purgeAll = cleanPaths.includes('/*');
      const payload = purgeAll
        ? { purge_everything: true }
        : { files: cleanPaths.map((p) => `${siteOrigin.replace(/\/$/, '')}${p}`) };
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      cloudflare = { ok: res.ok, detail: `HTTP ${res.status}` };
    } catch (err) {
      cloudflare = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  lastPurgeRecord = {
    at: new Date().toISOString(),
    paths: cleanPaths,
    deleted,
    cloudflare,
  };
  return lastPurgeRecord;
}
