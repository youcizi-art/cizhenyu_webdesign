import type { APIRoute } from 'astro';
import { warmRuntimeEnv } from '@/core/cms/runtime-env';
import { submitSiteInquiry } from '@/data/loaders/site-loader';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  await warmRuntimeEnv();
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, msg: 'Invalid JSON body' }, { status: 400 });
  }

  const contactName = String(body.contact_name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  if (!contactName || !email.includes('@') || !message) {
    return Response.json(
      { ok: false, msg: 'Please complete required contact name, valid email, and inquiry details.' },
      { status: 400 }
    );
  }

  const result = await submitSiteInquiry({
    locale: String(body.locale || 'en-US').trim(),
    contact_name: contactName,
    email,
    company: String(body.company || '').trim(),
    country: String(body.country || '').trim(),
    product_interest: String(body.product_interest || '').trim(),
    message,
  });

  return Response.json(result, {
    status: result.ok ? 200 : 502,
    headers: { 'Cache-Control': 'private, no-store' },
  });
};
