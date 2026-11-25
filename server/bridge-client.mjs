/**
 * Deploy 本机通用能力桥客户端（连接 127.0.0.1:13991 /v1/*）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCredentialsDir, resolveSystemRoot } from './paths.mjs';

function resolveBridgeAuth() {
  const envUrl = String(process.env.CIZHENYU_DEPLOY_BRIDGE_URL || '').trim();
  const envToken = String(process.env.CIZHENYU_DEPLOY_BRIDGE_TOKEN || '').trim();
  if (envUrl && envToken) {
    return { baseUrl: envUrl.replace(/\/$/, ''), token: envToken };
  }

  const candidates = [
    join(resolveCredentialsDir(), '.deploy-bridge.json'),
    join(resolveSystemRoot(), 'agents', 'dsh_agent', 'home', '.cizhenyu', 'deploy-bridge.json'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (parsed?.baseUrl && parsed?.token) {
        return {
          baseUrl: String(parsed.baseUrl).replace(/\/$/, ''),
          token: String(parsed.token).trim(),
        };
      }
    } catch {
      // ignore
    }
  }
  return { baseUrl: envUrl || 'http://127.0.0.1:13991', token: envToken };
}

async function bridgeRequest(method, path, body = undefined, timeoutMs = 45000) {
  const { baseUrl, token } = resolveBridgeAuth();
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.ok === false)) {
    throw new Error(data?.message || `Deploy 能力桥请求失败 (${res.status})`);
  }
  return data;
}

export async function getBridgeContextSafe() {
  try {
    return await bridgeRequest('GET', '/v1/context', undefined, 8000);
  } catch (err) {
    return {
      ok: false,
      bridgeOffline: true,
      message: err instanceof Error ? err.message : String(err),
      cms: { loggedIn: false, origin: null, sites: [] },
      cf: { authorized: false, accountId: null, zones: [] },
    };
  }
}

export async function openDeployCmsLogin(origin) {
  return bridgeRequest('POST', '/v1/context/open-cms-login', { origin }, 15000);
}

export async function listDeployTools() {
  return bridgeRequest('GET', '/v1/tools', undefined, 10000);
}

export async function callDeployToolMcp(toolId, toolName, args = {}, timeoutSecs = 45) {
  return bridgeRequest(
    'POST',
    '/v1/tools/call',
    { toolId, toolName, arguments: args, timeoutSecs },
    (timeoutSecs + 5) * 1000
  );
}

export async function listDeployAgents() {
  try {
    return await bridgeRequest('GET', '/v1/agents', undefined, 10000);
  } catch {
    return { ok: false, agents: [] };
  }
}

export async function dispatchToDeployAgent(payload) {
  return bridgeRequest('POST', '/v1/agents/dispatch', payload, 60000);
}

export async function deployStandaloneSiteViaBridge(payload) {
  return bridgeRequest('POST', '/v1/pages/deploy-site', payload, 240000);
}
