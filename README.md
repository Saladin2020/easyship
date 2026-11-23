<!-- easy-suite:header:start -->
<p align="center">
  <a href="#easy-suite"><img src="docs/brand/banner-ship.png" width="100%" alt="Easy Ship: Web, Windows, Linux and Android builds, itch.io ready" /></a>
</p>

<p align="center">
  <b>Easy Ship</b> · ส่งเกมขึ้นเว็บ วินโดวส์ แอนดรอยด์ · Web, Windows, Linux and Android builds, itch.io ready<br />
  <sub>Part of <a href="#easy-suite"><b>Easy Suite</b></a>: Thai-friendly pixel-art game dev tools for Godot 4.3+ and PixiJS v8</sub>
</p>

<p align="center">
  <a href="https://github.com/Saladin2020/easyship/actions/workflows/ci.yml"><img src="https://github.com/Saladin2020/easyship/actions/workflows/ci.yml/badge.svg" alt="CI" /></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2e2014?style=flat-square" alt="MIT license" /></a> <img src="https://img.shields.io/badge/Godot-4.3%2B-478cbf?style=flat-square&logo=godotengine&logoColor=white" alt="Godot 4.3+" /> <img src="https://img.shields.io/badge/PixiJS-v8-e72264?style=flat-square" alt="PixiJS v8" /> <a href="docs/MCP.md"><img src="https://img.shields.io/badge/MCP-server-c45c26?style=flat-square" alt="MCP server" /></a> <img src="https://img.shields.io/badge/Thai-ready-f4ae3d?style=flat-square" alt="Thai-ready" />
</p>

<p align="center">
  <a href="https://github.com/Saladin2020/easysprite"><img src="docs/brand/logo-sprite-96.png" width="32" alt="Easy Sprite" title="Easy Sprite" /></a>
  <a href="https://github.com/Saladin2020/easyscene"><img src="docs/brand/logo-scene-96.png" width="32" alt="Easy Scene" title="Easy Scene" /></a>
  <a href="https://github.com/Saladin2020/easytilemap"><img src="docs/brand/logo-tilemap-96.png" width="32" alt="Easy Tilemap" title="Easy Tilemap" /></a>
  <a href="https://github.com/Saladin2020/easydialogue"><img src="docs/brand/logo-dialogue-96.png" width="32" alt="Easy Dialogue" title="Easy Dialogue" /></a>
  <a href="https://github.com/Saladin2020/easyquest"><img src="docs/brand/logo-quest-96.png" width="32" alt="Easy Quest" title="Easy Quest" /></a>
  <a href="https://github.com/Saladin2020/easyui"><img src="docs/brand/logo-ui-96.png" width="32" alt="Easy UI" title="Easy UI" /></a>
  <a href="https://github.com/Saladin2020/easysfx"><img src="docs/brand/logo-sfx-96.png" width="32" alt="Easy SFX" title="Easy SFX" /></a>
  <a href="https://github.com/Saladin2020/easyfx"><img src="docs/brand/logo-fx-96.png" width="32" alt="Easy FX" title="Easy FX" /></a>
  <a href="https://github.com/Saladin2020/easymusic"><img src="docs/brand/logo-music-96.png" width="32" alt="Easy Music" title="Easy Music" /></a>
  <a href="https://github.com/Saladin2020/easyanim"><img src="docs/brand/logo-anim-96.png" width="32" alt="Easy Anim" title="Easy Anim" /></a>
  <a href="https://github.com/Saladin2020/easyitems"><img src="docs/brand/logo-items-96.png" width="32" alt="Easy Items" title="Easy Items" /></a>
  <a href="https://github.com/Saladin2020/easysave"><img src="docs/brand/logo-save-96.png" width="32" alt="Easy Save" title="Easy Save" /></a>
  <a href="https://github.com/Saladin2020/easykit"><img src="docs/brand/logo-kit-96.png" width="32" alt="Easy Kit" title="Easy Kit" /></a>
  <a href="https://github.com/Saladin2020/easybattle"><img src="docs/brand/logo-battle-96.png" width="32" alt="Easy Battle" title="Easy Battle" /></a>
  <a href="https://github.com/Saladin2020/easyfont"><img src="docs/brand/logo-font-96.png" width="32" alt="Easy Font" title="Easy Font" /></a>
  <a href="https://github.com/Saladin2020/easynpc"><img src="docs/brand/logo-npc-96.png" width="32" alt="Easy NPC" title="Easy NPC" /></a>
  <a href="https://github.com/Saladin2020/easyportrait"><img src="docs/brand/logo-portrait-96.png" width="32" alt="Easy Portrait" title="Easy Portrait" /></a>
  <a href="https://github.com/Saladin2020/easyship"><img src="docs/brand/logo-ship-96.png" width="40" alt="Easy Ship" title="Easy Ship (this repo)" /></a>
