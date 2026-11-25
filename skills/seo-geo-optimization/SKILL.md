---
name: seo-geo-optimization
description: Astro 站点预置 SEO / GEO（生成式搜索引擎优化）与 48h 边缘缓存合规标准。在新增页面、修改路由或准备上线前必须遵守并自检。
---

# 站点 SEO / GEO 与边缘性能规范

本工程已在 `src/core/` 与 `src/middleware.ts` 预置了完整的生产级 SEO、GEO 与边缘 HTML 缓存底座，**严禁删除或弱化 `src/core/` 下的核心能力**。

## 1. 每页必配的 SEO 标准
1. **统一接入 `BaseLayout.astro`**：每个业务页面必须传入语义明确、不重复的 `title`、`description`、`locale`、`restPath`（用于自动生成 Canonical 与多语种 `hreflang` + `x-default` 互链）。
2. **唯一 `<h1>` 铁律**：每个页面必须有且仅有一个包含核心业务关键词的 `<h1>` 标题，标题层级严格遵循 `h1 -> h2 -> h3`。
3. **结构化数据（Schema.org JSON-LD）**：通过 `src/core/seo/schema-org.ts` 构建并向 `BaseLayout` 传入 `jsonLdNodes`（首页配 `Organization` + `FAQPage`，产品详情页配 `Product` + `BreadcrumbList`，文章页配 `Article` + `BreadcrumbList`）。
4. **全站索引路由**：新增语种或新增动态内容集合路由后，同步确保 `src/pages/sitemap.xml.ts` 能自动收录对应 URL，且 `src/pages/robots.txt.ts` 正确指向 Sitemap。

## 2. 每页必配的 GEO（AI 搜索友好）标准
1. **首屏客观事实简答（`<GeoAnswer />`）**：首页、产品详情页、核心方案/文章页必须在首屏区域挂载 `src/core/geo/GeoAnswer.astro`，绑定对应数据条目的 `short_answer` 字段（50～120 字高信息密度客观结论，便于 ChatGPT / Perplexity / Google AI Overviews 直接引用）。
2. **结构化参数表（`<SpecTable />`）**：产品或技术方案页优先使用语义化 `<table>`（`src/core/geo/SpecTable.astro`）呈现可量化的规格指标，而非纯图片参数表。
3. **AI 索引清单 `/llms.txt`**：保持 `src/pages/llms.txt.ts` 正常输出企业定位、核心产品摘要与规范链接。

## 3. 边缘缓存与流式陷阱防范
- `src/middleware.ts` 使用 `await response.arrayBuffer()` 读取 HTML 并写入 48h `CDN-Cache-Control` 与 Worker Cache API，配合 `src/pages/api/revalidate.ts` 实现后台更新精准清缓存。请勿将中间件改写为不安全的流式 `response.clone()`。

## 4. 确定性自检工具
每次新增或大改页面后，调用 MCP 工具 **`webdesign_audit_seo_geo`**（传入当前 `siteKey`）执行自动扫描，确保得分 100% 无缺失项。
