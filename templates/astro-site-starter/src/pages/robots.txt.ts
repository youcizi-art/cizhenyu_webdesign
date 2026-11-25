import type { APIRoute } from 'astro';
import { getSiteOrigin } from '@/core/cms/runtime-env';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const origin = getSiteOrigin(url.origin);
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ];
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
