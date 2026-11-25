# Cizhenyu WebDesign Studio (`webdesign`)

基于 Astro 5 的单站可视化前端设计器与前后台数据对接工作台（Deploy `config.type = "page"` 协议工具）。

## 核心特性

1. **三层目录解耦**：工具运行于 `{systemRoot}/scripts/webdesign`，所有生成的独立 Astro 站点存放在用户工作目录 `{workRoot}/sites/<siteKey>`。
2. **渐进式非必填配置**：支持仅凭一句话构想开建，也支持补充品牌色板、参考站点、栏目规划与企业产品素材。
3. **内置 SEO / GEO 与边缘缓存底座**：出厂自带 `SeoHead`、Schema.org JSON-LD、`hreflang`、`sitemap.xml`、`llms.txt`、`GeoAnswer` 以及 Cloudflare Pages 48h 边缘 HTML 缓存与 `/api/revalidate` 失效接口。
4. **两阶段 Agent 协同工作流**：
   - **阶段一（全静态构建）**：调起 DSH / OpenCode 生成全静态 Astro 站点并本地实时预览，打磨至满意。
   - **阶段二（CMS 字段约束与对接）**：校验 `cizhenyu_payload` 三层字段契约，调起 Agent 通过 `cmsmcp` 自动创建 `{siteKey}_{logical}` 集合、导入初始数据并切换前端数据源，最后一键发布 Cloudflare Pages。

## 常用命令

```bash
# 构建管理台前端 UI（开发修改 ui/ 后执行，产物输出至 public/）
npm run ui:build

# 常驻服务管理
node manage.mjs start
node manage.mjs status
node manage.mjs stop
```
