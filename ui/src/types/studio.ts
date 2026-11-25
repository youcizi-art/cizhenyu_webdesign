export interface SiteBrief {
  siteKey: string;
  displayName: string;
  oneLiner: string;
  primaryColor: string;
  accentColor: string;
  surfaceMode: 'light' | 'dark' | 'industrial';
  styleNotes: string;
  referenceUrls: string[];
  desiredPages: string[];
  rawMaterials: string;
  customHeadScript: string;
  locales: string[];
  defaultLocale: string;
  updatedAt?: string;
}

export interface PreviewStatus {
  running: boolean;
  port: number | null;
  url: string | null;
  startedAt?: string;
  recentLogs?: string[];
}

export interface SiteDetail {
  siteKey: string;
  path: string;
  displayName: string;
  dataSource: 'mock' | 'cms';
  locales: string[];
  defaultLocale: string;
  primaryColor: string;
  brief: SiteBrief;
  hasDist: boolean;
  preview: PreviewStatus;
  updatedAt: string;
}

export interface DetectedAgentItem {
  id: string;
  label: string;
  launchable: boolean;
  message: string;
}

export interface BridgeContextInfo {
  ok: boolean;
  bridgeOffline?: boolean;
  workRoot?: string;
  systemRoot?: string;
  sitesDir?: string;
  cms: {
    loggedIn: boolean;
    origin: string | null;
    username?: string | null;
    sites: Array<Record<string, unknown>>;
  };
  cf: {
    authorized: boolean;
    accountId: string | null;
    zones: Array<{ id: string; name: string }>;
  };
}

export interface BootstrapPayload {
  ok: boolean;
  context: BridgeContextInfo;
  sitesRoot: string;
  sites: SiteDetail[];
  agents: DetectedAgentItem[];
  tools: Array<{ id: string; name: string; installed: boolean; enabled: boolean }>;
}

export interface SeoGeoCheckItem {
  id: string;
  category: 'SEO' | 'GEO' | 'PERF';
  ok: boolean;
  title: string;
  detail: string;
}

export interface SeoGeoAuditResult {
  siteKey: string;
  score: number;
  passed: number;
  total: number;
  allPassed: boolean;
  checks: SeoGeoCheckItem[];
}

export interface CmsContractField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
}

export interface CmsContractCollection {
  logical: string;
  name: string;
  slug: string;
  modelSlug: string;
  reuseGlobalModel: boolean;
  groupPath: string;
  presentationMode: 'list' | 'single_form';
  apiMode: 'public_read' | 'submit_only';
  fields: CmsContractField[];
}

export interface CmsContractValidation {
  valid: boolean;
  namespace: string;
  errors: string[];
  warnings: string[];
  collections: CmsContractCollection[];
}
