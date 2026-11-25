import { useCallback, useEffect, useState } from 'react';
import type { BootstrapPayload, SiteSummary } from '../types/studio';

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
 * 封装极简站点启动器的服务端状态、自动装包轮询与 Agent 唤起动作
 */
export function useStudioApi() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('opencode_agent');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyKey, setBusyKey] = useState<string>('');
  const [banner, setBanner] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  const loadBootstrap = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<BootstrapPayload>('/api/bootstrap');
      setBootstrap(data);
      setSelectedAgentId((prev) => {
        if (data.agents.length === 0) return prev;
        if (data.agents.some((a) => a.id === prev)) return prev;
        const preferred =
          data.agents.find((a) => a.id === 'opencode_agent' && a.installed !== false) ||
          data.agents.find((a) => a.id === 'dsh_agent' && a.installed !== false) ||
          data.agents[0];
        return preferred ? preferred.id : prev;
      });
    } catch (err) {
      if (!silent) {
        setBanner({
          kind: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap(false);
  }, [loadBootstrap]);

  // 当存在正在执行 npm install 的站点时，每 3 秒静默刷新一次状态
  const hasInstalling = Boolean(
    bootstrap?.sites.some((s) => s.installStatus === 'installing')
  );
  useEffect(() => {
    if (!hasInstalling) return undefined;
    const timer = window.setInterval(() => {
      void loadBootstrap(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasInstalling, loadBootstrap]);

  const createSite = useCallback(
    async (siteKey: string, displayName: string): Promise<SiteSummary | null> => {
      setBusyKey('create');
      try {
        const res = await apiFetch<{ ok: boolean; site: SiteSummary }>('/api/sites', {
          method: 'POST',
          body: JSON.stringify({ siteKey: siteKey.trim(), displayName: displayName.trim() }),
        });
        await loadBootstrap(true);
        setBanner({
          kind: 'success',
          text: `已创建站点工程 ${res.site.path}，已注入全套 Skills 并正在后台自动安装 Astro v7 依赖。`,
        });
        return res.site;
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
        return null;
      } finally {
        setBusyKey('');
      }
    },
    [loadBootstrap]
  );

  const openWithAgent = useCallback(
    async (siteKey: string, agentId: string) => {
      setBusyKey(`open:${siteKey}`);
      try {
        await apiFetch(`/api/sites/${siteKey}/open-agent`, {
          method: 'POST',
          body: JSON.stringify({ agentId }),
        });
        setBanner({
          kind: 'success',
          text: `已注入 Skills 与 CMS / CRM / Deploy MCP 并打开 Agent（${siteKey}），请直接在对话框中描述需求边聊边改。`,
        });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyKey('');
      }
    },
    []
  );

  const retryInstall = useCallback(
    async (siteKey: string) => {
      setBusyKey(`install:${siteKey}`);
      try {
        await apiFetch(`/api/sites/${siteKey}/install`, { method: 'POST' });
        await loadBootstrap(true);
        setBanner({ kind: 'info', text: `已重新启动站点「${siteKey}」的依赖安装任务。` });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyKey('');
      }
    },
    [loadBootstrap]
  );

  const openFolder = useCallback(async (siteKey: string) => {
    try {
      await apiFetch('/api/open-folder', { method: 'POST', body: JSON.stringify({ siteKey }) });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const startPreview = useCallback(
    async (siteKey: string) => {
      setBusyKey(`preview-start:${siteKey}`);
      try {
        const res = await apiFetch<{ ok: boolean; preview: { url: string | null } }>(
          `/api/sites/${siteKey}/preview-start`,
          { method: 'POST' }
        );
        await loadBootstrap(true);
        setBanner({
          kind: 'success',
          text: `预览服务已启动并在浏览器打开：${res.preview.url || ''}`,
        });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyKey('');
      }
    },
    [loadBootstrap]
  );

  const stopPreview = useCallback(
    async (siteKey: string) => {
      setBusyKey(`preview-stop:${siteKey}`);
      try {
        await apiFetch(`/api/sites/${siteKey}/preview-stop`, { method: 'POST' });
        await loadBootstrap(true);
        setBanner({ kind: 'info', text: `已关闭站点「${siteKey}」的本地预览服务。` });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyKey('');
      }
    },
    [loadBootstrap]
  );

  const deleteSite = useCallback(
    async (siteKey: string) => {
      setBusyKey(`delete:${siteKey}`);
      try {
        await apiFetch(`/api/sites/${siteKey}`, { method: 'DELETE' });
        await loadBootstrap(true);
        setBanner({ kind: 'info', text: `已移除本地站点目录：${siteKey}` });
      } catch (err) {
        setBanner({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      } finally {
        setBusyKey('');
      }
    },
    [loadBootstrap]
  );

  return {
    bootstrap,
    selectedAgentId,
    setSelectedAgentId,
    loading,
    busyKey,
    banner,
    setBanner,
    loadBootstrap,
    createSite,
    openWithAgent,
    retryInstall,
    startPreview,
    stopPreview,
    openFolder,
    deleteSite,
  };
}
