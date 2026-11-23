import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { TARGETS, type ShipConfig, type Target } from "../shared/types.js";
import { doctor, doctorLines } from "../lib/doctor.js";
import { planShip } from "../lib/plan.js";
import { readReport, ship } from "../lib/ship.js";
import { checkWorkspace, getConfig, saveConfig, workspaceSummary } from "../lib/workspace.js";
import { errMsg, useGuard, useWeb, type BaseOptions } from "./base.js";

export type CreateAppOptions = BaseOptions;
const targetsOf = (v?: string | string[]) => (Array.isArray(v) ? v : (v ?? "").split(",")).filter((t): t is Target => TARGETS.includes(t as Target));

export function createApp(o: CreateAppOptions): Hono {
  const app = new Hono();
  const root = o.workspaceRoot;
  useGuard(app, o);
  app.get("/api/workspace", async (c) => c.json({ ...(await workspaceSummary(root)), targets: TARGETS }));
  app.get("/api/doctor", async (c) => {
    const d = await doctor(root, { fresh: c.req.query("fresh") === "1" });
    return c.json({ doctor: d, lines: doctorLines(d) });
  });
  app.get("/api/check", async (c) => c.json(await checkWorkspace(root)));
  app.get("/api/game/:id", async (c) => {
    try {
      return c.json({ config: await getConfig(root, c.req.param("id"), { strict: false }), report: await readReport(root, c.req.param("id")) });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 404);
    }
  });
  app.post("/api/game", async (c) => {
    try {
      const body = (await c.req.json()) as { config: ShipConfig; dryRun?: boolean };
      const r = await saveConfig(root, body.config, { dryRun: body.dryRun });
      return c.json({ ok: r.saved, file: r.file, errors: r.errors, warnings: r.warnings });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  app.get("/api/plan/:id", async (c) => {
    try {
      return c.json(planShip(root, await getConfig(root, c.req.param("id")), await doctor(root), { targets: targetsOf(c.req.query("targets")) }));
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  /** Local build only. Uploading is deliberately not exposed over HTTP: use the CLI with --upload. */
  app.post("/api/build/:id", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { targets?: string[] };
      const lines: string[] = [];
      const r = await ship(root, c.req.param("id"), { build: true, targets: targetsOf(body.targets), log: (l) => lines.push(l) });
      return c.json({ ok: !r.results.some((x) => x.status === "failed"), results: r.results, report: r.report, log: lines });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  app.get("/api/report/:id/SHIP.md", async (c) => {
    try {
      const cfg = await getConfig(root, c.req.param("id"), { strict: false });
      const f = path.join(root, "releases", cfg.id, cfg.version, "SHIP.md");
      if (!existsSync(f)) return c.json({ error: "no report" }, 404);
      return c.text(await readFile(f, "utf8"));
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  useWeb(app, o);
  return app;
}
