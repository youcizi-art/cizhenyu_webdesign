/**
 * cizhenyu_payload 三层字段合规校验器与单站 AGENTS.md 生成器。
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
    errors.push('未检测到任何集合契约定义（请检查 src/data/contracts/collections.contract.ts）');
    return { valid: false, namespace: ns, errors, warnings, collections: [] };
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
        `集合 "${fullSlug}" 使用了非标准全局模型 "${modelSlug}"，建议命名为 "${ns}_${modelSlug}" 以防跨站模型冲突`
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
        errors.push(`[${fullSlug}] 表单提交集合禁止包含 status 保留字段`);
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

export function generateSiteAgentsMd(siteKey, displayName) {
  const ns = siteKey.replace(/-/g, '_');
  return `# ${displayName || siteKey} — Astro v7 单站开发与全链路交付指南

本工作区是由 **WebDesign Studio** 初始化的独立 **Astro v7 (\`^7.4.12\`) + \`@astrojs/cloudflare\` v14** 前端站点工程（站点目录标识：\`${siteKey}\`，CMS 集合命名空间：\`${ns}_*\`）。

## 1. 已注入项目的三大核心 Skills（动手前必读）
请在 \`.agents/skills/\`（或 \`.opencode/skill/\`）下按当前任务阶段查阅对应规范：
1. **\`astro-frontend-design\`**：高审美前端视觉设计、CSS 变量定制、响应式版式与 \`seed/\` 静态期数据规范。
2. **\`seo-geo-optimization\`**：预置 \`SeoHead\`、唯一 \`<h1>\`、Schema.org JSON-LD、\`/llms.txt\`、\`<GeoAnswer />\` 与 48h 边缘缓存标准。
3. **\`cms-crm-deploy-workflow\`**：\`cizhenyu_payload\` 三层字段铁律、\`cmsmcp\` 幂等建表、\`crmmcp\` / CRM 挂件接入、\`deploy_inject_seed\` 数据上云与 \`deploy_publish_site\` 边缘部署流程。

## 2. 推荐对话协作流
1. **边聊边改构建全静态站**：保持 \`src/data/site.config.json\` 中 \`"dataSource": "mock"\`。将多语种演示数据写入 \`seed/*.json\`（配图放 \`seed/media/\`），修改 \`src/styles/tokens.css\`、\`src/components/*\` 与 \`src/pages/[locale]/*\`，可启动 \`npm run dev\` 供用户实时预览，并用 \`webdesign_audit_seo_geo\` 自检。
2. **满意后对接 CMS / CRM**：先运行 \`webdesign_validate_cms_contract\` 校验 \`src/data/contracts/collections.contract.ts\`，再调用 \`cmsmcp\` 创建 \`${ns}_*\` 集合，接着调用 \`deploy_inject_seed\` 一键将 \`seed/\` 数据与图片灌入 CMS，并将 \`dataSource\` 切换为 \`"cms"\`。如需挂载 CRM，可通过 \`deploy_get_context\` / \`crmmcp\` 读取 CRM 地址并写入 \`customHeadScript\`。
3. **一键部署上线**：调用 \`deploy_publish_site\` 自动完成 \`astro build\`、Cloudflare Workers Static Assets 上传、自定义域名绑定、48h 边缘 HTML 缓存配置与 CMS \`FrontendSite\` 注册。
`;
}
