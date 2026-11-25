---
name: astro-cms-wiring
description: 阶段二 Astro 站点与 cizhenyu_payload CMS 集合字段自动对接规范。当用户对静态站满意并触发前后台数据对接时必须遵守本技能。
---

# 阶段二：CMS 集合建模、数据迁移与前后台对接规范

当前站点的前端视觉已在阶段一定稿。你的任务是在**不破坏现有前端页面视觉与样式**的前提下，完成 `cizhenyu_payload` 后台集合建模、初始数据导入与前端动态接口接线。

## 1. 前置检查与契约读取
1. 阅读 `.webdesign/TASK.md` 与 `.webdesign/cms-contract.json`（经校验锁定的集合与字段映射方案）。
2. 调用 `webdesign` MCP 的 `webdesign_validate_cms_contract` 确认契约 100% 通过校验。
3. 调用 `cmsmcp` 的 `cms_whoami`、`cms_models_list`、`cms_collections_list`（传 `siteKey`）检查当前 CMS 登录态与线上已有模型/集合。

## 2. CMS 后台幂等建模与约束铁律（须经用户确认或按已批准任务单传 `confirm=true`）
1. **绝不修改全局共享模型**：
   - 标准模型（`company_info`, `b2b_product`, `product_category`, `article`, `case_study`, `industry`, `faq`, `page`, `content_block`, `nav_menu`, `nav_menu_item`, `b2b_inquiry`, `online_message`）若线上已存在，直接复用。
   - 若线上缺少所需模型，或本站包含定制模型（必须以 `{siteKey}_` 开头命名），调用 `cms_models_ensure`（内部只创建缺失模型，自动跳过已有模型）。
2. **创建站点隔离集合与分组**：
   - 调用 `cms_nav_group_ensure` 确保 `{siteKey}/settings`、`{siteKey}/products`、`{siteKey}/content`、`{siteKey}/business` 分组存在。
   - 调用 `cms_collections_ensure` 实例化 `{siteKey}_{logical}` 集合，自动为展示集合开启 `public_read`、为询盘/留言集合（`{siteKey}_inquiry`）配置 `submit_only`（严禁公开读取客户询盘）。
3. **导入阶段一静态数据作为 CMS 初始内容**：
   - 读取 `src/data/mocks/seed.json` 中各语种数据，调用 `cms_entity_save`（带统一 `languageGroupKey` 关联多语种同条内容，展示内容带 `"status": "published"`）写入对应的 `{siteKey}_{logical}` 集合。
4. **注册前端站点缓存刷新回调**：
   - 调用 `cms_frontend_site_upsert` 注册当前 `siteKey`、`siteOrigin` 与 `revalidateUrl`（`{siteOrigin}/api/revalidate`）。

## 3. 前端切换至 CMS 动态模式
1. 检查并对齐 `src/data/loaders/site-loader.ts`：确保所有集合路径通过 `collectionFullPath(groupSubPath, logical)` 请求 `/api/p/data/{siteKey}/...`，询盘表单通过 `cmsSubmitForm('business', 'inquiry', payload)` 提交至 `/api/p/submit/{siteKey}/business/{siteKey}_inquiry`。
2. 将 `src/data/site.config.json` 中的 `"dataSource"` 更新为 `"cms"`（保留 `mocks/seed.json` 作为类型与空态兜底参考，不改动 `src/components/` 与页面视觉）。
3. 执行 `npm run build` 验证 SSR 构建产物（`dist/_worker.js`）生成正常，并汇总已创建的集合、导入的记录数及 `revalidateSecret` 反馈给用户。
