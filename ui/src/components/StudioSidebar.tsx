import { CheckCircle2, Cloud, Database, Globe, Layers, Plus, RefreshCw } from 'lucide-react';
import type { BridgeContextInfo, SiteDetail } from '../types/studio';

interface StudioSidebarProps {
  sites: SiteDetail[];
  sitesRoot: string;
  selectedSiteKey: string;
  isCreatingNew: boolean;
  context: BridgeContextInfo | null;
  onSelectSite: (siteKey: string) => void;
  onStartCreateNew: () => void;
  onRefresh: () => void;
}

/**
 * 左侧站点导航栏与 Deploy 环境状态概览
 */
export function StudioSidebar({
  sites,
  sitesRoot,
  selectedSiteKey,
  isCreatingNew,
  context,
  onSelectSite,
  onStartCreateNew,
  onRefresh,
}: StudioSidebarProps) {
  return (
    <aside className="studio-sidebar">
      <div className="studio-brand">
        <div className="studio-brand-title">
          <Layers size={18} color="#2563eb" />
          <span>WebDesign Studio</span>
        </div>
        <button type="button" className="btn" style={{ padding: '6px 8px' }} onClick={onRefresh} title="刷新状态">
          <RefreshCw size={14} />
        </button>
      </div>

      <button type="button" className="btn btn-primary" onClick={onStartCreateNew}>
        <Plus size={16} />
        <span>新建独立 Astro 站点</span>
      </button>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
          站点工程目录 ({sites.length})
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 10 }}>
          {sitesRoot || '{workRoot}/sites'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sites.map((site) => {
            const selected = !isCreatingNew && site.siteKey === selectedSiteKey;
            return (
              <button
                key={site.siteKey}
                type="button"
                className="site-list-item"
                data-selected={selected ? 'true' : 'false'}
                onClick={() => onSelectSite(site.siteKey)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{site.displayName}</span>
                  <span className={`badge ${site.dataSource === 'cms' ? 'badge-green' : 'badge-blue'}`}>
                    {site.dataSource === 'cms' ? 'CMS 动态' : '静态设计'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  <Globe size={12} />
                  <span>{site.siteKey}</span>
                  {site.preview.running ? (
                    <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>:{site.preview.port}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
          {sites.length === 0 ? (
            <div style={{ padding: '18px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              暂无站点工程，点击上方按钮新建第一个站点
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border-light)', display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Deploy 底座连接状态</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <CheckCircle2 size={14} color={context?.bridgeOffline ? '#b45309' : '#047857'} />
            Deploy 能力桥
          </span>
          <span className={`badge ${context?.bridgeOffline ? 'badge-amber' : 'badge-green'}`}>
            {context?.bridgeOffline ? '离线独立态' : '已连接'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <Database size={14} color={context?.cms?.loggedIn ? '#047857' : '#64748b'} />
            CMS 会话
          </span>
          <span className={`badge ${context?.cms?.loggedIn ? 'badge-green' : 'badge-amber'}`}>
            {context?.cms?.loggedIn ? '已登录' : '待登录'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <Cloud size={14} color={context?.cf?.authorized ? '#047857' : '#64748b'} />
            Cloudflare
          </span>
          <span className={`badge ${context?.cf?.authorized ? 'badge-green' : 'badge-amber'}`}>
            {context?.cf?.authorized ? '已授权' : '待授权'}
          </span>
        </div>
      </div>
    </aside>
  );
}