</p>
<!-- easy-suite:header:end -->

# Easy Ship

**ส่งเกมขึ้นเว็บ วินโดวส์ ลินุกซ์ แอนดรอยด์ · itch.io · dry run ก่อนเสมอ**  
One command from a Godot 4.3+ project or a PixiJS v8 game folder to files you can hand to players: a **doctor**
that says what this machine can build (Godot, export templates, Java, Android SDK, butler, itch.io login), a **plan**
with every exact command, **builds** for web, Windows, Linux and Android, **checks** against itch.io's HTML limits and
for leaked secrets, reproducible **zips** with SHA-256s, and the **butler** commands to publish. Nothing is built
unless you add `--build`, and nothing is uploaded unless you add `--upload` — the web editor and the MCP server can't
upload at all. CLI, web dashboard and MCP server; no secrets in config files.

<p align="center"><img src="docs/assets/dashboard-godot.png" width="88%" alt="Easy Ship dashboard: the Godot sample built for web, Windows and Linux; Android blocked by the missing JDK and SDK" /></p>

| Godot web build running in Chrome (served like itch.io: no COOP/COEP) | PixiJS web build (pixi.min.js vendored) |
|---|---|
| <img src="docs/assets/godot-web-build.png" alt="Godot web build" /> | <img src="docs/assets/pixi-web-build.png" alt="Pixi web build" /> |

## Quick start

```bash
npm install
npx tsx src/cli.ts init --workspace ~/ship              # ships/ + games/ (the firefly sample, Godot and PixiJS)
npx tsx src/cli.ts doctor --workspace ~/ship
npx tsx src/cli.ts ship firefly_godot --workspace ~/ship                 # DRY RUN: the plan, nothing written
EASYSHIP_GODOT=~/bin/godot npx tsx src/cli.ts ship firefly_godot --build --workspace ~/ship
npx tsx src/cli.ts ship firefly_godot --upload --workspace ~/ship        # only after butler login + your itch user
npx tsx src/cli.ts serve --workspace ~/ship             # dashboard on http://127.0.0.1:8978
```

Other commands: `info`, `check [id]`, `plan <id> [--targets web,linux] [--json]`, `report <id>`, `clean <id>`,
`new <id> --source games/x --th … --en … [--itch user/game]`, `bump <id> [patch|minor|major]`.

## The sample

`init` copies **หิ่งห้อย · Firefly Night** twice — a Godot 4.3 project and the same game in PixiJS v8 — catch
fireflies over the rice field before dawn, Thai / English HUD (Kanit). `ships/firefly_godot.easyship.json` targets web,
Windows, Linux and Android; `ships/firefly_pixi.easyship.json` targets the web. Both point at a placeholder itch.io
user, so uploads stay disabled until you put yours in.

## What a ship does

