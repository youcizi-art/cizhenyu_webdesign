/**
 * 双模数据加载器（页面唯一调用的数据入口）：
 * - dataSource = "mock" 时读取本地 mocks/seed.json（阶段一全静态构建与秒级预览）
 * - dataSource = "cms" 时自动切换为请求 cizhenyu_payload 公开接口 /api/p/*（阶段二后台对接零改页面）
 */
import seedData from '@/data/mocks/seed.json';
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

function pickLocalizedMock<T>(bucket: Record<string, T>, locale: string): T {
  const code = normalizeLocaleCode(locale);
  const def = getDefaultLocale();
  return bucket[code] ?? bucket[def] ?? Object.values(bucket)[0];
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

export async function loadCompanyProfile(locale: string): Promise<CompanyProfile> {
  const loc = normalizeLocaleCode(locale);
  const mockFallback = pickLocalizedMock(
    seedData.company_info as Record<string, CompanyProfile>,
    loc
  );
  if (getDataSourceMode() === 'mock') {
    return mockFallback;
  }
  const path = collectionFullPath('settings', 'company_info');
  const raw = await cmsFetchData<Record<string, unknown>>(`data/${path}/single`, { locale: loc });
  const row = normalizeEntityRow<Record<string, unknown>>(raw);
  return {
    name: String(row.name || mockFallback.name),
    slogan: String(row.slogan || mockFallback.slogan || ''),
    summary: String(row.summary || mockFallback.summary || ''),
    short_answer: String(row.short_answer || row.summary || ''),
    email: String(row.email || mockFallback.email || ''),
    phone: String(row.phone || mockFallback.phone || ''),
    address: String(row.address || mockFallback.address || ''),
    logo: resolveMediaUrl(row.logo),
    highlights: mockFallback.highlights,
  };
}

export async function loadProducts(locale: string): Promise<ProductItem[]> {
  const loc = normalizeLocaleCode(locale);
  if (getDataSourceMode() === 'mock') {
    return pickLocalizedMock(seedData.product as Record<string, ProductItem[]>, loc);
  }
  const path = collectionFullPath('products', 'product');
  const payload = await cmsFetchData<PublicListPayload>(`data/${path}`, {
    locale: loc,
    page: 1,
    pageSize: 50,
  });
  return (payload.list || []).map((item) => {
    const row = normalizeEntityRow<Record<string, unknown>>(item);
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
  });
}

export async function loadProductBySlug(locale: string, slug: string): Promise<ProductItem | null> {
  const items = await loadProducts(locale);
  return items.find((p) => p.slug === slug) ?? null;
}

export async function loadArticles(locale: string): Promise<ArticleItem[]> {
  const loc = normalizeLocaleCode(locale);
  if (getDataSourceMode() === 'mock') {
    return pickLocalizedMock(seedData.article as Record<string, ArticleItem[]>, loc);
  }
  const path = collectionFullPath('content', 'article');
  const payload = await cmsFetchData<PublicListPayload>(`data/${path}`, {
    locale: loc,
    page: 1,
    pageSize: 50,
  });
  return (payload.list || []).map((item) => {
    const row = normalizeEntityRow<Record<string, unknown>>(item);
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
  });
}

export async function loadArticleBySlug(locale: string, slug: string): Promise<ArticleItem | null> {
  const items = await loadArticles(locale);
  return items.find((a) => a.slug === slug) ?? null;
}

export async function loadFaqs(locale: string): Promise<FaqItem[]> {
  const loc = normalizeLocaleCode(locale);
  if (getDataSourceMode() === 'mock') {
    return pickLocalizedMock(seedData.faq as Record<string, FaqItem[]>, loc);
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
      msg: 'Static preview mode: inquiry validated locally (connect CMS in Phase 2 to persist to database).',
    };
  }
  const res = await cmsSubmitForm('business', 'inquiry', payload);
  return { ...res, mode: 'cms' };
}
