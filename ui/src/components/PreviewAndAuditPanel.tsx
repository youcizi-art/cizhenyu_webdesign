import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Square,
  Tablet,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { SeoGeoAuditResult, SiteDetail } from '../types/studio';

interface PreviewAndAuditPanelProps {
  site: SiteDetail;
  audit: SeoGeoAuditResult | null;
  busyAction: string;
  selectedAgentId: string;
  onTogglePreview: (siteKey: string, start: boolean) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  onRefreshAudit: (siteKey: string) => Promise<void>;
  onDispatchFix: (siteKey: string, instruction: string) => Promise<void>;
}

/**
 * 本地实时响应式预览与内置 SEO / GEO 合规体检面板
 */
export function PreviewAndAuditPanel({
  site,
  audit,
  busyAction,
  onTogglePreview,
  onOpenExternal,
  onRefreshAudit,
  onDispatchFix,
}: PreviewAndAuditPanelProps) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeNonce, setIframeNonce] = useState(0);

  const iframeWidth =
    viewport === 'mobile' ? '390px' : viewport === 'tablet' ? '768px' : '100%';

  const failedChecks = (audit?.checks || []).filter((c) => !c.ok);

  return (
    <div>
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <Monitor size={18} color="#2563eb" />
              <span>本地 Astro 实时预览（{site.displayName}）</span>
            </h2>
            <p className="panel-desc">
              当前数据源模式：
              <strong>{site.dataSource === 'cms' ? 'CMS 真实公开接口' : 'Mock 全静态演示数据'}</strong>
              {site.preview.url ? ` · 运行于 ${site.preview.url}` : ''}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {site.preview.running ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIframeNonce((n) => n + 1)}
                >
                  <RefreshCw size={14} />
                  <span>刷新画面</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => site.preview.url && void onOpenExternal(site.preview.url)}
                >
                  <ExternalLink size={14} />
                  <span>浏览器打开</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busyAction === 'preview'}
                  onClick={() => void onTogglePreview(site.siteKey, false)}
                >
                  <Square size={14} />
                  <span>停止预览</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyAction === 'preview'}
                onClick={() => void onTogglePreview(site.siteKey, true)}
              >
                <Play size={15} />
                <span>{busyAction === 'preview' ? '正在启动 Astro 预览服务…' : '启动本地实时预览'}</span>
              </button>
            )}
          </div>
        </div>

        {site.preview.running && site.preview.url ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className="chip-toggle"
                data-checked={viewport === 'desktop' ? 'true' : 'false'}
                onClick={() => setViewport('desktop')}
              >
                <Monitor size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                桌面端 (100%)
              </button>
              <button
                type="button"
                className="chip-toggle"
                data-checked={viewport === 'tablet' ? 'true' : 'false'}
                onClick={() => setViewport('tablet')}
              >
                <Tablet size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                平板 (768px)
              </button>
              <button
                type="button"
                className="chip-toggle"
                data-checked={viewport === 'mobile' ? 'true' : 'false'}
                onClick={() => setViewport('mobile')}
              >
                <Smartphone size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                手机 (390px)
              </button>
            </div>
            <div className="preview-frame-wrap">
              <iframe
                key={`${site.preview.url}-${iframeNonce}`}
                src={site.preview.url}
                title="Site Live Preview"
                className="preview-iframe"
                style={{ width: iframeWidth }}
              />
            </div>
          </>
        ) : (
          <div
            style={{
              padding: '44px 20px',
              textAlign: 'center',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
            }}
          >
            点击右上角「启动本地实时预览」，即可在此处多端检视 Astro 站点效果（首次启动若未装依赖会自动执行 npm install）。
          </div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <ShieldCheck size={18} color="#2563eb" />
              <span>SEO / GEO 与边缘缓存基线体检</span>
              {audit ? (
                <span className={`badge ${audit.allPassed ? 'badge-green' : 'badge-amber'}`}>
                  得分 {audit.score} ({audit.passed}/{audit.total})
                </span>
              ) : null}
            </h3>
            <p className="panel-desc">
              自动核验 Canonical/hreflang、唯一 H1、`/sitemap.xml`、`/llms.txt`、`GeoAnswer` 简答覆盖率与 48h 边缘缓存配置。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => void onRefreshAudit(site.siteKey)}>
              <RefreshCw size={14} />
              <span>重新扫描</span>
            </button>
            {failedChecks.length > 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void onDispatchFix(
                    site.siteKey,
                    `请修复以下未通过的 SEO/GEO 体检项：${failedChecks.map((f) => `${f.title} (${f.detail})`).join('；')}`
                  )
                }
              >
                <Wrench size={14} />
                <span>让 Agent 自动修复 ({failedChecks.length})</span>
              </button>
            ) : null}
          </div>
        </div>

        <table className="table-clean">
          <thead>
            <tr>
              <th style={{ width: 90 }}>维度</th>
              <th style={{ width: 90 }}>状态</th>
              <th>检查项</th>
              <th>诊断详情</th>
            </tr>
          </thead>
          <tbody>
            {(audit?.checks || []).map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="badge badge-blue">{item.category}</span>
                </td>
                <td>
                  {item.ok ? (
                    <span className="badge badge-green">
                      <CheckCircle2 size={12} />
                      通过
                    </span>
                  ) : (
                    <span className="badge badge-red">
                      <XCircle size={12} />
                      待修复
                    </span>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{item.title}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
