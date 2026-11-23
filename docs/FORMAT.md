# Easy Ship format

## `ships/<id>.easyship.json`

```json
{
  "format": "easyship/1",
  "id": "firefly_godot",
  "name": { "th": "หิ่งห้อย", "en": "Firefly Night", "ms": "Malam Kelip-kelip" },
  "version": "0.1.0",
  "engine": "godot",
  "source": "games/firefly_godot",
  "targets": ["web", "windows", "linux", "android"],
  "itch": { "user": "your-itch-name", "game": "firefly-night", "channels": { "web": "html5" } },
  "web": { "threads": false, "canvasResize": "adaptive" },
  "windows": { "console": false },
  "android": { "package": "org.easysuite.firefly", "versionCode": 1, "minSdk": 24, "release": false, "keystore": { "path": "keys/release.keystore", "alias": "firefly" } },
  "pixi": { "entry": "index.html", "vendor": true },
  "exclude": ["*.map", "docs/**"]
}
```

| Field | |
|---|---|
| `id` | file name; `a-z 0-9 _ -` |
| `name` | `{th, en, ms?}` — Thai in Thai script |
| `version` | semver; used in file names and as butler's `--userversion`; `bump` raises it (and `android.versionCode`) |
| `engine` | `godot` (folder with `project.godot`) or `pixi` (folder with `index.html`) |
| `targets` | `web`, `windows`, `linux`, `android` (PixiJS: `web` only) |
| `itch` | page slugs from `https://<user>.itch.io/<game>`; channels default to `html5`, `windows`, `linux`, `android` |
| `web.threads` | `false` (default) = single-threaded build that runs anywhere; `true` needs SharedArrayBuffer on itch.io |
| `android.release` | `true` = release APK signed with `keystore` + `EASYSHIP_KEYSTORE_PASSWORD`; otherwise a debug-signed APK |
| `exclude` | extra globs skipped when copying a PixiJS game (always skipped: `.git`, `node_modules`, `.env*`, keystores, credentials) |

No key may look like a secret (`apiKey`, `token`, `password`, `secret`, `credential`…): `check` fails without printing the value.

## Output: `releases/<id>/<version>/`

```
web/ windows/ linux/                      the raw builds
<id>-<version>-web.zip                     index.html at the root (upload as an HTML game)
<id>-<version>-windows.zip                 <id>.exe (pck embedded)
<id>-<version>-linux.zip                   <id>.x86_64 (pck embedded, executable bit kept)
<id>-<version>.apk                         Android
SHIP.md, ship-report.json                  status, checks, sizes, SHA-256, butler commands
```

`ship-report.json`: `{ format: "easyship-report/1", game, name, version, engine, at, uploadRequested, results: [{ target, status, artifact, bytes, sha256, files, checks: [{ok, label}], error? }], butler: { possible, blockers, commands } }`.
