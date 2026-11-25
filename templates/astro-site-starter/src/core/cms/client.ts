/**
 * cizhenyu_payload 公开接口客户端（支持 Service Binding 与 HTTP 双通道 + 请求级去重 + _seo/_geo 扁平展开）。
 */
import { envAsync, envSync, getCloudflareEnv, getSiteKey } from './runtime-env';

export interface PublicEnvelope<T> {
  status: number;
  msg: string;
  data: T | null;
  error?: string;
}

export interface PublicListPayload<T = Record<string, unknown>> {
  list: T[];
  pages: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  path?: string;
}

type CmsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const inflightCache = new Map<string, Promise<unknown>>();

export function clearInflightCache(): void {
  inflightCache.clear();
}

async function resolveTransport(): Promise<'http' | 'service'> {
  const apiBase = (await envAsync('PUBLIC_CMS_API_BASE')).replace(/\/$/, '').trim();
  const raw =
    (await envAsync('CMS_TRANSPORT')).toLowerCase() ||
    (await envAsync('PUBLIC_CMS_TRANSPORT')).toLowerCase();
  if (raw === 'service') return 'service';
  if (raw === 'http' && apiBase) return 'http';
  if (!apiBase) {
    const cf = await getCloudflareEnv();
    if (cf && cf.CMS) return 'service';
  }
  return 'http';
}

async function resolveFetcher(): Promise<{ fetcher: CmsFetcher; base: string }> {
  const transport = await resolveTransport();
  if (transport === 'service') {
    const cf = await getCloudflareEnv();
    const bindingName = (await envAsync('CMS_SERVICE_BINDING')) || 'CMS';
    const binding = cf?.[bindingName] as CmsFetcher | undefined;
    if (binding && typeof binding.fetch === 'function') {
      return { fetcher: binding, base: 'https://cms.internal' };
    }
  }
  const apiBase = (await envAsync('PUBLIC_CMS_API_BASE')).replace(/\/$/, '').trim();
  if (!apiBase) {
    throw new Error('未配置 PUBLIC_CMS_API_BASE 或 CMS Service Binding');
  }
  return { fetcher: { fetch: globalThis.fetch.bind(globalThis) }, base: apiBase };
}

/**
 * 将 CMS 实体中的 _seo / _schema / _geo 扩展分区字段扁平合并至顶层，方便统一读取。
 */
export function normalizeEntityRow<T extends Record<string, unknown>>(raw: Record<string, unknown>): T {
  const baseData =
    raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
      ? (raw.data as Record<string, unknown>)
      : raw;
  const merged: Record<string, unknown> = {
    id: raw.id ?? baseData.id ?? '',
    locale: raw.locale ?? baseData.locale ?? '',
    languageGroupKey: raw.languageGroupKey ?? raw.language_group_key ?? '',
    ...baseData,
  };
  for (const region of ['_seo', '_schema', '_geo']) {
    const sub = baseData[region];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      Object.assign(merged, sub);
    }
  }
  return merged as T;
}

export function resolveMediaUrl(rawUrl: unknown): string {
  const str = String(rawUrl ?? '').trim();
  if (!str) return '';
  if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
    return str;
  }
  const mediaBase = (envSync('PUBLIC_MEDIA_BASE') || envSync('PUBLIC_CMS_API_BASE')).replace(/\/$/, '');
  if (!mediaBase) return str;
  return `${mediaBase}${str.startsWith('/') ? '' : '/'}${str}`;
}

export function collectionFullPath(groupSubPath: string, logical: string): string {
  const ns = getSiteKey();
  const cleanGroup = groupSubPath.replace(/^\/+|\/+$/g, '');
  const groupPath = cleanGroup.startsWith(`${ns}/`) ? cleanGroup : `${ns}/${cleanGroup}`;
  const slug = logical.startsWith(`${ns}_`) ? logical : `${ns}_${logical}`;
  return `${groupPath}/${slug}`;
}

export async function cmsFetchData<T>(
  resourcePath: string,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const { fetcher, base } = await resolveFetcher();
  const prefix = ((await envAsync('PUBLIC_CMS_API_PREFIX')) || '/api/p').replace(/\/$/, '');
  const url = new URL(`${prefix}/${resourcePath.replace(/^\//, '')}`, `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const key = `GET:${url.toString()}`;
  const existing = inflightCache.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = (async () => {
    const res = await fetcher.fetch(url, {
      headers: { Accept: 'application/json', 'X-Cizhenyu-SSR': '1' },
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as PublicEnvelope<T> | null;
    if (!body || typeof body !== 'object') {
      throw new Error(`CMS 响应格式无效 (HTTP ${res.status})`);
    }
    if (!res.ok || body.status >= 400 || body.data === null) {
      throw new Error(body.msg || body.error || `CMS 请求失败 (HTTP ${res.status})`);
    }
    return body.data;
  })();

  inflightCache.set(key, task);
  try {
    return await task;
  } finally {
    setTimeout(() => inflightCache.delete(key), 1500);
  }
}

export async function cmsSubmitForm(
  groupSubPath: string,
  logical: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; msg: string }> {
  const { fetcher, base } = await resolveFetcher();
  const prefix = ((await envAsync('PUBLIC_CMS_API_PREFIX')) || '/api/p').replace(/\/$/, '');
  const fullPath = collectionFullPath(groupSubPath, logical);
  const url = new URL(`${prefix}/submit/${fullPath}`, `${base}/`);

  const res = await fetcher.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Cizhenyu-SSR': '1',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => null)) as PublicEnvelope<unknown> | null;
  if (!res.ok || (body && body.status >= 400)) {
    return {
      ok: false,
      msg: body?.msg || body?.error || `提交失败 (HTTP ${res.status})`,
    };
  }
  return { ok: true, msg: body?.msg || 'Submitted' };
}
