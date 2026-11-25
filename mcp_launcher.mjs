#!/usr/bin/env node
/**
 * WebDesign Studio MCP Server（stdio newline-delimited JSON-RPC）。
 * 供 DSH / OpenCode 等 Agent 在构建站点时读取规范、执行 SEO/GEO 体检与校验 CMS 集合字段契约。
 */
import { createInterface } from 'node:readline';
import {
  auditSiteSeoGeo,
  getSiteDetail,
  inspectSiteCmsContract,
  listSites,
  saveSiteCmsContract,
} from './server/site-manager.mjs';

const SERVER_NAME = 'cizhenyu-webdesign';
const SERVER_VERSION = '0.1.0';
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'webdesign_list_sites',
    description: '列出 {workRoot}/sites 下的全部单站 Astro 工程及当前数据源状态（mock 或 cms）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'webdesign_get_site_brief',
    description: '读取指定站点的特殊建站配置（site-brief.json）与当前项目元数据。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识（即 sites/<siteKey> 文件夹名）' },
      },
      required: ['siteKey'],
    },
  },
  {
    name: 'webdesign_audit_seo_geo',
    description: '对指定 Astro 站点运行确定性 SEO / GEO / 边缘缓存合规检查（H1、SeoHead、llms.txt、GeoAnswer 覆盖率等）。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识' },
      },
      required: ['siteKey'],
    },
  },
  {
    name: 'webdesign_validate_cms_contract',
    description: '扫描并校验站点的 CMS 集合与字段契约是否 100% 符合 cizhenyu_payload 三层字段规则（拦截保留字冲突、非法字段类型及命名空间错误）。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string', description: '站点标识' },
      },
      required: ['siteKey'],
    },
  },
  {
    name: 'webdesign_save_cms_contract',
    description: '更新并校验站点的 .webdesign/cms-contract.json 集合字段契约。',
    inputSchema: {
      type: 'object',
      properties: {
        siteKey: { type: 'string' },
        collections: { type: 'array', items: { type: 'object' } },
      },
      required: ['siteKey', 'collections'],
    },
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function callTool(name, args) {
  switch (name) {
    case 'webdesign_list_sites':
      return listSites();
    case 'webdesign_get_site_brief':
      return getSiteDetail(args.siteKey);
    case 'webdesign_audit_seo_geo':
      return auditSiteSeoGeo(args.siteKey);
    case 'webdesign_validate_cms_contract':
      return inspectSiteCmsContract(args.siteKey);
    case 'webdesign_save_cms_contract':
      return saveSiteCmsContract(args.siteKey, args.collections || []);
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
  if (method === 'notifications/initialized' || method === 'initialized' || method === 'notifications/cancelled') {
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
          'WebDesign Studio MCP. Use webdesign_audit_seo_geo and webdesign_validate_cms_contract before finishing site tasks.',
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
    try {
      const data = callTool(String(params.name || ''), params.arguments || {});
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false,
        },
      });
    } catch (err) {
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
    }
    return;
  }

  if (id !== undefined && id !== null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
});
