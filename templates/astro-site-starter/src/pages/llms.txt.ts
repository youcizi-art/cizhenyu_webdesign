import type { APIRoute } from 'astro';
import { getSiteOrigin } from '@/core/cms/runtime-env';
import { buildLocalizedPath, getDefaultLocale, getSupportedLocales } from '@/core/i18n/locale';
import { loadArticles, loadCompanyProfile, loadFaqs, loadProducts } from '@/data/loaders/site-loader';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const origin = getSiteOrigin(url.origin);
  const primaryLocale = getDefaultLocale();
  const locales = getSupportedLocales();

  const [company, products, articles, faqs] = await Promise.all([
    loadCompanyProfile(primaryLocale),
    loadProducts(primaryLocale).catch(() => []),
    loadArticles(primaryLocale).catch(() => []),
    loadFaqs(primaryLocale).catch(() => []),
  ]);

  const lines: string[] = [
    `# ${company.name}`,
    '',
    `> ${company.short_answer || company.summary}`,
    '',
    '## Core Pages',
    `- [Home](${origin}${buildLocalizedPath(primaryLocale, '/')}): ${company.slogan || company.name}`,
    `- [Products](${origin}${buildLocalizedPath(primaryLocale, '/products')}): Full product catalog and technical specifications.`,
    `- [Insights](${origin}${buildLocalizedPath(primaryLocale, '/articles')}): Engineering guides and application notes.`,
    `- [About](${origin}${buildLocalizedPath(primaryLocale, '/about')}): Corporate profile and manufacturing capabilities.`,
    `- [Contact](${origin}${buildLocalizedPath(primaryLocale, '/contact')}): Direct engineering inquiry and RFQ portal.`,
  ];

  if (products.length > 0) {
    lines.push('', '## Featured Products');
    for (const p of products) {
      const link = `${origin}${buildLocalizedPath(primaryLocale, `/products/${p.slug}`)}`;
      lines.push(`- [${p.title}](${link}): ${p.short_answer || p.summary}`);
    }
  }

  if (articles.length > 0) {
    lines.push('', '## Technical Guides');
    for (const a of articles) {
      const link = `${origin}${buildLocalizedPath(primaryLocale, `/articles/${a.slug}`)}`;
      lines.push(`- [${a.title}](${link}): ${a.short_answer || a.summary}`);
    }
  }

  if (faqs.length > 0) {
    lines.push('', '## Key Facts & FAQs');
    for (const f of faqs) {
      lines.push(`- **${f.question}**: ${f.answer}`);
    }
  }

  lines.push('', '## Supported Languages');
  for (const code of locales) {
    lines.push(`- [${code}](${origin}${buildLocalizedPath(code, '/')})`);
  }

  lines.push('', '## Sitemap', `- [XML Sitemap](${origin}/sitemap.xml)`, '');

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
