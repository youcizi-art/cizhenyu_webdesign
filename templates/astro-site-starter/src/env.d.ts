/// <reference path="../.astro/types.d.ts" />

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
  export function waitUntil(promise: Promise<unknown>): void;
}

declare namespace App {
  interface Locals {
    localeRoutingDone?: boolean;
    htmlCacheOwned?: boolean;
    cfContext?: {
      waitUntil: (promise: Promise<unknown>) => void;
    };
  }
}
