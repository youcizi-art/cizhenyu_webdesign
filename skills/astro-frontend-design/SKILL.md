---
name: astro-frontend-design
description: Astro v7 + Tailwind CSS v4 + DaisyUI v5 + Lucide 图标单站前端视觉设计与边聊边改规范。在创建或修改前端页面、主题配色、版式与演示内容时使用。
---

# Astro v7 + DaisyUI v5 前端视觉设计与交互规范

当前工作区是由 **WebDesign Studio** 初始化的独立 **Astro v7 (`^7.4.12`) + `@astrojs/cloudflare` v14** 前端站点工程，已预装商业级设计体系：
- **Tailwind CSS v4 (`@tailwindcss/vite`)**
- **DaisyUI v5（MIT 开源免费语义组件与主题引擎）**
- **`@tailwindcss/typography`（`prose` 富文本出版级排版）**
- **`@lucide/astro`（1500+ 套统一线条矢量图标，官方支持 Astro v7，编译期直出内联 SVG）**

## 1. 先定主题，禁止手写散装 CSS
- **全局样式入口**：`src/styles/global.css` 已启用 Tailwind v4、Typography 与 DaisyUI v5 多套内置主题（`corporate`、`business`、`light`、`nord`、`lofi`、`emerald`、`luxury`、`dim`）。
- **快速切换行业气质**：在 `src/data/site.config.json` 修改 `"theme": "corporate"`（例如医疗/SaaS 用 `nord` 或 `corporate`、重工/硬件用 `business` 或 `dim`、高端品牌用 `luxury`、环保/能源用 `emerald`），`BaseLayout.astro` 会自动同步 `<html data-theme="...">`。
- **定制品牌专属色板**：若用户给出了具体品牌主辅色，在 `src/styles/global.css` 中使用 DaisyUI v5 原生 CSS 主题块 `@plugin "daisyui/theme" { name: "brand"; default: true; --color-primary: ...; --color-secondary: ...; --color-base-100: ...; }` 统一覆盖，**不要在各个 `.astro` 页面中散落硬编码十六进制色值**。

## 2. 组件、排版与图标规范（拒绝“丑陋 AI 味”）
- **优先使用 DaisyUI 语义组件 + Tailwind 布局**：导航栏 `navbar`、首屏 `hero`、指标卡 `stats`、内容卡片 `card`、按钮 `btn btn-primary/outline/ghost`、标签 `badge`、折叠 FAQ `collapse collapse-arrow`、规格表 `table table-zebra`、表单 `input input-bordered` / `textarea textarea-bordered`。
- **富文本统一套 `prose`**：产品详细介绍、文章正文、关于我们等长文本区域统一加 `class="prose prose-lg max-w-none"`，确保标题层级、段落间距、列表与引用美观协调。
- **图标统一用 `@lucide/astro`**：直接 `import { ArrowRight, ShieldCheck, Factory, Mail } from '@lucide/astro';`，渲染 `<ShieldCheck class="size-5 text-primary" />`。**严禁使用 Emoji 充当界面图标，也不要手写粗糙的 `<svg>` 路径。**
- **克制的视觉层次与留白**：合理使用 `max-w-6xl mx-auto px-4 sm:px-6` 与 `py-16 sm:py-24` 呼吸留白；避免刺眼的高饱和紫蓝霓虹渐变与堆砌阴影；全面适配移动端响应式。

## 3. 边聊边改与同构 `seed/` 数据约定
- **静态期保持 `dataSource: "mock"`**：所有多语种文案、产品、文章、FAQ 均维护在根目录 `seed/*.json`（配图放 `seed/media/`），页面统一经 `src/data/loaders/site-loader.ts` 取数，确保后续调用 `deploy_inject_seed` 可零转换一键灌入 CMS。
- **数据诚实铁律**：用户提供真实参数时准确录入；未提供时生成克制专业的行业演示文案，**严禁捏造虚假认证编号、客户证言或销量排名**。
- **修改后自检**：运行 `npx astro check` 确认零类型错误，并调用 `webdesign_audit_seo_geo` 验证 SEO/GEO 得分 100%。
