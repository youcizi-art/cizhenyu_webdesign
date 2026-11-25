import { useState } from 'react';
import { Cloud, ExternalLink, Hammer, Rocket } from 'lucide-react';
import type { BridgeContextInfo, SiteDetail } from '../types/studio';

interface PublishPagesPanelProps {
  site: SiteDetail;
  context: BridgeContextInfo | null;
  busyAction: string;
  onRunBuild: (siteKey: string) => Promise<{ ok: boolean; distDir: string; logs: string } | null>;
  onPublishPages: (
    siteKey: string,
    domain: string,
    projectName: string
  ) => Promise<{ deploy: { siteUrl: string; pagesDevUrl: string; projectName: string } } | null>;
  onOpenExternal: (url: string) => Promise<void>;
}

/**
 * 本地生产构建验证与 Cloudflare Pages 一键上线面板（复用 Deploy Direct Upload 与 48h 边缘缓存规则）
 */
export function PublishPagesPanel({
  site,
  context,
  busyAction,
  onRunBuild,
  onPublishPages,
  onOpenExternal,
}: PublishPagesPanelProps) {
  const [domain, setDomain] = useState('');
  const [projectName, setProjectName] = useState(`site-${site.siteKey}`);
  const [buildLogs, setBuildLogs] = useState('');
  const [deployedUrl, setDeployedUrl] = useState('');

  const cfReady = Boolean(context?.cf?.authorized);
  const zones = context?.cf?.zones || [];

  const handleBuild = async () => {
    const res = await onRunBuild(site.siteKey);
    if (res?.logs) setBuildLogs(res.logs);
  };

  const handlePublish = async () => {
    const res = await onPublishPages(site.siteKey, domain.trim(), projectName.trim());
    if (res?.deploy?.siteUrl) {
      setDeployedUrl(res.deploy.siteUrl);
    }
  };

  return (
    <div>
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <Rocket size={18} color="#2563eb" />
              <span>单站 Astro 构建与 Cloudflare Pages 上线</span>
            </h2>
            <p className="panel-desc">
              支持将全静态站或已对接 CMS 的动态站直接打包上传至 Cloudflare Pages，自动写入环境变量、自定义域名及 48h 边缘 HTML 缓存规则。
            </p>
          </div>
          <span className={`badge ${cfReady ? 'badge-green' : 'badge-amber'}`}>
            <Cloud size={13} />
            {cfReady ? 'Cloudflare 已就绪' : '请先在 Deploy 授权 Cloudflare'}
          </span>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="wd-pages-proj">
              <span>Cloudflare Pages 项目名</span>
              <span className="field-optional">不存在时自动创建</span>
            </label>
            <input
              id="wd-pages-proj"
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="wd-custom-domain">
              <span>自定义生产域名</span>
              <span className="field-optional">留空则仅发布至 *.pages.dev</span>
            </label>
            <input
              id="wd-custom-domain"
              className="input"
              list="wd-cf-zones"
              placeholder={zones[0] ? `例如: www.${zones[0].name}` : '例如: www.example.com'}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <datalist id="wd-cf-zones">
              {zones.map((z) => (
                <option key={z.id} value={`www.${z.name}`} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={Boolean(busyAction)}
            onClick={() => void handleBuild()}
          >
            <Hammer size={15} />
            <span>{busyAction === 'build' ? '正在执行 astro build…' : '仅本地生产构建验证'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!cfReady || Boolean(busyAction)}
            onClick={() => void handlePublish()}
          >
            <Rocket size={15} />
            <span>
              {busyAction === 'publish'
                ? '正在构建并上传至 Cloudflare Pages…'
                : '构建并一键发布到 Cloudflare Pages'}
            </span>
          </button>

          {deployedUrl ? (
            <button type="button" className="btn" onClick={() => void onOpenExternal(deployedUrl)}>
              <ExternalLink size={14} />
              <span>访问线上站点 ({deployedUrl})</span>
            </button>
          ) : null}
        </div>

        {buildLogs ? (
          <pre
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 'var(--radius-sm)',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: 12,
              maxHeight: 260,
              overflow: 'auto',
            }}
          >
            {buildLogs}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
