import packageJson from "../../../package.json" with { type: "json" };

const APP_NAME = "DARKSOL Inference";

const AVAILABLE_ROUTES = [
  { method: "GET", path: "/health" },
  { method: "GET", path: "/v1/models" },
  { method: "GET", path: "/v1/directory/models" },
  { method: "GET", path: "/v1/bankr/health" },
  { method: "GET", path: "/v1/app/meta" },
  { method: "POST", path: "/v1/chat/completions" },
  { method: "POST", path: "/v1/completions" },
  { method: "POST", path: "/v1/embeddings" }
];

export async function registerAppRoutes(fastify) {
  fastify.get("/v1/app/meta", async () => ({
    app: {
      name: APP_NAME,
      packageName: packageJson.name,
      version: packageJson.version
    },
    routes: AVAILABLE_ROUTES,
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
