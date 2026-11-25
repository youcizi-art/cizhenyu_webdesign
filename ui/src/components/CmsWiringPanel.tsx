import { useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Database, KeyRound, RefreshCw } from 'lucide-react';
import type { BridgeContextInfo, CmsContractValidation, SiteDetail } from '../types/studio';

interface CmsWiringPanelProps {
  site: SiteDetail;
  contract: CmsContractValidation | null;
  context: BridgeContextInfo | null;
  selectedAgentId: string;
  busyAction: string;
  onRefreshContract: (siteKey: string) => Promise<void>;
  onOpenCmsLogin: (origin: string) => Promise<void>;
  onDispatchStage2: (siteKey: string, agentId: string, extraInstruction: string) => Promise<void>;
}

/**
 * 阶段二：cizhenyu_payload 三层字段强约束审查与前后台自动对接面板
 */
export function CmsWiringPanel({
  site,
  contract,
  context,
  selectedAgentId,
  busyAction,
  onRefreshContract,
  onOpenCmsLogin,
  onDispatchStage2,
}: CmsWiringPanelProps) {
  const [cmsOriginInput, setCmsOriginInput] = useState(context?.cms?.origin || '');
  const [extraNote, setExtraNote] = useState('');

  const cmsLoggedIn = Boolean(context?.cms?.loggedIn);
  const valid = Boolean(contract?.valid);

  return (
    <div>
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <Database size={18} color="#2563eb" />
              <span>第一关：目标 CMS（cizhenyu_payload）连接确认</span>
            </h2>
            <p className="panel-desc">
              阶段二将调用 `cmsmcp` 在后台为您幂等创建 `{contract?.namespace || site.siteKey}_*` 集合并导入阶段一的静态演示内容。
            </p>
          </div>
          <span className={`badge ${cmsLoggedIn ? 'badge-green' : 'badge-amber'}`}>
            {cmsLoggedIn ? `已连接: ${context?.cms?.origin}` : '尚未登录 CMS'}
          </span>
        </div>

        {!cmsLoggedIn ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ maxWidth: 380 }}
              placeholder="输入您的 CMS 管理端地址，如 https://admin.example.com"
              value={cmsOriginInput}
              onChange={(e) => setCmsOriginInput(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!cmsOriginInput.trim()}
              onClick={() => void onOpenCmsLogin(cmsOriginInput.trim())}
            >
              <KeyRound size={15} />
              <span>打开 Deploy CMS 登录窗口</span>
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            当前活跃管理员会话：<strong>{context?.cms?.origin}</strong>
            {context?.cms?.username ? `（账号：${context.cms.username}）` : ''}。全局公共模型受只增不改保护，不会影响同库其它站点。
          </div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <span>第二关：集合与三层字段契约强校验</span>
              {contract ? (
                <span className={`badge ${contract.valid ? 'badge-green' : 'badge-red'}`}>
                  {contract.valid ? '合规校验通过' : `${contract.errors.length} 项冲突待修正`}
                </span>
              ) : null}
            </h3>
            <p className="panel-desc">
              扫描自 `src/data/contracts/collections.contract.ts`。自动拦截保留列名冲突、非法字段类型及表单集合公开泄露风险。
            </p>
          </div>
          <button type="button" className="btn" onClick={() => void onRefreshContract(site.siteKey)}>
            <RefreshCw size={14} />
            <span>重新扫描契约</span>
          </button>
        </div>

        {contract?.errors?.length ? (
          <div
            style={{
              background: 'var(--danger-bg)',
              color: 'var(--danger-text)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
            }}
          >
            {contract.errors.map((err, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} />
                <span>{err}</span>
              </div>
            ))}
          </div>
        ) : null}

        <table className="table-clean">
          <thead>
            <tr>
              <th>目标集合 Slug</th>
              <th>关联模型</th>
              <th>导航分组</th>
              <th>公开接口策略</th>
              <th>约束字段摘要</th>
            </tr>
          </thead>
          <tbody>
            {(contract?.collections || []).map((col) => (
              <tr key={col.slug}>
                <td style={{ fontWeight: 600 }}>
                  <div>{col.slug}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{col.name}</div>
                </td>
                <td>
                  <span className={`badge ${col.reuseGlobalModel ? 'badge-blue' : 'badge-amber'}`}>
                    {col.modelSlug} ({col.reuseGlobalModel ? '复用全局模型' : '站点专属'})
                  </span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{col.groupPath}</td>
                <td>
                  <span className={`badge ${col.apiMode === 'submit_only' ? 'badge-amber' : 'badge-green'}`}>
                    {col.apiMode === 'submit_only' ? '仅允许匿名提交 (submit)' : '公开只读 (data)'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {col.fields.map((f) => (
                      <span
                        key={f.name}
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: 'var(--bg-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {f.name}:{f.type}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <CheckCircle2 size={18} color="#2563eb" />
              <span>第三关：唤起 Agent 完成集合创建、初始数据迁移与前后台接线</span>
            </h3>
            <p className="panel-desc">
              前端静态视觉完全保留不变，Agent 将自动建好集合、把 `mocks/seed.json` 写入 CMS 并将站点 `dataSource` 切换为 `"cms"`。
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="wd-stage2-note">
            <span>对接补充说明</span>
            <span className="field-optional">选填</span>
          </label>
          <input
            id="wd-stage2-note"
            className="input"
            placeholder="例如：仅导入英文和简体中文演示数据，保留联系页使用 CMS 原生询盘集合"
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || Boolean(busyAction)}
          onClick={() => void onDispatchStage2(site.siteKey, selectedAgentId, extraNote.trim())}
        >
          <Bot size={16} />
          <span>
            {busyAction === 'dispatch-stage2'
              ? '正在注入 cmsmcp 并唤起 Agent…'
              : '确认字段契约并唤起 Agent 完成前后台对接'}
          </span>
        </button>
      </div>
    </div>
  );
}
