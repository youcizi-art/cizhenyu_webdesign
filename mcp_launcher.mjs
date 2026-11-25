#!/usr/bin/env node
/**
 * WebDesign Studio MCP Server（stdio newline-delimited JSON-RPC）。
 * 为 Agent 提供：
 * 1. 站点 SEO / GEO 确定性体检与 CMS 三层字段契约校验；
 * 2. 直通 Deploy 本机桥的环境上下文查询、`seed/` 数据及媒体一键灌入 CMS、以及 Cloudflare 边缘部署服务。
 */
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  deployStandaloneSiteViaBridge,
  getBridgeContextSafe,
  injectSeedViaBridge,
} from './server/bridge-client.mjs';
import {
  auditSiteSeoGeo,
  buildSiteForProduction,
  getSiteDetail,
  inspectSiteCmsContract,
} from './server/site-manager.mjs';

const SERVER_NAME = 'cizhenyu-webdesign';
const SERVER_VERSION = '0.2.0';
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'webdesign_audit_seo_geo',
    description:
      '对指定 Astro 站点运行确定性 SEO / GEO / 48h 边缘缓存合规自检（唯一 H1、SeoHead、llms.txt、GeoAnswer 覆盖率与 seed/company_info.json 摘要完备度）。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识（即 sites/<siteKey> 目录名）' },
      },
      required: ['siteKey'],
    },
  },
  {
    name: 'webdesign_validate_cms_contract',
    description:
      '校验站点 src/data/contracts/collections.contract.ts 中的集合与字段契约是否 100% 符合 cizhenyu_payload 三层字段规则（拦截保留字冲突、非法字段类型及命名空间错误）。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识' },
      },
      required: ['siteKey'],
    },
  },
  {
    name: 'deploy_get_context',
    description:
      '查询当前 Deploy 桌面底座的连接状态：包括活跃 CMS 地址与登录态、活跃 CRM 地址与登录态、Cloudflare 授权态及可用域名 Zone 列表。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'deploy_inject_seed',
    description:
      '调用 Deploy 原生 Seed 数据与媒体注入引擎：将站点根目录 seed/ 下的多语种 JSON 与 seed/media/ 本地图片自动上传至 CMS R2 并幂等灌入 {siteKey}_* 集合（执行写操作需传 confirm=true）。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识（即 sites/<siteKey> 目录名）' },
        cmsOrigin: {
          type: 'string',
          description: '可选：目标 CMS 地址；留空则自动使用 Deploy 当前已登录的活跃 CMS',
        },
        skipExisting: {
          type: 'boolean',
          description: '可选：true 仅补写缺失语种，false（默认）按 languageGroupKey 全量更新写入',
        },
        locales: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：仅注入指定的语种数组；留空则按条目内实际语种全量写入',
        },
        confirm: {
          type: 'boolean',
          description: '写操作安全门禁：必须确认后显式传 true',
        },
      },
      required: ['siteKey', 'confirm'],
    },
  },
  {
    name: 'deploy_publish_site',
    description:
      '构建单站 Astro v7 生产产物并调用 Deploy 边缘部署服务：一键上传至 Cloudflare Workers Static Assets、写入 SITE_KEY / REVALIDATE_SECRET / PUBLIC_CMS_API_BASE、绑定自定义域名、配置 48h 边缘 HTML 缓存规则并同步注册 CMS FrontendSite（需传 confirm=true）。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识（即 sites/<siteKey> 目录名）' },
        domain: {
          type: 'string',
          description: '可选：自定义生产域名（如 www.example.com）；留空则分配默认 *.workers.dev 域名',
        },
        projectName: {
          type: 'string',
          description: '可选：Cloudflare Worker 服务名；留空默认为 site-<siteKey>',
        },
        cmsOrigin: {
          type: 'string',
          description: '可选：关联的 CMS 地址；留空自动读取 Deploy 当前活跃 CMS',
        },
        confirm: {
          type: 'boolean',
          description: '线上部署门禁：经用户确认后显式传 true',
        },
      },
      required: ['siteKey', 'confirm'],
    },
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function callTool(name, args) {
  switch (name) {
    case 'webdesign_audit_seo_geo': {
      const ctx = await getBridgeContextSafe();
      return auditSiteSeoGeo(args.siteKey, ctx?.sitesDir || '');
    }
    case 'webdesign_validate_cms_contract': {
      const ctx = await getBridgeContextSafe();
      return inspectSiteCmsContract(args.siteKey, ctx?.sitesDir || '');
    }
    case 'deploy_get_context': {
      return getBridgeContextSafe();
    }
    case 'deploy_inject_seed': {
      if (args.confirm !== true) {
        throw new Error('安全门禁拦截：执行 deploy_inject_seed 前请向用户确认并传 confirm=true');
      }
      const ctx = await getBridgeContextSafe();
      const detail = getSiteDetail(args.siteKey, ctx?.sitesDir || '');
      return injectSeedViaBridge({
        siteKey: detail.namespace,
        seedDir: join(detail.path, 'seed'),
        cmsOrigin: args.cmsOrigin || ctx?.cms?.origin || '',
        skipExisting: Boolean(args.skipExisting),
        locales: Array.isArray(args.locales) ? args.locales : undefined,
      });
    }
    case 'deploy_publish_site': {
      if (args.confirm !== true) {
        throw new Error('安全门禁拦截：执行 deploy_publish_site 前请向用户确认并传 confirm=true');
      }
      const ctx = await getBridgeContextSafe();
      const sitesDir = ctx?.sitesDir || '';
      const detail = getSiteDetail(args.siteKey, sitesDir);
      const built = await buildSiteForProduction(args.siteKey, sitesDir);
      const deployed = await deployStandaloneSiteViaBridge({
        siteKey: detail.namespace,
        displayName: detail.displayName,
        distDir: built.distDir,
        domain: String(args.domain || '').trim(),
        projectName: String(args.projectName || '').trim(),
        cmsOrigin: String(args.cmsOrigin || ctx?.cms?.origin || '').trim(),
        syncCmsFrontendSite: detail.dataSource === 'cms',
      });
      return { ok: true, build: built, deploy: deployed };
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw) return;
  let req;
  try {
    req = JSON.parse(raw);
  } catch (err) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: String(err) } });
    return;
  }

  const { id, method, params = {} } = req;
  if (
    method === 'notifications/initialized' ||
    method === 'initialized' ||
    method === 'notifications/cancelled'
  ) {
    return;
  }
  if (method === 'initialize') {
    const requested = params.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : '2025-06-18';
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'WebDesign & Deploy Bridge MCP. Use webdesign_audit_seo_geo for SEO/GEO checks, webdesign_validate_cms_contract before CMS modeling, deploy_inject_seed to upload seed/ data & media to CMS, and deploy_publish_site to deploy to Cloudflare.',
      },
    });
    return;
  }
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'resources/list') {
    send({ jsonrpc: '2.0', id, result: { resources: [] } });
    return;
  }
  if (method === 'tools/call') {
    callTool(String(params.name || ''), params.arguments || {})
      .then((data) => {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            isError: false,
          },
        });
      })
      .catch((err) => {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
              },
            ],
            isError: true,
          },
        });
      });
    return;
  }

  if (id !== undefined && id !== null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
});
