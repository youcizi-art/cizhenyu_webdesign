import { useEffect, useState } from 'react';
import { Bot, FolderOpen, Palette, Save, Sparkles } from 'lucide-react';
import type { DetectedAgentItem, SiteBrief, SiteDetail } from '../types/studio';

const LOCALE_OPTIONS = [
  { code: 'en-US', label: 'English (en-US)' },
  { code: 'zh-CN', label: '简体中文 (zh-CN)' },
  { code: 'es-ES', label: 'Español (es-ES)' },
  { code: 'ja', label: '日本語 (ja)' },
  { code: 'zh-TW', label: '繁體中文 (zh-TW)' },
];

const PAGE_PRESETS = [
  { key: 'home', label: '首页 (Home)' },
  { key: 'products', label: '产品中心与详情 (Products)' },
  { key: 'solutions', label: '行业解决方案 (Solutions)' },
  { key: 'cases', label: '客户案例 (Case Studies)' },
  { key: 'articles', label: '技术指南与博客 (Insights)' },
  { key: 'faq', label: '常见问题 (FAQ)' },
  { key: 'about', label: '关于我们 (About)' },
  { key: 'contact', label: '联系与在线询盘 (Contact)' },
];

interface BriefStudioPanelProps {
  site: SiteDetail | null;
  isCreatingNew: boolean;
  agents: DetectedAgentItem[];
  selectedAgentId: string;
  busyAction: string;
  onChangeAgent: (agentId: string) => void;
  onSaveOnly: (brief: Partial<SiteBrief> & { siteKey: string }) => Promise<void>;
  onDispatchAgent: (
    siteKey: string,
    brief: Partial<SiteBrief>,
    agentId: string,
    extraInstruction: string
  ) => Promise<void>;
  onOpenFolder: (siteKey: string) => void;
}

/**
 * 阶段一：渐进式非必填建站设置与 Agent 一键派单面板
 */
