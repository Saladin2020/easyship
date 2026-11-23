import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { DEV_UI_ORIGINS, checkRequest } from "../shared/requestGuard.js";

export interface BaseOptions {
  workspaceRoot: string;
  webRoot?: string;
  dev?: boolean;
  host?: string;
  token?: string;
}

const TOKEN_COOKIE = "easyship_token";
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function tokenPage(): string {
  return `<!doctype html><meta charset="utf-8"><title>Easy Ship</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Ship token required</h1>
<p>Paste the token printed in the terminal that started Easy Ship.</p>
<form method="get"><input name="token" autocomplete="off" style="width:22rem"> <button>Open</button></form>
</body>`;
}

/** Local-only guard (loopback Host, same-origin writes, token off loopback). Call before any route. */
export function useGuard(app: Hono, o: BaseOptions) {
  const guard = { bindHost: o.host ?? "127.0.0.1", token: o.token, extraOrigins: o.dev ? DEV_UI_ORIGINS : [] };
  app.use("*", async (c, next) => {
    const queryToken = c.req.query("token");
    const provided = c.req.header("x-easyship-token") ?? queryToken ?? getCookie(c, TOKEN_COOKIE);
    const denied = checkRequest(guard, { method: c.req.method, host: c.req.header("host"), origin: c.req.header("origin"), token: provided });
    if (denied) {
      if (denied.status === 401 && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.html(tokenPage(), 401);
      return c.json({ error: denied.error }, denied.status);
    }
    if (o.token && queryToken) setCookie(c, TOKEN_COOKIE, queryToken, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    await next();
  });
  app.get("/api/health", (c) => c.json({ ok: true, workspaceRoot: o.workspaceRoot }));
}

/** Serve the built web UI (or a pointer to the Vite dev server). Call after the API routes. */
export function useWeb(app: Hono, o: BaseOptions) {
  if (!o.dev && o.webRoot) {
    const webRoot = o.webRoot;
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", async (c) => {
      try {
        return c.html((await readFile(path.join(webRoot, "index.html"))).toString("utf8"));
      } catch {
        return c.text("Web UI not built yet. Run npm run build:web or start with --dev.", 503);
      }
    });
  } else if (o.dev) {
    app.get("/", (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><title>Easy Ship (dev)</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy Ship API is running</h1><p>Workspace: <code>${o.workspaceRoot}</code></p>
<p>Open the Vite UI at <a href="http://127.0.0.1:5197" style="color:#f0c36a">http://127.0.0.1:5197</a></p></body>`),
    );
  }
}

export function defaultWebRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../web/dist"), path.resolve(here, "../../web/dist")];
  return candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? candidates[1]!;
}
