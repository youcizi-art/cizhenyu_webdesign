/**
 * 双模数据加载器（页面唯一调用的数据入口）：
 * - dataSource = "mock" 时直接读取根目录 `seed/*.json`（与 Deploy `seed_inject` 完全同构，静态定稿后零转换一键灌入 CMS）
 * - dataSource = "cms" 时自动请求 cizhenyu_payload 公开接口 `/api/p/*`
 */
import companySeed from '@seed/company_info.json';
import productSeed from '@seed/product.json';
import articleSeed from '@seed/article.json';
import faqSeed from '@seed/faq.json';
import {
  cmsFetchData,
  cmsSubmitForm,
  collectionFullPath,
  normalizeEntityRow,
  resolveMediaUrl,
  type PublicListPayload,
} from '@/core/cms/client';
import { getDataSourceMode, getSiteConfig } from '@/core/cms/runtime-env';
import { getDefaultLocale, normalizeLocaleCode } from '@/core/i18n/locale';

interface SeedEntry {
  languageGroupKey: string;
  locales: Record<string, Record<string, unknown>>;
}

interface SeedDocument {
  collectionSlug: string;
  items: SeedEntry[];
}

export interface CompanyProfile {
  name: string;
  slogan: string;
  summary: string;
  short_answer: string;
  email: string;
  phone: string;
  address: string;
  logo?: string;
  highlights?: Array<{ metric: string; label: string }>;
}

export interface ProductItem {
  slug: string;
  title: string;
  sku?: string;
  category_label?: string;
  summary: string;
  short_answer?: string;
  cover?: string;
  content?: string;
  spec_data?: Array<{ label: string; value: string }>;
  seo_title?: string;
  seo_description?: string;
}

