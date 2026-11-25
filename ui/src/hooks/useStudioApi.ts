import { useCallback, useEffect, useState } from 'react';
import type {
  BootstrapPayload,
  CmsContractValidation,
  SeoGeoAuditResult,
  SiteBrief,
  SiteDetail,
} from '../types/studio';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `请求失败 (${res.status})`);
  }
  return data as T;
}

/**
 * 统一封装 WebDesign 工作台服务端交互状态与操作方法
 */
export function useStudioApi() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [selectedSiteKey, setSelectedSiteKey] = useState<string>('');
  const [audit, setAudit] = useState<SeoGeoAuditResult | null>(null);
  const [contract, setContract] = useState<CmsContractValidation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string>('');
  const [banner, setBanner] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  const loadBootstrap = useCallback(async (preferredSiteKey?: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<BootstrapPayload>('/api/bootstrap');
      setBootstrap(data);
      const targetKey = preferredSiteKey || selectedSiteKey || data.sites[0]?.siteKey || '';
      if (targetKey && data.sites.some((s) => s.siteKey === targetKey)) {
        setSelectedSiteKey(targetKey);
      } else if (data.sites.length > 0) {
        setSelectedSiteKey(data.sites[0].siteKey);
      } else {
        setSelectedSiteKey('');
      }
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedSiteKey]);

  const loadSiteInspections = useCallback(async (siteKey: string) => {
    if (!siteKey) {
      setAudit(null);
      setContract(null);
      return;
    }
    try {
      const [auditRes, contractRes] = await Promise.all([
        apiFetch<{ ok: boolean; audit: SeoGeoAuditResult }>(`/api/sites/${siteKey}/audit`),
        apiFetch<{ ok: boolean; contract: CmsContractValidation }>(`/api/sites/${siteKey}/contract`),
      ]);
      setAudit(auditRes.audit);
      setContract(contractRes.contract);
    } catch {
      // 忽略尚未初始化完的瞬态
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (selectedSiteKey) {
      void loadSiteInspections(selectedSiteKey);
    }
  }, [selectedSiteKey, loadSiteInspections]);

  const activeSite: SiteDetail | null =
    bootstrap?.sites.find((s) => s.siteKey === selectedSiteKey) ?? null;

  const saveOrCreateSite = useCallback(
    async (briefInput: Partial<SiteBrief> & { siteKey: string }) => {
      setBusyAction('save-site');
      try {
        const res = await apiFetch<{ ok: boolean; isNew: boolean; site: SiteDetail }>('/api/sites', {
          method: 'POST',
          body: JSON.stringify(briefInput),
        });
        await loadBootstrap(res.site.siteKey);
        await loadSiteInspections(res.site.siteKey);
        setBanner({
          kind: 'success',
          text: res.isNew
            ? `已在 ${res.site.path} 创建独立 Astro 站点工程`
            : `已更新站点「${res.site.displayName}」配置`,
        });
        return res.site;
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        setBusyAction('');
      }
    },
    [loadBootstrap, loadSiteInspections]
  );

  const dispatchStage1 = useCallback(
    async (
      siteKey: string,
      brief: Partial<SiteBrief>,
      agentId: string,
      extraInstruction = ''
    ) => {
      setBusyAction('dispatch-stage1');
      try {
        const res = await apiFetch<{ ok: boolean; recommendedPrompt: string }>(
          `/api/sites/${siteKey}/dispatch-stage1`,
          {
            method: 'POST',
            body: JSON.stringify({ brief, agentId, extraInstruction }),
          }
        );
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(res.recommendedPrompt).catch(() => undefined);
        }
        await loadBootstrap(siteKey);
        setBanner({
          kind: 'success',
          text: `已写入专属/通用配置并唤起 Agent！推荐首条指令已复制到剪贴板：${res.recommendedPrompt}`,
        });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyAction('');
      }
    },
    [loadBootstrap]
  );

  const dispatchStage2 = useCallback(
    async (siteKey: string, agentId: string, extraInstruction = '') => {
      setBusyAction('dispatch-stage2');
      try {
        const res = await apiFetch<{ ok: boolean; recommendedPrompt: string }>(
          `/api/sites/${siteKey}/dispatch-stage2`,
          {
            method: 'POST',
            body: JSON.stringify({ agentId, extraInstruction }),
          }
        );
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(res.recommendedPrompt).catch(() => undefined);
        }
        await loadBootstrap(siteKey);
        setBanner({
          kind: 'success',
          text: `已校验锁定字段契约并唤起 Agent 对接 CMS！推荐指令已复制到剪贴板：${res.recommendedPrompt}`,
        });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyAction('');
      }
    },
    [loadBootstrap]
  );

  const togglePreview = useCallback(
    async (siteKey: string, start: boolean) => {
      setBusyAction('preview');
      try {
        await apiFetch(`/api/sites/${siteKey}/${start ? 'preview-start' : 'preview-stop'}`, {
          method: 'POST',
        });
        await loadBootstrap(siteKey);
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyAction('');
      }
    },
    [loadBootstrap]
  );

  const openExternal = useCallback(async (url: string) => {
    await apiFetch('/api/open-url', { method: 'POST', body: JSON.stringify({ url }) });
  }, []);

  const openSiteFolder = useCallback(async (siteKey: string) => {
    await apiFetch('/api/open-folder', { method: 'POST', body: JSON.stringify({ siteKey }) });
  }, []);

  const openCmsLogin = useCallback(async (origin: string) => {
    try {
      await apiFetch('/api/cms/open-login', { method: 'POST', body: JSON.stringify({ origin }) });
      setBanner({ kind: 'info', text: '已请求 Deploy 打开 CMS 登录窗口，登录完成后点击右上角刷新即可。' });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const runBuildOnly = useCallback(
    async (siteKey: string) => {
      setBusyAction('build');
      try {
        const res = await apiFetch<{ ok: boolean; distDir: string; logs: string }>(
          `/api/sites/${siteKey}/build`,
          { method: 'POST' }
        );
        await loadBootstrap(siteKey);
        setBanner({ kind: 'success', text: `站点构建通过，产物目录：${res.distDir}` });
        return res;
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        setBusyAction('');
      }
    },
    [loadBootstrap]
  );

  const publishToPages = useCallback(
    async (siteKey: string, domain: string, projectName: string) => {
      setBusyAction('publish');
      try {
        const res = await apiFetch<{
          ok: boolean;
          deploy: { siteUrl: string; pagesDevUrl: string; projectName: string };
        }>(`/api/sites/${siteKey}/publish`, {
          method: 'POST',
          body: JSON.stringify({ domain, projectName }),
        });
        await loadBootstrap(siteKey);
        setBanner({
          kind: 'success',
          text: `Cloudflare Pages 部署完成！访问地址：${res.deploy.siteUrl}`,
        });
        return res;
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        setBusyAction('');
      }
    },
    [loadBootstrap]
  );

  return {
    bootstrap,
    activeSite,
    selectedSiteKey,
    setSelectedSiteKey,
    audit,
    contract,
    loading,
    busyAction,
    banner,
    setBanner,
    loadBootstrap,
    loadSiteInspections,
    saveOrCreateSite,
    dispatchStage1,
    dispatchStage2,
    togglePreview,
    openExternal,
    openSiteFolder,
    openCmsLogin,
    runBuildOnly,
    publishToPages,
  };
}
