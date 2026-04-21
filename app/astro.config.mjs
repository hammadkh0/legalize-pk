import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";

/**
 * GitHub Pages project sites are served from a subpath. Set at build time, e.g.:
 *   ASTRO_SITE=https://owner.github.io ASTRO_BASE=/legalize-pk-fork/ npm run build
 * Local dev defaults to site root (`/`).
 */
const rawBase = process.env.ASTRO_BASE ?? "/";
const base =
  rawBase === "/" ? "/" : rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

export default defineConfig({
  integrations: [vue()],
  base,
  site: process.env.ASTRO_SITE || undefined,
  trailingSlash: "always",
});