export function BriefStudioPanel({
  site,
  isCreatingNew,
  agents,
  selectedAgentId,
  busyAction,
  onChangeAgent,
  onSaveOnly,
  onDispatchAgent,
  onOpenFolder,
}: BriefStudioPanelProps) {
  const [siteKey, setSiteKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [oneLiner, setOneLiner] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [accentColor, setAccentColor] = useState('#0ea5e9');
  const [surfaceMode, setSurfaceMode] = useState<'light' | 'dark' | 'industrial'>('light');
  const [styleNotes, setStyleNotes] = useState('');
  const [refUrlsText, setRefUrlsText] = useState('');
  const [desiredPages, setDesiredPages] = useState<string[]>(['home', 'products', 'articles', 'about', 'contact']);
  const [locales, setLocales] = useState<string[]>(['en-US', 'zh-CN']);
  const [defaultLocale, setDefaultLocale] = useState('en-US');
  const [rawMaterials, setRawMaterials] = useState('');
  const [customHeadScript, setCustomHeadScript] = useState('');
  const [extraInstruction, setExtraInstruction] = useState('');

  useEffect(() => {
    if (isCreatingNew || !site) {
      setSiteKey('');
      setDisplayName('');
      setOneLiner('');
      setPrimaryColor('#2563eb');
      setAccentColor('#0ea5e9');
      setSurfaceMode('light');
      setStyleNotes('');
      setRefUrlsText('');
      setDesiredPages(['home', 'products', 'articles', 'about', 'contact']);
      setLocales(['en-US', 'zh-CN']);
      setDefaultLocale('en-US');
      setRawMaterials('');
      setCustomHeadScript('');
      setExtraInstruction('');
      return;
    }
    const b = site.brief;
    setSiteKey(site.siteKey);
    setDisplayName(b.displayName || site.displayName);
    setOneLiner(b.oneLiner || '');
    setPrimaryColor(b.primaryColor || '#2563eb');
    setAccentColor(b.accentColor || '#0ea5e9');
    setSurfaceMode(b.surfaceMode || 'light');
    setStyleNotes(b.styleNotes || '');
    setRefUrlsText((b.referenceUrls || []).join('\n'));
    setDesiredPages(b.desiredPages?.length ? b.desiredPages : ['home', 'products', 'about', 'contact']);
    setLocales(site.locales?.length ? site.locales : ['en-US']);
    setDefaultLocale(site.defaultLocale || 'en-US');
    setRawMaterials(b.rawMaterials || '');
    setCustomHeadScript(b.customHeadScript || '');
  }, [site, isCreatingNew]);

  const toggleItem = (list: string[], value: string, setter: (next: string[]) => void, minOne = false) => {
    if (list.includes(value)) {
      if (minOne && list.length <= 1) return;
      setter(list.filter((x) => x !== value));
    } else {
      setter([...list, value]);
    }
  };

  const collectPayload = (): Partial<SiteBrief> & { siteKey: string } => {
    const validDefLocale = locales.includes(defaultLocale) ? defaultLocale : locales[0] || 'en-US';
    return {
      siteKey: siteKey.trim().toLowerCase(),
      displayName: displayName.trim() || siteKey.trim(),
      oneLiner: oneLiner.trim(),
      primaryColor,
      accentColor,
      surfaceMode,
      styleNotes: styleNotes.trim(),
      referenceUrls: refUrlsText
        .split(/\r?\n|,/)
        .map((u) => u.trim())
        .filter(Boolean),
      desiredPages,
      locales,
      defaultLocale: validDefLocale,
      rawMaterials: rawMaterials.trim(),
      customHeadScript: customHeadScript.trim(),
    };
  };

  const handleSave = async () => {
    const payload = collectPayload();
    if (!payload.siteKey) return;
    await onSaveOnly(payload);
  };

  const handleSaveAndDispatch = async () => {
    const payload = collectPayload();
    if (!payload.siteKey) return;
    if (isCreatingNew) {
      await onSaveOnly(payload);
    }
    await onDispatchAgent(payload.siteKey, payload, selectedAgentId, extraInstruction.trim());
    setExtraInstruction('');
  };

  return (
    <div>
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <Sparkles size={18} color="#2563eb" />
              <span>{isCreatingNew ? '新建站点：一句话即可启动，信息越丰富越贴合构想' : `站点构想与设计配置（${site?.siteKey}）`}</span>
            </h2>
            <p className="panel-desc">
              仅站点标识必填；色调、参考网站、栏目结构与产品资料均为选填，系统会自动合并内置的 SEO/GEO 与集合通用基线写入站点目录。
            </p>
          </div>
          {!isCreatingNew && site ? (
            <button type="button" className="btn" onClick={() => onOpenFolder(site.siteKey)}>
              <FolderOpen size={15} />
              <span>打开站点目录</span>
            </button>
          ) : null}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="wd-site-key">
              <span>站点英文标识 (siteKey) *</span>
              <span className="field-optional">对应目录 sites/&lt;siteKey&gt;</span>
            </label>
            <input
              id="wd-site-key"
              className="input"
              placeholder="例如: acme-dental 或 precision-laser"
              value={siteKey}
              disabled={!isCreatingNew}
              onChange={(e) => setSiteKey(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="wd-display-name">
              <span>站点 / 品牌显示名称</span>
              <span className="field-optional">选填</span>
            </label>
            <input
              id="wd-display-name"
              className="input"
              placeholder="例如: Acme Dental Tech"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="wd-one-liner">
            <span>一句话核心构想 / 业务定位</span>
            <span className="field-optional">哪怕只写这一句话也可以直接生成整站</span>
          </label>
          <textarea
            id="wd-one-liner"
            className="textarea"
            rows={3}
            placeholder="例如：做一个面向欧美牙科诊所与义齿加工厂的 3D 口内扫描仪 B2B 独立站，突出亚微米精度、临床易用性与快速打样，整体清爽专业医疗科技风。"
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
          />
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <Palette size={17} color="#2563eb" />
              <span>可选增强配置：色调、参考站、结构与原始资料</span>
            </h3>
            <p className="panel-desc">按需补充，留空项将由 Agent 根据行业定位自主规划最优方案。</p>
          </div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="wd-primary-color">
              <span>品牌主色</span>
              <span className="field-optional">{primaryColor}</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                style={{ width: 42, height: 36, padding: 2, border: '1px solid var(--border-input)', borderRadius: 6 }}
              />
              <input
                id="wd-primary-color"
                className="input"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="wd-accent-color">
              <span>辅助点缀色</span>
              <span className="field-optional">{accentColor}</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                style={{ width: 42, height: 36, padding: 2, border: '1px solid var(--border-input)', borderRadius: 6 }}
              />
              <input
                id="wd-accent-color"
                className="input"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="wd-surface-mode">
              <span>界面底色气质</span>
              <span className="field-optional">选填</span>
            </label>
            <select
              id="wd-surface-mode"
              className="select"
              value={surfaceMode}
              onChange={(e) => setSurfaceMode(e.target.value as 'light' | 'dark' | 'industrial')}
            >
              <option value="light">浅色清爽现代 (Light Editorial)</option>
              <option value="dark">深色先锋科技 (Refined Dark Slate)</option>
              <option value="industrial">工业硬朗高对比 (Industrial Precision)</option>
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="wd-ref-urls">
              <span>站点参考 URL（每行一个）</span>
              <span className="field-optional">Agent 可结合 Firecrawl 参考版式节奏</span>
            </label>
            <textarea
              id="wd-ref-urls"
              className="textarea"
              rows={3}
              placeholder="https://example-competitor-a.com&#10;https://example-competitor-b.com"
              value={refUrlsText}
              onChange={(e) => setRefUrlsText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="wd-style-notes">
              <span>视觉与交互细节偏好</span>
              <span className="field-optional">选填</span>
            </label>
            <textarea
              id="wd-style-notes"
              className="textarea"
              rows={3}
              placeholder="例如：首屏直接放核心参数对比卡，字体大气克制，少用花哨渐变，突出工程实力与快速询盘入口。"
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>
              <span>站点启用语种（点击切换）</span>
              <span className="field-optional">至少保留一个语种</span>
            </label>
            <div className="chip-group">
              {LOCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  className="chip-toggle"
                  data-checked={locales.includes(opt.code) ? 'true' : 'false'}
                  onClick={() => toggleItem(locales, opt.code, setLocales, true)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="wd-default-locale">
              <span>默认主语种</span>
              <span className="field-optional">根路径自动跳转语种</span>
            </label>
            <select
              id="wd-default-locale"
              className="select"
              value={locales.includes(defaultLocale) ? defaultLocale : locales[0] || 'en-US'}
              onChange={(e) => setDefaultLocale(e.target.value)}
            >
              {locales.map((code) => {
                const found = LOCALE_OPTIONS.find((o) => o.code === code);
                return (
                  <option key={code} value={code}>
                    {found ? found.label : code}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="field">
          <label>
            <span>期望包含的栏目结构</span>
            <span className="field-optional">选填</span>
          </label>
          <div className="chip-group">
            {PAGE_PRESETS.map((pg) => (
              <button
                key={pg.key}
                type="button"
                className="chip-toggle"
                data-checked={desiredPages.includes(pg.key) ? 'true' : 'false'}
                onClick={() => toggleItem(desiredPages, pg.key, setDesiredPages, false)}
              >
                {pg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="wd-materials">
            <span>站点原始资料（企业简介、产品型号与真实规格、联系方式、FAQ 等）</span>
            <span className="field-optional">自动落盘至 .webdesign/materials/ 供 Agent 读取</span>
          </label>
          <textarea
            id="wd-materials"
            className="textarea"
            rows={5}
            placeholder="可直接粘贴产品画册文字、核心技术指标、工厂优势、真实邮箱电话等。未提供的部分将生成结构化演示数据，绝不捏造虚假认证。"
            value={rawMaterials}
            onChange={(e) => setRawMaterials(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="wd-head-script">
            <span>自定义头部脚本插槽 (Head Script)</span>
            <span className="field-optional">选填：如需挂载外部 CRM 在线客服或统计分析一行代码可在此填入</span>
          </label>
          <input
            id="wd-head-script"
            className="input"
            placeholder='例如: <script src="https://crm.example.com/widget.js" defer></script>'
            value={customHeadScript}
            onChange={(e) => setCustomHeadScript(e.target.value)}
          />
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <Bot size={18} color="#2563eb" />
              <span>阶段一派单：写入站点目录并调起 Agent 构建全静态站点</span>
            </h3>
            <p className="panel-desc">
              系统会将上述特殊配置与通用基线（SEO/GEO + 集合规范）写入站点工程，并自动注入 MCP 与建站 Skill 后打开所选 Agent。
            </p>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="wd-agent-select">选择执行构建的已安装 Agent</label>
            <select
              id="wd-agent-select"
              className="select"
              value={selectedAgentId}
              onChange={(e) => onChangeAgent(e.target.value)}
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

          <div className="field">
            <label htmlFor="wd-extra-inst">
              <span>本次迭代微调指令</span>
              <span className="field-optional">二次修改局部视觉或补充页面时填写</span>
            </label>
            <input
              id="wd-extra-inst"
              className="input"
              placeholder="例如：把首页 Hero 改成左右分栏，并增加一个应用场景对比页"
              value={extraInstruction}
              onChange={(e) => setExtraInstruction(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!siteKey.trim() || Boolean(busyAction)}
            onClick={() => void handleSaveAndDispatch()}
          >
            <Bot size={16} />
            <span>
              {busyAction === 'dispatch-stage1'
                ? '正在装填工作区并唤起 Agent…'
                : '保存配置并唤起 Agent 构建静态站'}
            </span>
          </button>

          <button
            type="button"
            className="btn"
            disabled={!siteKey.trim() || Boolean(busyAction)}
            onClick={() => void handleSave()}
          >
            <Save size={15} />
            <span>{isCreatingNew ? '仅初始化空白脚手架站点' : '仅保存配置更改'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
