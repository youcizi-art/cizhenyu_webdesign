/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    localeRoutingDone?: boolean;
    htmlCacheOwned?: boolean;
    runtime?: {
      env?: Record<string, unknown>;
      ctx?: {
        waitUntil?: (promise: Promise<unknown>) => void;
      };
    };
  }
}
