/** CLI smoke test: init a temp workspace and drive every command through the real CLI (no Godot needed). */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ws = mkdtempSync(path.join(os.tmpdir(), "easyship-cli-"));
mkdirSync(path.join(ws, "vendor"));
writeFileSync(path.join(ws, "vendor", "pixi.min.js"), "globalThis.PIXI = {};");
const env = { ...process.env, EASYSHIP_PIXI: path.join(ws, "vendor", "pixi.min.js"), EASYSHIP_GODOT: "", GODOT: "", BUTLER_API_KEY: "" };
const cli = (...args) => execFileSync("npx", ["tsx", "src/cli.ts", ...args, "--workspace", ws], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env });
let failed = false;
const ok = (cond, label) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed = true;
};
const fails = (...args) => {
  try {
    cli(...args);
    return "";
  } catch (e) {
    return String(e.stdout) + String(e.stderr);
  }
};

cli("init");
ok(existsSync(path.join(ws, "ships", "firefly_godot.easyship.json")) && existsSync(path.join(ws, "games", "firefly_godot", "project.godot")), "init copies the samples");
ok(/firefly_godot .*godot .*web,windows,linux,android/.test(cli("info")), "info");
ok(/pixi\.min\.js/.test(cli("doctor")), "doctor");
ok(/ok — 2 games/.test(cli("check")), "check");
const plan = JSON.parse(cli("plan", "firefly_pixi", "--json"));
ok(plan.targets[0].status === "ready", "plan --json (pixi web ready)");
ok(/DRY RUN/.test(cli("ship", "firefly_pixi")) && !existsSync(path.join(ws, "releases")), "ship without flags is a dry run");
ok(/web +built/.test(cli("ship", "firefly_pixi", "--build")), "ship --build (pixi)");
ok(existsSync(path.join(ws, "releases/firefly_pixi/0.1.0/firefly_pixi-0.1.0-web.zip")) && existsSync(path.join(ws, "releases/firefly_pixi/0.1.0/SHIP.md")), "zip + SHIP.md");
ok(/"status": "built"/.test(cli("report", "firefly_pixi")), "report");
ok((() => { const o = cli("ship", "firefly_pixi", "--upload"); return !/web +uploaded/.test(o) && /not uploaded/.test(o); })(), "--upload without butler uploads nothing");
ok(/0\.1\.1/.test(cli("bump", "firefly_pixi")), "bump");
cli("new", "copy", "--source", "games/firefly_pixi", "--th", "สำเนา", "--en", "Copy", "--itch", "me/copy");
ok(JSON.parse(readFileSync(path.join(ws, "ships", "copy.easyship.json"), "utf8")).engine === "pixi", "new (engine detected)");
const cfg = JSON.parse(readFileSync(path.join(ws, "ships", "copy.easyship.json"), "utf8"));
cfg.itch.apiKey = "sk_live_should_not_print";
writeFileSync(path.join(ws, "ships", "copy.easyship.json"), JSON.stringify(cfg));
const out = fails("check");
ok(/secrets don't belong/.test(out) && !/sk_live_should_not_print/.test(out), "check refuses secrets without echoing them");
ok(/blocked/.test(cli("plan", "firefly_godot")), "plan godot without a toolchain: blocked");
cli("clean", "firefly_pixi");
ok(!existsSync(path.join(ws, "releases/firefly_pixi/0.1.1")), "clean");

rmSync(ws, { recursive: true, force: true });
console.log(failed ? "CLI smoke FAILED" : "CLI smoke OK");
process.exit(failed ? 1 : 0);
