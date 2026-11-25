---
name: astro-static-site-design
description: 阶段一全静态 Astro 站点设计与实现规范。当构建或优化 {workRoot}/sites/{siteKey} 下的静态前端站点时必须阅读并遵守本技能。
---

# 阶段一：单站 Astro 全静态设计与构建规范

你正在为用户构建或迭代一个独立的 Astro v7 前端站点（搭配 `@astrojs/cloudflare` v14 与 `wrangler.jsonc`）。请严格按以下顺序工作：

## 1. 先读工作区内的双层配置文件
1. 阅读根目录 `AGENTS.md` 与 `.webdesign/TASK.md`（本次具体任务目标）。
2. 阅读 `.webdesign/site-brief.json`（用户的站点构想、色调偏好、参考网站、期望栏目、语种及 `.webdesign/materials/` 下的真实素材）。
3. 阅读 `.webdesign/platform-spec.json`（平台通用 SEO/GEO 规范与 `cizhenyu_payload` 集合字段契约字典）。
4. 若用户在 `site-brief.json` 中提供了参考网站 URL 且当前环境已挂载 `firecrawl` 工具，可先抓取参考站分析其版式节奏与信息层级（**严禁照抄他站品牌名与文案**）。

## 2. 架构边界与铁律（严禁破坏）
- **保护 `src/core/` 底座**：`src/core/seo/`、`src/core/geo/`、`src/core/cache/`、`src/core/cms/` 与 `src/middleware.ts` 已经完成了生产级 SEO、GEO（`llms.txt` / `GeoAnswer` / JSON-LD）、多语种路由与 48h 边缘 HTML 缓存优化。除非修复明确类型问题，**不要删除或弱化 `src/core/` 能力**。
- **阶段一保持 `dataSource: "mock"`**：
  - `src/data/site.config.json` 中的 `"dataSource"` 在阶段一固定保持 `"mock"`。
  - 所有页面文案与演示数据按语种写入 `src/data/mocks/seed.json`（或同目录 JSON），并通过 `src/data/loaders/site-loader.ts` 提供给页面，**禁止在 `.astro` 页面中散落硬编码大段业务数据**，以便阶段二无缝对接 CMS。
- **字段提前对齐 CMS 规范**：
  - 如果新增了自定义业务模块，同步更新 `src/data/contracts/collections.contract.ts`。
  - 严禁使用系统保留列名（`id`, `locale`, `language_group_key`, `created_at`, `updated_at`, `created_by`, `updated_by`）作为业务字段名；字段类型必须属于 `cizhenyu_payload` 支持的 14 种类型。

## 3. 视觉审美与 SEO / GEO 硬性标准
- **现代高质感视觉**：根据 `site-brief.json` 的行业气质与主辅色定制 `src/styles/tokens.css`、`src/components/*` 与 `src/pages/[locale]/*`。杜绝纯黑 `#000000`/纯白刺眼对比、杜绝使用 Emoji 充当 UI 图标（统一使用干净的内联 SVG 矢量图标）、留白充足、全面适配移动端响应式。
- **数据诚实原则**：用户提供了真实公司/产品参数时准确呈现；用户仅给了一句话描述时，生成专业、克制、符合行业常识的演示文案，**禁止编造虚假的 ISO/CE 证书编号、虚假客户评价或虚构销量排名**。
- **每页必配 SEO & GEO**：
  - 每个页面必须有且仅有一个语义清晰的 `<h1>`，并通过 `BaseLayout` 传入专属 `title`、`description`、`restPath` 与 Schema.org `jsonLdNodes`。
  - 首页、产品详情页、核心文章/方案页必须渲染 `<GeoAnswer>` 组件（对应数据的 `short_answer` 字段），产品详情页提供结构化参数表 `<SpecTable>`。

## 4. 完工自检（必做）
完成代码编写后：
1. 若环境挂载了 `webdesign` MCP，调用 `webdesign_audit_seo_geo` 与 `webdesign_validate_cms_contract`，修复所有告警或错误。
2. 执行 `npx astro check` 或 `npm run build` 确认零 TypeScript / Astro 编译错误后再向用户汇报完成。
