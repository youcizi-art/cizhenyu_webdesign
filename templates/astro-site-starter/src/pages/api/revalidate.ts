import type { APIRoute } from 'astro';
import { getLastPurge, purgeHtmlPaths } from '@/core/cache/html-cache';
import { clearInflightCache } from '@/core/cms/client';
import { envAsync, getSiteKey, getSiteOrigin, warmRuntimeEnv } from '@/core/cms/runtime-env';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  await warmRuntimeEnv();
  const expected = await envAsync('REVALIDATE_SECRET');
  let body: { secret?: string; siteKey?: string; paths?: string[]; purge?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, msg: 'Invalid JSON' }, { status: 400 });
  }

  if (!expected || String(body.secret || '').trim() !== expected) {
    return Response.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
  }
  if (body.siteKey && body.siteKey !== getSiteKey()) {
    return Response.json({ ok: false, msg: 'siteKey mismatch' }, { status: 403 });
  }

  clearInflightCache();
  const paths =
    body.purge === 'all' || !Array.isArray(body.paths) || body.paths.length === 0
      ? ['/*']
      : body.paths;
  const record = await purgeHtmlPaths(paths, getSiteOrigin(url.origin));
  return Response.json(
    { ok: true, siteKey: getSiteKey(), purged: record },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
};

export const GET: APIRoute = async () => {
  return Response.json(
    { ok: true, lastPurge: getLastPurge() },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
};
