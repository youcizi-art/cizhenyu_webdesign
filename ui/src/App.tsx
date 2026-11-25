import { useState, type FormEvent } from 'react';
import { Bot, CheckCircle2, CircleDashed, Layers, Plus, RefreshCw } from 'lucide-react';
import { SiteProjectCard } from './components/SiteProjectCard';
import { useStudioApi } from './hooks/useStudioApi';
import './styles/studio.css';

/**
 * WebDesign Studio 极简站点启动器：
 * 1. 在 {workRoot}/sites/<siteKey> 创建 Astro v7 基础工程、注入全套 Skills 并自动安装依赖；
 * 2. 一键挂载 cmsmcp / crmmcp / Deploy MCP 并打开 Agent，在对话中完成建站、数据对接与部署上线。
 */
export function App() {
  const {
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
    openFolder,
    deleteSite,
  } = useStudioApi();

  const [siteKey, setSiteKey] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteKey.trim()) return;
    const created = await createSite(siteKey, displayName);
    if (created) {
      setSiteKey('');
      setDisplayName('');
    }
  };

  const ctx = bootstrap?.context;
  const agents = bootstrap?.agents || [];
  const sites = bootstrap?.sites || [];

  return (
    <div className="launcher-page">
      <header className="launcher-header">
        <div>
          <div className="brand-title">
            <Layers size={20} color="#2563eb" />
            <h1>WebDesign 站点工作区启动器</h1>
          </div>
          <p className="brand-subtitle">
            创建即注入 Astro v7 基础工程、设计/SEO/GEO/CMS 规范与全链路 MCP；点击「用 Agent 打开」直接对话完成建站、数据灌入与部署。
          </p>
        </div>

        <div className="header-right">
          <div className="env-badges">
            <span className={`status-pill ${ctx?.cms?.loggedIn ? 'status-green' : 'status-neutral'}`}>
              {ctx?.cms?.loggedIn ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
              <span>{ctx?.cms?.loggedIn ? 'CMS 已连接' : 'CMS 未登录'}</span>
            </span>
            <span className={`status-pill ${ctx?.crm?.loggedIn ? 'status-green' : 'status-neutral'}`}>
              {ctx?.crm?.loggedIn ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
              <span>{ctx?.crm?.loggedIn ? 'CRM 已连接' : 'CRM 未登录'}</span>
            </span>
            <span className={`status-pill ${ctx?.cf?.authorized ? 'status-green' : 'status-neutral'}`}>
              {ctx?.cf?.authorized ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
              <span>{ctx?.cf?.authorized ? 'CF 已授权' : 'CF 未授权'}</span>
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadBootstrap(false)}
          >
            <RefreshCw size={14} />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {banner ? (
        <div className={`banner banner-${banner.kind}`}>
          <span>{banner.text}</span>
          <button type="button" className="banner-close" onClick={() => setBanner(null)}>
            关闭
          </button>
        </div>
      ) : null}

      <section className="create-section">
        <form className="create-form" onSubmit={(e) => void handleCreate(e)}>
          <div className="form-field">
            <label htmlFor="site-key-input">新建站点标识 (siteKey) *</label>
            <input
              id="site-key-input"
              className="input"
              placeholder="例如: acme-dental（将创建于 sites/acme-dental）"
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="display-name-input">显示名称（选填）</label>
            <input
              id="display-name-input"
              className="input"
              placeholder="例如: Acme Dental 官网"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary create-submit"
            disabled={!siteKey.trim() || Boolean(busyKey)}
          >
            <Plus size={16} />
            <span>{busyKey === 'create' ? '正在初始化…' : '创建站点并安装依赖'}</span>
          </button>
        </form>
      </section>

      <section className="list-section">
        <div className="list-toolbar">
          <div className="list-heading">
            <span>站点目录：</span>
            <code>{bootstrap?.sitesRoot || '{workRoot}/sites'}</code>
            <span className="count-badge">{sites.length} 个站点</span>
          </div>

          <div className="agent-picker">
            <Bot size={15} color="#475569" />
            <label htmlFor="default-agent-select">打开使用的 Agent：</label>
            <select
              id="default-agent-select"
              className="select"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              {agents.length > 0 ? (
                agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.label} ({ag.id})
                  </option>
                ))
              ) : (
                <>
                  <option value="opencode_agent">CIZHENYU OpenCode (opencode_agent)</option>
                  <option value="dsh_agent">CIZHENYU AGENT (dsh_agent)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {loading && !bootstrap ? (
          <div className="empty-box">正在加载本地站点列表…</div>
        ) : sites.length === 0 ? (
          <div className="empty-box">
            暂无前端站点。在上方输入一个英文标识点击「创建站点并安装依赖」，即可用 Agent 对话构建你的第一个 Astro v7 站点。
          </div>
        ) : (
          <div className="site-list">
            {sites.map((site) => (
              <SiteProjectCard
                key={site.siteKey}
                site={site}
                selectedAgentId={selectedAgentId}
                busyKey={busyKey}
                onOpenAgent={openWithAgent}
                onRetryInstall={retryInstall}
                onOpenFolder={openFolder}
                onDeleteSite={deleteSite}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
