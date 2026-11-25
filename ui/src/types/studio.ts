export interface BridgeContextInfo {
  ok: boolean;
  bridgeOffline?: boolean;
  workRoot?: string;
  sitesDir?: string;
  cms?: {
    loggedIn: boolean;
    origin: string | null;
    username?: string;
  };
  crm?: {
    loggedIn: boolean;
    origin: string | null;
    username?: string;
  };
  cf?: {
    authorized: boolean;
    accountId: string | null;
    zones: Array<{ id: string; name: string }>;
  };
}

export interface DetectedAgentItem {
  id: string;
  label: string;
  installed?: boolean;
  running?: boolean;
}

export type InstallStatus = 'installing' | 'ready' | 'error' | 'pending';

export interface SiteSummary {
  siteKey: string;
  namespace: string;
  path: string;
  displayName: string;
  dataSource: 'mock' | 'cms';
  locales: string[];
  defaultLocale: string;
  installStatus: InstallStatus;
  installError: string | null;
  hasDist: boolean;
  updatedAt: string;
}

export interface BootstrapPayload {
  ok: boolean;
  context: BridgeContextInfo;
  sitesRoot: string;
  sites: SiteSummary[];
  agents: DetectedAgentItem[];
}
