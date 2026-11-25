/**
 * 平台通用基线配置生成器、cizhenyu_payload 三层字段合规校验器及两阶段 Agent 任务书生成器。
 */

export const SYSTEM_RESERVED_COLUMNS = [
  'id',
  'locale',
  'language_group_key',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
];

export const ALLOWED_CMS_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'select',
  'multi_select',
  'boolean',
  'date',
  'image',
  'file',
  'richtext',
  'json',
  'relation',
  'relation_multi',
  'reference',
];

export const GLOBAL_SHARED_MODELS = [
  'company_info',
  'b2b_product',
  'product_category',
  'product_spec_template',
  'article',
  'case_study',
  'industry',
  'faq',
  'page',
  'content_block',
  'content_category',
  'resource',
  'nav_menu',
  'nav_menu_item',
  'b2b_inquiry',
  'online_message',
];

export function buildPlatformBaselineSpec(siteKey) {
  return {
    version: 1,
    siteKey,
    architecture: 'single-site-astro-v5',
    seoBaseline: {
      requiredHeadComponent: 'src/core/seo/SeoHead.astro',
      requiredRoutes: ['/robots.txt', '/sitemap.xml', '/llms.txt', '/api/revalidate'],
      perPageRules: [
        '每个页面必须且仅包含一个语义化 <h1>',
        '所有页面通过 BaseLayout 注入 canonical、hreflang（含 x-default）、OpenGraph 与 Schema.org JSON-LD',
      ],
    },
    geoBaseline: {
      requiredAnswerComponent: 'src/core/geo/GeoAnswer.astro',
      requiredSpecComponent: 'src/core/geo/SpecTable.astro',
      rules: [
        '首页、产品详情页、核心文章/方案页必须输出 short_answer 简答块（供 AI 搜索引擎直接引用事实）',
        '严禁捏造未提供的认证编号、客户背书或销量数据',
      ],
    },
    cmsContractRules: {
      collectionSlugPattern: `${siteKey}_{logical}`,
      navGroupRoot: siteKey,
      publicReadEndpointPattern: `/api/p/data/${siteKey}/{groupSubPath}/${siteKey}_{logical}`,
      publicSubmitEndpointPattern: `/api/p/submit/${siteKey}/business/${siteKey}_{logical}`,
      systemReservedColumns: SYSTEM_RESERVED_COLUMNS,
      allowedFieldTypes: ALLOWED_CMS_FIELD_TYPES,
      globalSharedModels: GLOBAL_SHARED_MODELS,
      capabilityFields: {
        status: {
          capability: 'public_visibility',
          type: 'select',
          options: ['draft', 'published'],
          note: '展示类集合开启；表单提交类集合（inquiry/online_message）严禁添加 status',
        },
        sort_order: {
          capability: 'list_ordering',
          type: 'number',
        },
      },
    },
  };
}

/**
 * 校验站点的 CMS 集合与字段契约是否 100% 符合 cizhenyu_payload 三层字段与命名空间规范。
 */
