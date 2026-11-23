# Easy Ship studio install plan (prepared, NOT applied)

Nothing below has been run against `/workspace/indie-studio`. Apply only after the user approves.

1. `git clone /workspace/easy-new/easyship /workspace/indie-studio/tools/easyship && cd $_ && git checkout --detach <SHA>`
2. `npm ci && npm run build && npm test` (Godot export test skipped unless `GODOT=…`).
3. Copy `install-plan/easyship-cli.mjs` → `/workspace/indie-studio/tools/easyship-cli.mjs`.
4. Copy `install-plan/EASYSHIP.md` → `/workspace/indie-studio/tools/EASYSHIP.md` and replace `<SHA>`.
5. Smoke: `node /workspace/indie-studio/tools/easyship-cli.mjs init --workspace /workspace/indie-studio/projects/_smoke_ship`,
   `doctor`, then `ship firefly_pixi --build` with the same `--workspace`.
6. Toolchain on the build box (user's call): Godot 4.3 export templates are installed at
   `~/.local/share/godot/export_templates/4.3.stable` (web, Windows, Linux, Android APKs). JDK 17 + Android SDK and
   butler are NOT installed; Android builds and uploads stay blocked until they are.
7. Shared skill: install `SKILL.draft.md` as `easyship-release-builds` (the parent agent does this).
8. Once a GitHub repo exists (user's call): add it as a remote in the install.

Ports: dashboard 8978, MCP HTTP 8979, Vite 5197.
