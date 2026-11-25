---
name: cms-crm-deploy-workflow
description: 前后台数据对接、CMS 集合字段约束、CRM 挂载、Deploy Seed 数据注入与 Cloudflare 边缘部署全流程规范。当用户要求对接后台、导入数据或发布上线时使用。
---

# CMS / CRM 对接、Seed 注入与边缘上线工作流

当用户在对话中对静态站点满意，要求对接后台 CMS、配置 CRM 或部署上线时，请严格按以下规范调用已注入的 **`cmsmcp`**、**`crmmcp`** 与 **`webdesign`（含 `deploy_*`）** MCP 工具完成闭环。

## 1. 先查 Deploy 环境上下文
首先调用 `deploy_get_context`：
- 检查 `cms.loggedIn` 与 `cms.origin`（若未登录，提示用户在 Deploy 中登录目标 CMS）；
- 检查 `crm.loggedIn` 与 `crm.origin`（若需对接 CRM）；
- 检查 `cf.authorized` 与 `cf.zones`（获取可用的 Cloudflare 自定义域名后缀）。

## 2. `cizhenyu_payload` 三层字段铁律与集合建模
在修改集合或建表前，必须同步维护 `src/data/contracts/collections.contract.ts` 并调用 **`webdesign_validate_cms_contract`** 校验通过：
- **命名空间隔离**：设 `ns = siteKey.replace(/-/g, '_')`。所有集合 `slug` 必须为 `{ns}_{logical}`（例如 `acme_product`、`acme_company_info`、`acme_inquiry`），导航分组统一挂在 `{ns}/settings|products|content|business` 下。
- **优先复用全局共享模型**：标准模型（`company_info`、`b2b_product`、`product_category`、`article`、`case_study`、`industry`、`faq`、`page`、`content_block`、`nav_menu`、`b2b_inquiry`、`online_message`）直接复用，**严禁修改已有全局共享模型字段**。若确需新增自定义模型，`modelSlug` 必须以 `{ns}_` 开头（如 `acme_timeline`）。
- **三层字段禁忌**：
  1. **严禁定义系统表列名**：`id`, `locale`, `language_group_key`, `created_at`, `updated_at`, `created_by`, `updated_by`。
  2. **保留能力字段锁定**：公开读取列表集合（`apiMode: "public_read"`）使用 `status`（`select`: `draft`/`published`）与 `sort_order`（`number`）；匿名提交表单集合（`apiMode: "submit_only"`，如 `{ns}_inquiry`）**严禁包含 `status` 字段**。
  3. **合法字段类型**：仅限 `text`, `textarea`, `number`, `select`, `multi_select`, `boolean`, `date`, `image`, `file`, `richtext`, `json`, `relation`, `relation_multi`, `reference`。

### 调用 `cmsmcp` 幂等建表顺序（向用户确认后传 `confirm: true`）
1. `cms_nav_group_ensure`：创建 `{ns}` 及其子分组（`settings`、`products`、`content`、`business`）。
2. `cms_models_ensure`：仅在存在 `{ns}_*` 自定义新模型时调用（会自动跳过已存在的全局模型）。
3. `cms_collections_ensure`：按契约创建全部 `{ns}_{logical}` 集合并自动设置 `public_read` 或 `submit_only` 公开策略。

## 3. 一键调用 Deploy 灌入 `seed/` 多语种初始数据与媒体
集合创建完成后，无需手写逐条插入脚本：
1. 确认站点根目录 `seed/seed.manifest.json` 的 `locales` 与 `seedOrder` 完整包含了所有 `seed/*.json` 文件（注意展示类条目需含 `"status": "published"`，图片可放 `seed/media/` 并在 JSON 中引用相对路径）。
2. 调用 **`deploy_inject_seed`**（传 `siteKey` 与 `confirm: true`）：Deploy 原生引擎会自动将 `seed/media/*` 上传至 CMS R2 存储、将 `b2b_*` 重写为 `{ns}_*`、解析 `__BY_SLUG__` 关联并幂等批量写入全部语种数据！
3. 将 `src/data/site.config.json` 中的 `"dataSource"` 改为 `"cms"`，并在 `src/data/loaders/site-loader.ts` 中确保所有集合请求路径对齐 `/api/p/data/{ns}/{subGroup}/{ns}_{logical}`。

## 4. 留资表单与 CRM 对接（按用户决策二选一或组合）
- **方案 A（默认内置，零外部依赖）**：使用 CMS 原生 `{ns}_inquiry` 集合，前端 `InquiryForm.astro` 通过 `/api/inquiry` 提交至 `/api/p/submit/{ns}/business/{ns}_inquiry`。
- **方案 B（挂载 CRM 在线客服/线索组件）**：若用户希望接入已部署的 CRM 系统，从 `deploy_get_context` 获取 `crm.origin`（或通过 `crmmcp` 的 `crm_whoami` 核验），将一行挂件脚本写入 `src/data/site.config.json` 的 `"customHeadScript"` 字段（`BaseLayout.astro` 会自动注入 `<head>`），并提醒用户在 CRM 后台将该站点域名加入白名单。日常客户查询与跟进可直接调用 `crmmcp` 工具。

## 5. 一键构建并发布到 Cloudflare 边缘网络
1. 先本地执行 `npx astro check` 与 `webdesign_audit_seo_geo` 确保零错误。
2. 向用户确认目标域名（可留空使用默认 `*.workers.dev`，或选用 `cf.zones` 下的自定义子域名如 `www.example.com`）。
3. 调用 **`deploy_publish_site`**（传 `siteKey`、`domain`、`confirm: true`）：工具会自动执行 `npm run build` 并通过 Deploy 将 Astro v7 产物上传至 Cloudflare Workers Static Assets，自动配置 `SITE_KEY` / `PUBLIC_CMS_API_BASE` / `REVALIDATE_SECRET`、绑定自定义域名、开启 48h 边缘 HTML 缓存规则，并在 CMS 自动注册 `FrontendSite` 刷新回调。
