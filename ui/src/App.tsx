import { useEffect, useState } from 'react';
import { Database, Eye, Rocket, Sparkles, X } from 'lucide-react';
import { BriefStudioPanel } from './components/BriefStudioPanel';
import { CmsWiringPanel } from './components/CmsWiringPanel';
import { PreviewAndAuditPanel } from './components/PreviewAndAuditPanel';
import { PublishPagesPanel } from './components/PublishPagesPanel';
import { StudioSidebar } from './components/StudioSidebar';
import { useStudioApi } from './hooks/useStudioApi';

type TabKey = 'brief' | 'preview' | 'cms' | 'publish';

export function App() {
  const api = useStudioApi();
  const [activeTab, setActiveTab] = useState<TabKey>('brief');
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('opencode_agent');

  useEffect(() => {
    const list = api.bootstrap?.agents || [];
    if (list.length > 0 && !list.some((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(list[0].id);
    }
  }, [api.bootstrap?.agents, selectedAgentId]);

  useEffect(() => {
    if (!api.loading && (api.bootstrap?.sites.length ?? 0) === 0) {
      setIsCreatingNew(true);
      setActiveTab('brief');
    }
  }, [api.loading, api.bootstrap?.sites.length]);

  const handleSelectSite = (siteKey: string) => {
    setIsCreatingNew(false);
    api.setSelectedSiteKey(siteKey);
  };

  const handleStartNew = () => {
    setIsCreatingNew(true);
    setActiveTab('brief');
  };

  return (
    <div className="studio-shell">
      <StudioSidebar
        sites={api.bootstrap?.sites || []}
        sitesRoot={api.bootstrap?.sitesRoot || ''}
        selectedSiteKey={api.selectedSiteKey}
        isCreatingNew={isCreatingNew}
        context={api.bootstrap?.context || null}
        onSelectSite={handleSelectSite}
        onStartCreateNew={handleStartNew}
        onRefresh={() => void api.loadBootstrap()}
      />

      <div className="studio-main">
        <header className="studio-topbar">
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {isCreatingNew
                ? '创建新的独立 Astro 前端站点'
                : api.activeSite?.displayName || '请选择站点'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isCreatingNew
                ? '先全静态快速生成与打磨，满意后再一键调起 Agent 对接 CMS 集合字段'
                : `工程路径: ${api.activeSite?.path || ''}`}
            </div>
          </div>

          {!isCreatingNew && api.activeSite ? (
            <nav className="studio-tabs" aria-label="Studio workspace stages">
              <button
                type="button"
                className="studio-tab"
                data-active={activeTab === 'brief' ? 'true' : 'false'}
                onClick={() => setActiveTab('brief')}
              >
                <Sparkles size={14} />
                <span>1. 构想与静态设计</span>
              </button>
              <button
                type="button"
                className="studio-tab"
                data-active={activeTab === 'preview' ? 'true' : 'false'}
                onClick={() => setActiveTab('preview')}
              >
                <Eye size={14} />
                <span>2. 预览与 SEO/GEO 体检</span>
              </button>
              <button
                type="button"
                className="studio-tab"
                data-active={activeTab === 'cms' ? 'true' : 'false'}
                onClick={() => setActiveTab('cms')}
              >
                <Database size={14} />
                <span>3. CMS 字段对接</span>
              </button>
              <button
                type="button"
                className="studio-tab"
                data-active={activeTab === 'publish' ? 'true' : 'false'}
                onClick={() => setActiveTab('publish')}
              >
                <Rocket size={14} />
                <span>4. 构建与 Pages 上线</span>
              </button>
            </nav>
          ) : null}
        </header>

        {api.banner ? (
          <div
            className="banner-bar"
            style={{
              background:
                api.banner.kind === 'error'
                  ? 'var(--danger-bg)'
                  : api.banner.kind === 'success'
                    ? 'var(--success-bg)'
                    : 'var(--accent-soft)',
              color:
                api.banner.kind === 'error'
                  ? 'var(--danger-text)'
                  : api.banner.kind === 'success'
                    ? 'var(--success-text)'
                    : 'var(--accent-primary)',
            }}
          >
            <span style={{ wordBreak: 'break-word' }}>{api.banner.text}</span>
            <button
              type="button"
              onClick={() => api.setBanner(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
              aria-label="关闭提示"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className="studio-content">
          {isCreatingNew || activeTab === 'brief' ? (
            <BriefStudioPanel
              site={api.activeSite}
              isCreatingNew={isCreatingNew}
              agents={api.bootstrap?.agents || []}
              selectedAgentId={selectedAgentId}
              busyAction={api.busyAction}
              onChangeAgent={setSelectedAgentId}
              onSaveOnly={async (payload) => {
                const saved = await api.saveOrCreateSite(payload);
                if (saved) {
                  setIsCreatingNew(false);
                }
              }}
              onDispatchAgent={async (siteKey, brief, agentId, extra) => {
                setIsCreatingNew(false);
                await api.dispatchStage1(siteKey, brief, agentId, extra);
              }}
              onOpenFolder={(siteKey) => void api.openSiteFolder(siteKey)}
            />
          ) : null}

          {!isCreatingNew && api.activeSite && activeTab === 'preview' ? (
            <PreviewAndAuditPanel
              site={api.activeSite}
              audit={api.audit}
              busyAction={api.busyAction}
              selectedAgentId={selectedAgentId}
              onTogglePreview={api.togglePreview}
              onOpenExternal={api.openExternal}
              onRefreshAudit={api.loadSiteInspections}
              onDispatchFix={async (siteKey, instruction) => {
                await api.dispatchStage1(siteKey, api.activeSite!.brief, selectedAgentId, instruction);
              }}
            />
          ) : null}

          {!isCreatingNew && api.activeSite && activeTab === 'cms' ? (
            <CmsWiringPanel
              site={api.activeSite}
              contract={api.contract}
              context={api.bootstrap?.context || null}
              selectedAgentId={selectedAgentId}
              busyAction={api.busyAction}
              onRefreshContract={api.loadSiteInspections}
              onOpenCmsLogin={api.openCmsLogin}
              onDispatchStage2={api.dispatchStage2}
            />
          ) : null}

          {!isCreatingNew && api.activeSite && activeTab === 'publish' ? (
            <PublishPagesPanel
              site={api.activeSite}
              context={api.bootstrap?.context || null}
              busyAction={api.busyAction}
              onRunBuild={api.runBuildOnly}
              onPublishPages={api.publishToPages}
              onOpenExternal={api.openExternal}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