export function validateCmsContract(siteKey, collections = []) {
  const slugRe = /^[a-z][a-z0-9_]{1,62}$/;
  const ns = String(siteKey || '').trim().toLowerCase().replace(/-/g, '_');
  const errors = [];
  const warnings = [];
  const normalizedCollections = [];

  if (!slugRe.test(ns)) {
    errors.push(`站点 CMS 命名空间 "${ns}" 不符合小写字母/数字/下划线规则`);
  }
  if (!Array.isArray(collections) || collections.length === 0) {
    errors.push('未检测到任何集合契约定义');
    return { valid: false, errors, warnings, collections: [] };
  }

  const seenCollectionSlugs = new Set();

  for (const col of collections) {
    const logical = String(col.logical || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    if (!logical || !slugRe.test(logical)) {
      errors.push(`逻辑集合名不合法: "${col.logical}"`);
      continue;
    }
    const fullSlug = `${ns}_${logical}`;
    if (seenCollectionSlugs.has(fullSlug)) {
      errors.push(`集合 slug 重复: "${fullSlug}"`);
    }
    seenCollectionSlugs.add(fullSlug);

    let modelSlug = String(col.modelSlug || logical).trim().toLowerCase().replace(/-/g, '_');
    const isShared = GLOBAL_SHARED_MODELS.includes(modelSlug);
    if (!isShared && !modelSlug.startsWith(`${ns}_`)) {
      warnings.push(
        `集合 "${fullSlug}" 使用了非标准全局模型 "${modelSlug}"，建议命名为 "${ns}_${modelSlug}" 以免跨站点模型冲突`
      );
      modelSlug = `${ns}_${modelSlug}`;
    }

    const apiMode = col.apiMode === 'submit_only' ? 'submit_only' : 'public_read';
    const fields = Array.isArray(col.fields) ? col.fields : [];
    const seenFields = new Set();

    for (const f of fields) {
      const fname = String(f.name || '').trim();
      const ftype = String(f.type || '').trim();
      if (!fname || !slugRe.test(fname)) {
        errors.push(`[${fullSlug}] 字段名 "${fname}" 不合法（须为小写 snake_case）`);
        continue;
      }
      if (SYSTEM_RESERVED_COLUMNS.includes(fname)) {
        errors.push(`[${fullSlug}] 字段 "${fname}" 与 CMS 系统表列保留字冲突，禁止写入模型 fields`);
      }
      if (seenFields.has(fname)) {
        errors.push(`[${fullSlug}] 字段 "${fname}" 重复定义`);
      }
      seenFields.add(fname);

      if (!ALLOWED_CMS_FIELD_TYPES.includes(ftype)) {
        errors.push(`[${fullSlug}.${fname}] 字段类型 "${ftype}" 不在 cizhenyu_payload 支持范围内`);
      }
      if (fname === 'status' && apiMode === 'submit_only') {
        errors.push(`[${fullSlug}] 表单提交集合禁止包含 status 保留字段（否则会拦截匿名行为或引发歧义）`);
      }
      if (fname === 'status' && ftype !== 'select') {
        errors.push(`[${fullSlug}.status] 保留字段 status 类型必须为 select`);
      }
      if (fname === 'sort_order' && ftype !== 'number') {
        errors.push(`[${fullSlug}.sort_order] 保留字段 sort_order 类型必须为 number`);
      }
    }

    const groupSub = String(col.groupSubPath || 'content').replace(/^\/+|\/+$/g, '');
    normalizedCollections.push({
      logical,
      name: String(col.name || logical),
      slug: fullSlug,
      modelSlug,
      reuseGlobalModel: isShared,
      groupPath: `${ns}/${groupSub}`,
      presentationMode: col.presentationMode === 'single_form' ? 'single_form' : 'list',
      apiMode,
      fields,
    });
  }

  return {
    valid: errors.length === 0,
    namespace: ns,
    errors,
    warnings,
    collections: normalizedCollections,
  };
}

export function generateSiteAgentsMd(brief) {
  return `# ${brief.displayName || brief.siteKey} — 单站 Astro 工程协作规范

本目录是由 **Cizhenyu WebDesign Studio** 创建的独立 Astro v7 前端站点工程（\`{workRoot}/sites/${brief.siteKey}\`）。

## 必读上下文文件
1. **当次任务指令**：\`.webdesign/TASK.md\`（每次由 WebDesign 派单更新，请优先阅读并严格执行！）
2. **站点特殊配置**：\`.webdesign/site-brief.json\`（用户的建站一句话构想、品牌色调、参考站、栏目偏好、语种及原始素材）
3. **平台通用配置**：\`.webdesign/platform-spec.json\`（预置的 SEO/GEO 标准与 \`cizhenyu_payload\` 集合字段契约规范）

## 核心工程红线
- **单站纯净架构**：禁止引入多主题分发层；所有视觉组件直接写在 \`src/components/\` 与 \`src/pages/[locale]/\`。
- **保护核心底座**：保留 \`src/core/\`（SEOHead、Schema.org JSON-LD、GeoAnswer、llms.txt、48h 边缘 HTML 缓存与 revalidate）正常工作。
- **两阶段数据解耦**：
  - **阶段一（全静态构建）**：\`src/data/site.config.json\` 保持 \`"dataSource": "mock"\`，所有展示数据集中在 \`src/data/mocks/seed.json\`，页面统一经 \`src/data/loaders/site-loader.ts\` 取数。
  - **阶段二（CMS 对接）**：按 \`.webdesign/cms-contract.json\` 调用 \`cmsmcp\` 创建 \`${brief.siteKey.replace(/-/g, '_')}_*\` 集合并导入初始数据，仅切换 \`dataSource\` 与 \`loaders/\`，不破坏已定稿的前端视觉。
- **视觉与数据诚实**：禁止使用 Emoji 作为界面图标；禁止编造用户未提供的证书编号、客户评价或销量排名。
`;
}

export function generateStage1TaskMarkdown(brief, extraInstruction = '') {
  const refList = (brief.referenceUrls || []).filter(Boolean);
  const pagesList = (brief.desiredPages || []).filter(Boolean);
  return `# 阶段一任务单：构建 / 迭代全静态 Astro 前端站点

- **站点标识 (siteKey)**：\`${brief.siteKey}\`
- **站点名称**：${brief.displayName || brief.siteKey}
- **启用语种**：${(brief.locales || ['en-US']).join(', ')}（默认主语种：\`${brief.defaultLocale || 'en-US'}\`）

## 1. 用户建站核心构想
> ${brief.oneLiner || '请结合站点名称构建现代、专业、高转化的企业前端独立站。'}

${extraInstruction ? `## 2. 本次迭代补充要求\n${extraInstruction}\n` : ''}
## 3. 已提供的个性化设置（未填项请结合行业特征自主设计最优方案）
- **色调与视觉风格**：主色 \`${brief.primaryColor || 'auto'}\` · 辅色 \`${brief.accentColor || 'auto'}\` · 明暗气质 \`${brief.surfaceMode || 'auto'}\` · 风格备注：${brief.styleNotes || '现代简洁、高可读性'}
- **参考网站 URL**：${refList.length ? refList.join(' , ') : '未指定'}
- **期望栏目结构**：${pagesList.length ? pagesList.join(' / ') : '由你根据业务构想自动规划合理栏目'}
- **企业与产品原始资料**：
${brief.rawMaterials ? brief.rawMaterials : '（用户暂未提供详细文本素材，请生成符合业务定位、克制真实的专业结构化占位演示内容，放入 src/data/mocks/seed.json）'}

## 4. 执行步骤清单
1. 先阅读技能说明 \`.agents/skills/astro-static-site-design/SKILL.md\`（或 \`.opencode/skill/astro-static-site-design/SKILL.md\`）及 \`.webdesign/platform-spec.json\`。
2. 更新 \`src/data/site.config.json\`（保持 \`"dataSource": "mock"\`）、\`src/data/contracts/collections.contract.ts\` 与多语种演示数据 \`src/data/mocks/seed.json\`。
3. 定制专属的 \`src/styles/tokens.css\`、\`src/components/*\` 与 \`src/pages/[locale]/*\` 页面，确保每页具备完整的 \`SeoHead\`、唯一 \`<h1>\`、Schema.org JSON-LD 与核心页 \`<GeoAnswer>\`。
4. 调用 \`webdesign_audit_seo_geo\` 与 \`webdesign_validate_cms_contract\` 自检无误，并运行 \`npm run build\`（若尚未安装依赖先执行 \`npm install\`）确认构建零报错。
`;
}

export function generateStage2TaskMarkdown(brief, validationResult, cmsOrigin, extraInstruction = '') {
  return `# 阶段二任务单：CMS 集合字段建模与前后台自动对接

- **站点标识 (siteKey)**：\`${brief.siteKey}\`（CMS 集合命名空间前缀：\`${validationResult.namespace}_*\`）
- **目标 CMS 地址**：\`${cmsOrigin || '当前 Deploy 已登录的活跃 CMS'}\`
- **启用语种**：${(brief.locales || ['en-US']).join(', ')}

${extraInstruction ? `## 补充对接说明\n${extraInstruction}\n` : ''}
## 1. 已通过合规校验的集合契约（详见 \`.webdesign/cms-contract.json\`）
${validationResult.collections
  .map(
    (c) =>
      `- **${c.name}** → 集合 \`${c.slug}\` | 模型 \`${c.modelSlug}\` (${
        c.reuseGlobalModel ? '复用全局标准模型' : '站点专属模型'
      }) | 分组 \`${c.groupPath}\` | 权限 \`${c.apiMode}\``
  )
  .join('\n')}

## 2. 执行步骤清单
1. 先阅读技能说明 \`.agents/skills/astro-cms-wiring/SKILL.md\`（或 \`.opencode/skill/astro-cms-wiring/SKILL.md\`）。
2. 调用 \`cmsmcp\` 的 \`cms_whoami\` 确认连接正常。
3. 按已确认的任务单（传 \`confirm=true\`）依次调用：
   - \`cms_nav_group_ensure\`（创建 \`${validationResult.namespace}/*\` 导航分组）
   - \`cms_models_ensure\`（仅补齐线上缺失的模型，严禁覆盖已有公共模型）
   - \`cms_collections_ensure\`（创建 \`${validationResult.namespace}_*\` 集合并配置公开只读 / 询盘 \`submit_only\` 策略）
   - \`cms_entity_save\`（将 \`src/data/mocks/seed.json\` 中的多语种静态演示数据批量写入对应集合作为初始内容）
   - \`cms_frontend_site_upsert\`（登记前端站点域名与 \`/api/revalidate\` 刷新配置）
4. 对齐 \`src/data/loaders/site-loader.ts\`，并将 \`src/data/site.config.json\` 的 \`"dataSource"\` 切换为 \`"cms"\`（保持前端视觉组件不变）。
5. 运行 \`npm run build\` 验证构建产物 \`dist/_worker.js\` 正常生成，并汇报创建的集合列表与导入条数。
`;
}