| Step | Godot | PixiJS |
|---|---|---|
| prepare | first import if `.godot/` is missing; adds `Easy Ship · Web/Windows/Linux/Android` presets to `export_presets.cfg` (your own presets are kept and renumbered; a one-time backup `export_presets.cfg.easyship.bak`) | copies the folder, skipping `.git`, `node_modules`, `.env*`, keystores, `export_credentials.cfg`, `butler_creds` and your `exclude` globs; vendors `pixi.min.js` (from `EASYSHIP_PIXI` or the workspace's `node_modules/pixi.js`) so the game works offline |
| build | `godot --headless --export-release "Easy Ship · <Target>" <out>` — web is single-threaded by default (runs on itch.io without SharedArrayBuffer headers), Windows / Linux embed the `.pck` (one file), Android is a debug-signed arm64 APK unless `android.release` + a keystore | — |
| check | web: `index.html` at the root, ≤ 1000 files, no file over 200 MB, ≤ 500 MB extracted, local references resolve, no absolute paths, `.wasm` + `.pck`; Windows: PE; Linux: ELF + executable bit; Android: manifest, dex, signature; every target: no secret-looking files or private keys | same web checks |
| package | `releases/<id>/<version>/<id>-<version>-<target>.zip` (deterministic, Unix modes kept) or the APK; `SHIP.md` + `ship-report.json` with sizes and SHA-256 | same |
| upload | only with `--upload`: `butler push <zip> <user>/<game>:<channel> --userversion <version>` (channels `html5`, `windows`, `linux`, `android`) | same |

macOS and iOS are not covered (they need Apple signing and notarisation). PixiJS games ship to the web only; wrap the
web build with Tauri / Electron or Capacitor for desktop or Android.

## Secrets

Easy Ship never reads or prints credentials. `check` refuses config keys that look like secrets (`apiKey`, `token`,
`password`, …) without echoing their values. butler uses its own login (`butler login`) or `BUTLER_API_KEY` from your
shell; release keystores take `android.keystore {path, alias}` from the config and the password from
`EASYSHIP_KEYSTORE_PASSWORD`, passed to Godot as `GODOT_ANDROID_KEYSTORE_RELEASE_*` for that one process. The doctor
reports only whether a login exists. `init` writes a `.gitignore` for `releases/`, `.env*` and keystores.

## Web dashboard

Games, the doctor, each target's plan with its exact commands and blockers, a local **Build** button, the last
report's checks and SHA-256s, the butler commands to copy, and a small config form. There is no upload button.

## MCP server

`npm run mcp` (stdio) or `npm run mcp:http` (port 8979). Tools: `workspace_info`, `doctor`, `check_games`,
`write_game`, `plan_ship`, `build_game` (local), `read_report`. No upload tool. See [docs/MCP.md](docs/MCP.md).

## Ports

| | Port |
|---|---|
| Web dashboard / API | 8978 |
| MCP Streamable HTTP | 8979 |
| Vite dev UI | 5197 |

Everything binds to 127.0.0.1; a non-loopback `--host` needs the printed token.

## Development

```bash
npm test                                                  # vitest (no Godot needed)
GODOT=/path/to/godot npx vitest run test/godot.test.ts    # real web / Windows / Linux exports + runs the Linux build
npm run typecheck
npm run smoke                                             # CLI + MCP (stdio and HTTP)
npm run check:web -- releases/<id>/<version>/web shot.png # headless Chrome: Godot or PixiJS build runs
```

<!-- easy-suite:table:start -->
## Easy Suite

<img src="docs/brand/logo-suite-96.png" width="48" align="right" alt="Easy Suite" />

Eighteen small, local-first tools that share one look (teak, lantern gold, Kanit, 16/48px pixels), one
workflow (CLI · web editor · MCP server) and the same targets (**Godot 4.3+** and **PixiJS v8**).
ชุดเครื่องมือทำเกมพิกเซลสไตล์ไทย ใช้ร่วมกันได้ทั้งชุด · the samples share one multicultural southern Thai village.

| | Tool | What it does | Repo |
|:-:|---|---|---|
| <img src="docs/brand/logo-sprite-96.png" width="40" alt="" /> | [**Easy Sprite**](https://github.com/Saladin2020/easysprite) | Compose modular 48px chibi characters (top-down + side-view) and export sheets. | [`easysprite`](https://github.com/Saladin2020/easysprite) |
| <img src="docs/brand/logo-scene-96.png" width="40" alt="" /> | [**Easy Scene**](https://github.com/Saladin2020/easyscene) | Side-view levels: parallax layers, 16px autotiles, Thai town props. | [`easyscene`](https://github.com/Saladin2020/easyscene) |
| <img src="docs/brand/logo-tilemap-96.png" width="40" alt="" /> | [**Easy Tilemap**](https://github.com/Saladin2020/easytilemap) | Top-down 16px maps: blob-47 autotiles, objects, collision, spawns. | [`easytilemap`](https://github.com/Saladin2020/easytilemap) |
| <img src="docs/brand/logo-dialogue-96.png" width="40" alt="" /> | [**Easy Dialogue**](https://github.com/Saladin2020/easydialogue) | Branching `.ezd` dialogue with Thai-safe text, portraits and choices. | [`easydialogue`](https://github.com/Saladin2020/easydialogue) |
| <img src="docs/brand/logo-quest-96.png" width="40" alt="" /> | [**Easy Quest**](https://github.com/Saladin2020/easyquest) | Text `.ezq` quests: steps, flags, items, rewards, linked to dialogue. | [`easyquest`](https://github.com/Saladin2020/easyquest) |
| <img src="docs/brand/logo-ui-96.png" width="40" alt="" /> | [**Easy UI**](https://github.com/Saladin2020/easyui) | Nine-slice pixel UI kit: panels, bars, inventory, menus, 30 icons. | [`easyui`](https://github.com/Saladin2020/easyui) |
| <img src="docs/brand/logo-sfx-96.png" width="40" alt="" /> | [**Easy SFX**](https://github.com/Saladin2020/easysfx) | Deterministic 8-bit SFX and 4-channel chiptune loops, typing blips. | [`easysfx`](https://github.com/Saladin2020/easysfx) |
| <img src="docs/brand/logo-fx-96.png" width="40" alt="" /> | [**Easy FX**](https://github.com/Saladin2020/easyfx) | Pixel particles: sparks, fire, rain, lanterns, Raya pelita; sheets + Godot particles. | [`easyfx`](https://github.com/Saladin2020/easyfx) |
| <img src="docs/brand/logo-music-96.png" width="40" alt="" /> | [**Easy Music**](https://github.com/Saladin2020/easymusic) | Seeded Thai loop music: ranat, khong wong, saw, khim, pi, kompang; seamless WAV/OGG loops. | [`easymusic`](https://github.com/Saladin2020/easymusic) |
| <img src="docs/brand/logo-anim-96.png" width="40" alt="" /> | [**Easy Anim**](https://github.com/Saladin2020/easyanim) | Cutscene timelines: actors, camera, dialogue, FX and music cues; Godot + Pixi runners. | [`easyanim`](https://github.com/Saladin2020/easyanim) |
| <img src="docs/brand/logo-items-96.png" width="40" alt="" /> | [**Easy Items**](https://github.com/Saladin2020/easyitems) | Item database, shops, inventory, loot tables and crafting; 44 starter items with pixel icons. | [`easyitems`](https://github.com/Saladin2020/easyitems) |
| <img src="docs/brand/logo-save-96.png" width="40" alt="" /> | [**Easy Save**](https://github.com/Saladin2020/easysave) | Versioned save slots with migrations and checksums; Thai / English / Malay string tables. | [`easysave`](https://github.com/Saladin2020/easysave) |
| <img src="docs/brand/logo-kit-96.png" width="40" alt="" /> | [**Easy Kit**](https://github.com/Saladin2020/easykit) | One command drives all 12 tools into a playable Godot 4.3+ and PixiJS game; unified MCP server and `doctor`. | [`easykit`](https://github.com/Saladin2020/easykit) |
| <img src="docs/brand/logo-battle-96.png" width="40" alt="" /> | [**Easy Battle**](https://github.com/Saladin2020/easybattle) | Turn-based battles: party, bestiary, skills, statuses, bosses; seeded simulator; Godot + Pixi runtimes. | [`easybattle`](https://github.com/Saladin2020/easybattle) |
| <img src="docs/brand/logo-font-96.png" width="40" alt="" /> | [**Easy Font**](https://github.com/Saladin2020/easyfont) | Pixel bitmap fonts for Thai, Latin and Malay: stacking vowels and tones, BMFont / TTF for Godot + Pixi. | [`easyfont`](https://github.com/Saladin2020/easyfont) |
| <img src="docs/brand/logo-npc-96.png" width="40" alt="" /> | [**Easy NPC**](https://github.com/Saladin2020/easynpc) | NPC daily schedules with A* on Easy Tilemap maps, day / night, affinity, dialogue and quest hooks. | [`easynpc`](https://github.com/Saladin2020/easynpc) |
| <img src="docs/brand/logo-portrait-96.png" width="40" alt="" /> | [**Easy Portrait**](https://github.com/Saladin2020/easyportrait) | 64×64 dialogue portraits with 9 emotions, blink and talk frames, from Easy Sprite characters. | [`easyportrait`](https://github.com/Saladin2020/easyportrait) |
| <img src="docs/brand/logo-ship-96.png" width="40" alt="" /> | **Easy Ship** ← you are here | Toolchain doctor, web / Windows / Linux / Android builds, itch.io zips and butler plans; dry run by default. | [`easyship`](https://github.com/Saladin2020/easyship) |
<!-- easy-suite:table:end -->

## Credits

Sample games written for Easy Suite; Kanit font SIL OFL 1.1. See [CREDITS.md](CREDITS.md). Code: MIT.
