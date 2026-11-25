/**
 * 多语言路径解析与 hreflang 生成器。
 */
import { getSiteConfig } from '@/core/cms/runtime-env';

export function getSupportedLocales(): string[] {
  const cfg = getSiteConfig();
  return Array.isArray(cfg.locales) && cfg.locales.length > 0 ? cfg.locales : ['en-US'];
}

export function getDefaultLocale(): string {
  const cfg = getSiteConfig();
  const locales = getSupportedLocales();
  if (cfg.defaultLocale && locales.includes(cfg.defaultLocale)) {
    return cfg.defaultLocale;
  }
  return locales[0];
}

export function isSupportedLocale(candidate: string | undefined): boolean {
  if (!candidate) return false;
  return getSupportedLocales().some((l) => l.toLowerCase() === candidate.toLowerCase());
}

export function normalizeLocaleCode(candidate: string | undefined): string {
  const locales = getSupportedLocales();
  const hit = locales.find((l) => l.toLowerCase() === String(candidate || '').toLowerCase());
  return hit || getDefaultLocale();
}

export function buildLocalizedPath(locale: string, subPath = '/'): string {
  const clean = subPath.startsWith('/') ? subPath : `/${subPath}`;
  if (clean === '/') return `/${locale}`;
  return `/${locale}${clean.replace(/\/$/, '')}`;
}

export function stripLocaleFromPathname(pathname: string): {
  locale: string | null;
  restPath: string;
} {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 0) return { locale: null, restPath: '/' };
  const first = segs[0];
  if (isSupportedLocale(first)) {
    const rest = '/' + segs.slice(1).join('/');
    return { locale: normalizeLocaleCode(first), restPath: rest || '/' };
  }
  return { locale: null, restPath: pathname };
}

export function buildHreflangAlternates(restPath: string): Array<{ hreflang: string; href: string }> {
  const locales = getSupportedLocales();
  const def = getDefaultLocale();
  const list = locales.map((code) => ({
    hreflang: code,
    href: buildLocalizedPath(code, restPath),
  }));
  list.push({
    hreflang: 'x-default',
    href: buildLocalizedPath(def, restPath),
  });
  return list;
}