export interface ArticleItem {
  slug: string;
  title: string;
  author?: string;
  summary: string;
  short_answer?: string;
  cover?: string;
  content?: string;
  seo_title?: string;
  seo_description?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

function pickSeedLocaleRow(
  localesMap: Record<string, Record<string, unknown>>,
  locale: string
): Record<string, unknown> {
  const code = normalizeLocaleCode(locale);
  const def = getDefaultLocale();
  return localesMap[code] ?? localesMap[def] ?? Object.values(localesMap)[0] ?? {};
}

function extractSeedRows(doc: SeedDocument, locale: string): Array<Record<string, unknown>> {
  return (doc.items || []).map((item) => pickSeedLocaleRow(item.locales || {}, locale));
}

function parseSpecArray(raw: unknown): Array<{ label: string; value: string }> {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const label = String(row.label ?? row.key ?? row.name ?? '').trim();
        const value = String(row.value ?? '').trim();
        return label && value ? { label, value } : null;
      })
      .filter((x): x is { label: string; value: string } => Boolean(x));
  }
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      return parseSpecArray(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function mapCompanyRow(
  row: Record<string, unknown>,
  fallback?: Partial<CompanyProfile>
): CompanyProfile {
  return {
    name: String(row.company_name || row.name || fallback?.name || 'Site'),
    slogan: String(row.slogan || fallback?.slogan || ''),
    summary: String(row.summary || fallback?.summary || ''),
    short_answer: String(row.short_answer || row.summary || fallback?.short_answer || ''),
    email: String(row.email || fallback?.email || ''),
    phone: String(row.phone || fallback?.phone || ''),
    address: String(row.address || fallback?.address || ''),
    logo: resolveMediaUrl(row.logo) || fallback?.logo,
    highlights: Array.isArray(row.highlights)
      ? (row.highlights as Array<{ metric: string; label: string }>)
      : fallback?.highlights,
  };
}

function mapProductRow(row: Record<string, unknown>): ProductItem {
  return {
    slug: String(row.slug || row.id || ''),
    title: String(row.title || ''),
    sku: String(row.sku || ''),
    category_label: String(row.category_label || ''),
    summary: String(row.summary || ''),
    short_answer: String(row.short_answer || ''),
    cover: resolveMediaUrl(row.cover),
    content: String(row.content || ''),
    spec_data: parseSpecArray(row.spec_data),
    seo_title: String(row.seo_title || ''),
    seo_description: String(row.seo_description || ''),
  };
}

function mapArticleRow(row: Record<string, unknown>): ArticleItem {
  return {
    slug: String(row.slug || row.id || ''),
    title: String(row.title || ''),
    author: String(row.author || ''),
    summary: String(row.summary || ''),
    short_answer: String(row.short_answer || ''),
    cover: resolveMediaUrl(row.cover),
    content: String(row.content || ''),
    seo_title: String(row.seo_title || ''),
    seo_description: String(row.seo_description || ''),
  };
}

export async function loadCompanyProfile(locale: string): Promise<CompanyProfile> {
  const loc = normalizeLocaleCode(locale);
  const seedRows = extractSeedRows(companySeed as unknown as SeedDocument, loc);
  const mockFallback = mapCompanyRow(seedRows[0] || {});
  if (getDataSourceMode() === 'mock') {
    return mockFallback;
  }
  const path = collectionFullPath('settings', 'company_info');
  const raw = await cmsFetchData<Record<string, unknown>>(`data/${path}/single`, { locale: loc });
  const row = normalizeEntityRow<Record<string, unknown>>(raw);
  return mapCompanyRow(row, mockFallback);
}

export async function loadProducts(locale: string): Promise<ProductItem[]> {
  const loc = normalizeLocaleCode(locale);
  if (getDataSourceMode() === 'mock') {
    return extractSeedRows(productSeed as unknown as SeedDocument, loc).map(mapProductRow);
  }
  const path = collectionFullPath('products', 'product');
  const payload = await cmsFetchData<PublicListPayload>(`data/${path}`, {
    locale: loc,
    page: 1,
    pageSize: 50,
  });
  return (payload.list || []).map((item) => mapProductRow(normalizeEntityRow(item)));
}

export async function loadProductBySlug(locale: string, slug: string): Promise<ProductItem | null> {
  const items = await loadProducts(locale);
  return items.find((p) => p.slug === slug) ?? null;
}

export async function loadArticles(locale: string): Promise<ArticleItem[]> {
  const loc = normalizeLocaleCode(locale);
  if (getDataSourceMode() === 'mock') {
    return extractSeedRows(articleSeed as unknown as SeedDocument, loc).map(mapArticleRow);
  }
  const path = collectionFullPath('content', 'article');
  const payload = await cmsFetchData<PublicListPayload>(`data/${path}`, {
    locale: loc,
    page: 1,
    pageSize: 50,
  });
  return (payload.list || []).map((item) => mapArticleRow(normalizeEntityRow(item)));
}

export async function loadArticleBySlug(locale: string, slug: string): Promise<ArticleItem | null> {
  const items = await loadArticles(locale);
  return items.find((a) => a.slug === slug) ?? null;
}

export async function loadFaqs(locale: string): Promise<FaqItem[]> {
  const loc = normalizeLocaleCode(locale);
  if (getDataSourceMode() === 'mock') {
    return extractSeedRows(faqSeed as unknown as SeedDocument, loc).map((row) => ({
      question: String(row.question || row.title || ''),
      answer: String(row.answer || row.content || ''),
    }));
  }
  const path = collectionFullPath('content', 'faq');
  const payload = await cmsFetchData<PublicListPayload>(`data/${path}`, {
    locale: loc,
    page: 1,
    pageSize: 50,
  });
  return (payload.list || []).map((item) => {
    const row = normalizeEntityRow<Record<string, unknown>>(item);
    return {
      question: String(row.question || row.title || ''),
      answer: String(row.answer || row.content || ''),
    };
  });
}

export function loadNavItems(locale: string): Array<{ key: string; label: string; href: string }> {
  const cfg = getSiteConfig();
  const loc = normalizeLocaleCode(locale);
  return (cfg.navigation || []).map((item) => {
    const labels = item.labels as Record<string, string>;
    const label = labels[loc] || labels['en-US'] || Object.values(labels)[0] || item.key;
    const sub = item.href === '/' ? '' : item.href;
    return {
      key: item.key,
      label,
      href: `/${loc}${sub}`,
    };
  });
}

export async function submitSiteInquiry(payload: {
  locale: string;
  contact_name: string;
  email: string;
  company?: string;
  country?: string;
  product_interest?: string;
  message: string;
}): Promise<{ ok: boolean; msg: string; mode: 'mock' | 'cms' }> {
  const mode = getDataSourceMode();
  if (mode === 'mock') {
    return {
      ok: true,
      mode: 'mock',
      msg: 'Static preview mode: inquiry validated locally.',
    };
  }
  const res = await cmsSubmitForm('business', 'inquiry', payload);
  return { ...res, mode: 'cms' };
}
