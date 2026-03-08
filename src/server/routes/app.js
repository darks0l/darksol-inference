import packageJson from "../../../package.json" with { type: "json" };
import { getRouteInventory } from "../contract/routes.js";

const APP_NAME = "DARKSOL Inference";

export async function registerAppRoutes(fastify) {
  fastify.get("/v1/app/meta", async () => ({
    app: {
      name: APP_NAME,
      packageName: packageJson.name,
      version: packageJson.version
    },
    routes: getRouteInventory(),
    branding: {
      logo: "/assets/footer-logo-darksol.png",
      favicon32: "/assets/icons/favicon-32x32.png",
      appleTouchIcon: "/assets/icons/apple-touch-icon.png",
      faviconIco: "/assets/icons/favicon.ico",
      manifest: "/assets/icons/site.webmanifest"
    },
    web: {
      shell: "/web/index.html",
      styles: "/web/styles.css"
    }
  }));
}
