# WebDesign Studio Setup Guide

1. **Open Studio**: Enable `WebDesign Studio` in Deploy -> Ops -> Tools, then click **Configure** to launch the standalone studio window.
2. **Phase 1 (Static-First Site Build)**:
   - Enter a `siteKey` and a short one-sentence brief (colors, reference URLs, page structure, and product materials are all optional).
   - Click **Save & Dispatch Agent** to scaffold `{workRoot}/sites/<siteKey>` with built-in SEO/GEO optimization and launch DSH or OpenCode.
3. **Preview & Audit**: Start the local Astro preview server and run the built-in **SEO / GEO Audit** directly from the studio.
4. **Phase 2 (CMS Schema Wiring)**:
   - Once satisfied with the static site, open **CMS Wiring**, verify the 3-layer field contract validation, and dispatch the Agent with `cmsmcp` to create `{siteKey}_*` collections, seed content, and switch loaders to live CMS APIs.
5. **Publish**: Build and deploy directly to Cloudflare Pages with 48h edge HTML caching and `/api/revalidate` configured automatically.
