import { useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from 'lucide-react';
import type { SiteSummary } from '../types/studio';

interface SiteProjectCardProps {
  site: SiteSummary;
  selectedAgentId: string;
  busyKey: string;
  onOpenAgent: (siteKey: string, agentId: string) => Promise<void>;
  onRetryInstall: (siteKey: string) => Promise<void>;
  onStartPreview: (siteKey: string) => Promise<void>;
  onStopPreview: (siteKey: string) => Promise<void>;
  onOpenFolder: (siteKey: string) => Promise<void>;
  onDeleteSite: (siteKey: string) => Promise<void>;
}

/**
 * 单个 Astro v7 站点卡片：展示依赖就绪状态、一键预览/关闭与「用 Agent 打开」核心入口
 */
export function SiteProjectCard({
  site,
  selectedAgentId,
  busyKey,
  onOpenAgent,
  onRetryInstall,
  onStartPreview,
  onStopPreview,
  onOpenFolder,
  onDeleteSite,
}: SiteProjectCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isOpening = busyKey === `open:${site.siteKey}`;
  const isInstalling = site.installStatus === 'installing' || busyKey === `install:${site.siteKey}`;
  const isStartingPreview = busyKey === `preview-start:${site.siteKey}`;
  const isStoppingPreview = busyKey === `preview-stop:${site.siteKey}`;
  const previewRunning = Boolean(site.preview?.running);

  return (
    <div className="site-card">
      <div className="site-card-main">
        <div className="site-title-row">
          <h3 className="site-title">{site.displayName}</h3>
          <code className="site-key-tag">{site.siteKey}</code>

          {isInstalling ? (
            <span className="status-pill status-blue">
              <Loader2 size={13} className="spin-icon" />
              <span>正在安装依赖…</span>
            </span>
          ) : site.installStatus === 'ready' ? (
            <span className="status-pill status-green">
              <CheckCircle2 size={13} />
              <span>依赖已就绪</span>
            </span>
          ) : (
            <span className="status-pill status-amber">
              <AlertCircle size={13} />
              <span>依赖未就绪</span>
            </span>
          )}

          <span className="status-pill status-neutral">
            {site.dataSource === 'cms' ? 'CMS 动态数据' : '本地 Seed 静态模式'}
          </span>

          {previewRunning && site.preview?.port ? (
            <span className="status-pill status-blue">
              <span>预览运行中 :{site.preview.port}</span>
            </span>
          ) : null}
        </div>

        <div className="site-meta-path">{site.path}</div>

        {site.installError ? (
          <div className="site-error-box">{site.installError}</div>
        ) : null}
      </div>

      <div className="site-card-actions">
        {site.installStatus !== 'ready' && !isInstalling ? (
          <button
            type="button"
            className="btn"
            disabled={Boolean(busyKey)}
            onClick={() => void onRetryInstall(site.siteKey)}
          >
            <RefreshCw size={14} />
            <span>安装依赖</span>
          </button>
        ) : null}

        {site.installStatus === 'ready' ? (
          previewRunning ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={Boolean(busyKey)}
                onClick={() => void onStartPreview(site.siteKey)}
              >
                <ExternalLink size={14} />
                <span>打开预览</span>
              </button>
              <button
                type="button"
                className="btn"
                disabled={Boolean(busyKey)}
                onClick={() => void onStopPreview(site.siteKey)}
              >
                <Square size={13} />
                <span>{isStoppingPreview ? '正在关闭…' : '关闭预览'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={Boolean(busyKey)}
              onClick={() => void onStartPreview(site.siteKey)}
            >
              {isStartingPreview ? (
                <Loader2 size={14} className="spin-icon" />
              ) : (
                <Play size={14} />
              )}
              <span>{isStartingPreview ? '启动预览中…' : '预览'}</span>
            </button>
          )
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(busyKey)}
          onClick={() => void onOpenAgent(site.siteKey, selectedAgentId)}
        >
          <Bot size={15} />
          <span>{isOpening ? '正在唤起 Agent…' : '用 Agent 打开'}</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          title="在文件管理器中打开站点目录"
          onClick={() => void onOpenFolder(site.siteKey)}
        >
          <FolderOpen size={15} />
          <span>目录</span>
        </button>

        {confirmingDelete ? (
          <div className="delete-confirm-group">
            <button
              type="button"
              className="btn btn-danger"
              disabled={Boolean(busyKey)}
              onClick={() => {
                setConfirmingDelete(false);
                void onDeleteSite(site.siteKey);
              }}
            >
              确认删除
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            title="删除本地站点目录"
            disabled={Boolean(busyKey)}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
