import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasyShipMcp } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const server = createEasyShipMcp(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});
const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);
const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

describe("MCP server", () => {
  it("has no upload tool", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names.sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(names.some((n) => /upload|push|publish/.test(n))).toBe(false);
  });
  it("info → doctor → check → write → plan → build → report", async () => {
    const info = body(await call("workspace_info"));
    expect(info.games.length).toBe(2);
    expect(info.format).toMatch(/Never put secrets/);
    const d = body(await call("doctor"));
    expect(d.lines.length).toBe(10);
    expect(JSON.stringify(d)).not.toMatch(/BUTLER_API_KEY=/);
    expect(body(await call("check_games")).ok).toBe(true);
    const bad = await call("write_game", { config: { id: "x", name: { th: "เอ็กซ์", en: "X" }, version: "0.1.0", engine: "pixi", source: "games/firefly_pixi", targets: ["web"], itch: { user: "me", game: "x", channels: { apiKey: "zzz" } } } });
    expect(bad.isError).toBe(true);
    const w = body(await call("write_game", { config: { id: "copy", name: { th: "สำเนา", en: "Copy" }, version: "0.2.0", engine: "pixi", source: "games/firefly_pixi", targets: ["web"] } }));
    expect(w.ok).toBe(true);
    const p = body(await call("plan_ship", { id: "copy" }));
    expect(p.targets[0].status).toBe("ready");
    const b = body(await call("build_game", { id: "copy" }));
    expect(b.results[0].status).toBe("built");
    expect(b.upload).toMatch(/CLI only/);
    expect(body(await call("read_report", { id: "copy" })).results[0].status).toBe("built");
  }, 60_000);
});

describe("web API", () => {
  it("serves plans, has no upload route, guards writes", async () => {
    const app = createApp({ workspaceRoot: root, webRoot: "/nonexistent", dev: true, host: "127.0.0.1" });
    const h = { host: "127.0.0.1:8978" };
    const ws = (await (await app.request("http://127.0.0.1/api/workspace", { headers: h })).json()) as { games: unknown[] };
    expect(ws.games.length).toBeGreaterThanOrEqual(2);
    const plan = (await (await app.request("http://127.0.0.1/api/plan/firefly_godot?targets=web", { headers: h })).json()) as { targets: Array<{ target: string }> };
    expect(plan.targets.map((t) => t.target)).toEqual(["web"]);
    const up = await app.request("http://127.0.0.1/api/upload/firefly_pixi", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: "{}" });
    expect(up.status).toBe(404);
    const evil = await app.request("http://127.0.0.1/api/build/firefly_pixi", { method: "POST", headers: { ...h, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(evil.status).toBe(403);
    const dev = await app.request("http://127.0.0.1/api/check", { headers: { ...h, origin: "http://localhost:5197" } });
    expect(dev.status).toBe(200);
  });
});
