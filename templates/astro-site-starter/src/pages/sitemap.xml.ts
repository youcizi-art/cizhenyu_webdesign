import type { APIRoute } from 'astro';
import { getSiteOrigin } from '@/core/cms/runtime-env';
import { buildLocalizedPath, getSupportedLocales } from '@/core/i18n/locale';
import { loadArticles, loadProducts } from '@/data/loaders/site-loader';

export const prerender = false;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET: APIRoute = async ({ url }) => {
  const origin = getSiteOrigin(url.origin);
  const locales = getSupportedLocales();
  const staticPaths = ['/', '/products', '/articles', '/about', '/contact'];
  const urls: string[] = [];

  for (const locale of locales) {
    for (const sp of staticPaths) {
      urls.push(`${origin}${buildLocalizedPath(locale, sp)}`);
    }
    const [products, articles] = await Promise.all([
      loadProducts(locale).catch(() => []),
      loadArticles(locale).catch(() => []),
    ]);
    for (const p of products) {
      if (p.slug) urls.push(`${origin}${buildLocalizedPath(locale, `/products/${p.slug}`)}`);
    }
    for (const a of articles) {
      if (a.slug) urls.push(`${origin}${buildLocalizedPath(locale, `/articles/${a.slug}`)}`);
    }
  }

  const uniqueUrls = [...new Set(urls)];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...uniqueUrls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`),
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
