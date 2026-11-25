import { defineMiddleware } from 'astro:middleware';
import {
  applyHtmlCacheHeaders,
  getCachedHtml,
  putCachedHtml,
  shouldUseHtmlCache,
} from '@/core/cache/html-cache';
import { warmRuntimeEnv } from '@/core/cms/runtime-env';
import {
  buildLocalizedPath,
  getDefaultLocale,
  isSupportedLocale,
} from '@/core/i18n/locale';

/**
 * 统一中间件：
 * 1. 处理未启用的 AI 清单路径（返回干净 404 防止 Lighthouse 误判）
 * 2. 根路径与非法语种前缀 302 归一到默认语种
 * 3. 为公开 HTML 注入 48h 边缘缓存头，并在 Cloudflare Worker Cache API 做回落缓存
 */
export const onRequest = defineMiddleware(async (context, next) => {
  await warmRuntimeEnv();
  const { request } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return next();
  }

  if (
    url.pathname === '/.well-known/ard.json' ||
    url.pathname === '/.well-known/ai-catalog.json'
  ) {
    return new Response(null, {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // 静态文件与全站索引直通
  const bypassLocale =
    url.pathname === '/robots.txt' ||
    url.pathname === '/sitemap.xml' ||
    url.pathname === '/llms.txt' ||
    url.pathname.startsWith('/_astro/') ||
    /\.[a-z0-9]{2,5}$/i.test(url.pathname);

  if (!bypassLocale) {
    const segs = url.pathname.split('/').filter(Boolean);
    const defLocale = getDefaultLocale();
    if (segs.length === 0) {
      return context.redirect(buildLocalizedPath(defLocale, '/') + url.search, 302);
    }
    if (!isSupportedLocale(segs[0])) {
      return context.redirect(buildLocalizedPath(defLocale, url.pathname) + url.search, 302);
    }
  }

  const useCache = shouldUseHtmlCache() && !bypassLocale;
  if (useCache) {
    const hit = await getCachedHtml(url);
    if (hit && hit.body.trim().length > 0) {
      hit.headers.set('X-HTML-Cache', 'HIT');
      hit.headers.set('X-HTML-Cache-Layer', 'worker-cache');
      return new Response(hit.body, { status: hit.status, headers: hit.headers });
    }
  }

  const response = await next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  // 使用 arrayBuffer 完整读取，防止 Cloudflare 流式 Response clone 导致空白正文
  const buf = await response.arrayBuffer();
  const headers = new Headers(response.headers);

  if (!useCache || !response.ok || buf.byteLength === 0) {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-HTML-Cache', 'BYPASS');
    return new Response(buf, { status: response.status, headers });
  }

  applyHtmlCacheHeaders(headers);
  headers.set('X-HTML-Cache', 'MISS');
  headers.set('X-HTML-Cache-Layer', 'ssr');

  const out = new Response(buf, { status: response.status, headers });
  const waitUntil = context.locals?.runtime?.ctx?.waitUntil;
  const putTask = putCachedHtml(url, out.clone()).catch(() => undefined);
  if (typeof waitUntil === 'function') {
    waitUntil(putTask);
  } else {
    void putTask;
  }
  return out;
});
