/** MCP smoke test: start the server over stdio and over HTTP like a client would and call tools. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyship-smoke-"));
execFileSync("npx", ["tsx", "src/cli.ts", "init", "--workspace", ws], { stdio: "ignore" });
const fail = (m) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};
const body = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");

async function exercise(client, label) {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log(`[${label}] tools (${tools.length}):`, tools.join(", "));
  if (tools.length !== 7) fail(`${label}: expected 7 tools`);
  if (tools.some((t) => /upload|push|publish/.test(t))) fail(`${label}: an upload tool is exposed`);
  const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
  console.log(`[${label}] games=${info.games?.map((g) => g.id).join(",")}`);
  if (info.games?.length !== 2) fail(`${label}: workspace_info`);
  const d = body(await client.callTool({ name: "doctor", arguments: {} }));
  console.log(`[${label}] doctor:`, d.lines?.map((l) => l.split(":")[0]).join(" | "));
  const chk = body(await client.callTool({ name: "check_games", arguments: {} }));
  if (!chk.ok) fail(`${label}: check_games`);
  const p = body(await client.callTool({ name: "plan_ship", arguments: { id: "firefly_godot", targets: ["web"] } }));
  console.log(`[${label}] plan godot web: ${p.targets?.[0]?.status} · ${p.targets?.[0]?.steps?.length} steps`);
  if (!p.targets?.length) fail(`${label}: plan_ship`);
}

{
  const client = new Client({ name: "smoke", version: "0.0.1" });
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts", "--workspace", ws], cwd: process.cwd(), env: { ...process.env }, stderr: "ignore" }));
  await exercise(client, "stdio");
  const exp = body(await client.callTool({ name: "build_game", arguments: { id: "firefly_pixi" } }));
  console.log("[stdio] build pixi:", exp.results?.map((r) => `${r.target}:${r.status}`).join(" "));
  if (exp.results?.[0]?.status !== "built") fail("stdio: build_game");
  await client.close();
}

{
  const port = 18879 + Math.floor(Math.random() * 500);
  const proc = spawn("npx", ["tsx", "src/mcp/server.ts", "--http", "--port", String(port), "--workspace", ws], { stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("MCP HTTP did not start")), 60000);
    proc.stderr.on("data", (d) => {
      if (/listening|http:\/\//i.test(String(d))) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  const client = new Client({ name: "smoke-http", version: "0.0.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  proc.kill();
}

rmSync(ws, { recursive: true, force: true });
console.log(process.exitCode ? "MCP smoke FAILED" : "MCP smoke OK");
process.exit(process.exitCode ?? 0);
