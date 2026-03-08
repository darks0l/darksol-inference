import packageJson from "../../../package.json" with { type: "json" };
import { getRouteInventory } from "../contract/routes.js";
import { readUsageStats } from "../../lib/cost-tracker.js";

const APP_NAME = "DARKSOL Inference";

export async function registerAppRoutes(fastify, deps = {}) {
  const readUsageStatsFn = deps.readUsageStats || readUsageStats;

  fastify.get("/v1/app/meta", async () => ({
    app: {
      name: APP_NAME,
      packageName: packageJson.name,
      version: packageJson.version
    },
    routes: getRouteInventory(),
    branding: {
      logo: "/assets/footer-logo-darksol.png",
      banner: "/assets/darksol-banner.png",
      favicon32: "/assets/icons/favicon-32x32.png",
      appleTouchIcon: "/assets/icons/apple-touch-icon.png",
      faviconIco: "/assets/icons/favicon.ico",
      manifest: "/assets/icons/site.webmanifest"
    },
    web: {
      shell: "/web/index.html",
      styles: "/web/styles.css",
      layout: "desktop-mirror-three-panel"
    },
    desktop: {
      scaffoldRoot: "/desktop",
      entrypoint: "desktop/src/main.js",
      preload: "desktop/src/preload.js",
      packaging: {
        windows: "desktop/config/packaging.win.json",
        macos: "desktop/config/packaging.mac.json"
      }
    }
  }));

  fastify.get("/v1/app/usage", async () => ({
    object: "usage",
    ...(await readUsageStatsFn())
  }));
}
