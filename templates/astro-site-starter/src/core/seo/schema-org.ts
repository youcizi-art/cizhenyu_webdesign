/**
 * SEO URL 工具与 Schema.org 结构化 JSON-LD 生成器（内置 Organization / Product / Article / FAQPage / BreadcrumbList）。
 */
import { getSiteOrigin } from '@/core/cms/runtime-env';

export function toAbsoluteUrl(pathOrUrl: string, originOverride = ''): string {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const origin = originOverride || getSiteOrigin();
  if (!origin) return raw;
  return `${origin.replace(/\/$/, '')}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export function toOgLocale(locale: string): string {
  return locale.replace('-', '_');
}

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export interface PageSeoProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  robots?: string;
  locale: string;
  restPath?: string;
  jsonLdNodes?: Array<Record<string, unknown>>;
}

export function buildOrganizationJsonLd(company: {
  name: string;
  summary?: string;
  email?: string;
  phone?: string;
  address?: string;
  logo?: string;
}, origin: string): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.name,
    url: origin || undefined,
    description: company.summary || undefined,
  };
  if (company.logo) node.logo = toAbsoluteUrl(company.logo, origin);
  if (company.email) node.email = company.email;
  if (company.phone) node.telephone = company.phone;
  if (company.address) {
    node.address = {
      '@type': 'PostalAddress',
      streetAddress: company.address,
    };
  }
  return node;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[], origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.href, origin),
    })),
  };
}

export function buildProductJsonLd(
  product: {
    title: string;
    summary?: string;
    sku?: string;
    cover?: string;
    specs?: Array<{ label: string; value: string }>;
  },
  pageUrl: string,
  companyName: string,
  origin: string
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.summary || product.title,
    sku: product.sku || undefined,
    url: toAbsoluteUrl(pageUrl, origin),
    brand: {
      '@type': 'Brand',
      name: companyName,
    },
  };
  if (product.cover) {
    node.image = [toAbsoluteUrl(product.cover, origin)];
  }
  if (product.specs?.length) {
    node.additionalProperty = product.specs.map((s) => ({
      '@type': 'PropertyValue',
      name: s.label,
      value: s.value,
    }));
  }
  return node;
}

export function buildArticleJsonLd(
  article: {
    title: string;
    summary?: string;
    author?: string;
    cover?: string;
    publishedAt?: string;
  },
  pageUrl: string,
  companyName: string,
  origin: string
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary || article.title,
    image: article.cover ? toAbsoluteUrl(article.cover, origin) : undefined,
    datePublished: article.publishedAt || undefined,
    author: {
      '@type': 'Organization',
      name: article.author || companyName,
    },
    publisher: {
      '@type': 'Organization',
      name: companyName,
    },
    mainEntityOfPage: toAbsoluteUrl(pageUrl, origin),
  };
}

export function buildFaqJsonLd(
  faqs: Array<{ question: string; answer: string }>
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
