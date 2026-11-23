---
name: easyship-release-builds
description: Use when a Godot 4.3+ or PixiJS game needs web / Windows / Linux / Android builds, itch.io-ready zips or a butler upload plan.
---

# Easy Ship — release builds

Tool: `node /workspace/indie-studio/tools/easyship-cli.mjs <cmd> --workspace /abs/project/ship` (absolute paths).

1. `doctor` — note what's missing (export templates, JDK / Android SDK, butler, login). Don't install SDKs or log in
   for the user without asking.
2. `new <id> --source <game folder> --th "<ชื่อไทย>" --en "<English>" --targets web,windows,linux [--itch user/game]`
   (or edit `ships/<id>.easyship.json`). Never put keys or passwords in it.
3. `ship <id>` (dry run) → read the plan and blockers.
4. `ship <id> --build` → check `releases/<id>/<version>/SHIP.md`; for web, `python3 scripts/check-web.py <web dir> shot.png`.
5. Uploading is the user's call: give them `easyship ship <id> --upload` (needs `butler login`). Never run `--upload`
   unless the user explicitly asked for that upload.
