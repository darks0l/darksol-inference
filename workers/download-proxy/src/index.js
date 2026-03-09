// DARKSOL Downloads Proxy
// Routes: /desktop/<version>/<filename> → GitLab Generic Packages
// Adds auth, streams file, sets Content-Disposition for direct download.

const GITLAB_API = "https://gitlab.com/api/v4";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "darksol-downloads" }), {
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
      });
    }

    // Route: /desktop/<version>/<filename>
    const match = path.match(/^\/desktop\/([^/]+)\/([^/]+)$/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const [, version, filename] = match;

    // Validate
    if (!/^[\d.]+(-[\w.]+)?$/.test(version)) {
      return new Response("Invalid version", { status: 400 });
    }
    if (!/^[\w.-]+\.(exe|dmg|zip|AppImage|deb|rpm|msi)$/.test(filename)) {
      return new Response("Invalid filename", { status: 400 });
    }

    const projectId = env.GITLAB_PROJECT_ID || "80082659";
    const token = env.GITLAB_TOKEN;

    if (!token) {
      return new Response("Server misconfigured", { status: 500 });
    }

    const upstream = `${GITLAB_API}/projects/${projectId}/packages/generic/darksol-desktop/${encodeURIComponent(version)}/${encodeURIComponent(filename)}`;

    const upstreamResponse = await fetch(upstream, {
      headers: { "PRIVATE-TOKEN": token }
    });

    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status === 404 ? 404 : 502;
      return new Response(status === 404 ? "File not found" : "Upstream error", { status });
    }

    const headers = new Headers({
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=86400"
    });

    const contentLength = upstreamResponse.headers.get("content-length");
    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    return new Response(upstreamResponse.body, { status: 200, headers });
  }
};
