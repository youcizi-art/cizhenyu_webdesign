# Cizhenyu WebDesign Studio (`webdesign`)

极简 Astro v7 单站项目初始化与 Agent 建站装配器（Deploy `config.type = "page"` 协议工具）。

## 核心职责

1. **创建即就绪**：在 `{workRoot}/sites/<siteKey>` 下创建干净的单站 **Astro v7 (`^7.4.12`) + `@astrojs/cloudflare` v14** 工程（预置 SEO/GEO/48h 边缘 HTML 缓存内核与同构 `seed/` 数据目录），并自动执行 `npm install` 安装依赖。
2. **注入规范与全套 MCP**：自动向站点注入前端设计、SEO/GEO 合规与 CMS/CRM/Deploy 交付三大 Skills，并在点击 **「用 Agent 打开」** 时自动挂载 `cmsmcp`、`crmmcp` 与 `webdesign`（含 Deploy Seed 数据注入与边缘上线能力）。
3. **全对话闭环**：无需在工具里填复杂表单，直接在 Agent 对话中边聊边改页面、创建 CMS 集合、灌入 `seed/` 多语种数据与媒体、挂载 CRM 或一键部署至 Cloudflare 边缘网络。

## 常用命令

```bash
# 重新构建前端界面（修改 ui/ 后执行，输出至 public/）
npm run ui:build

# 本地常驻服务管理
node manage.mjs start
node manage.mjs status
node manage.mjs stop
```
