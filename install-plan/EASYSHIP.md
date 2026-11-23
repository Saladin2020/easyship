# Easy Ship (studio tool)

Install: `/workspace/indie-studio/tools/easyship` (detached at `<SHA>`). Wrapper: `node /workspace/indie-studio/tools/easyship-cli.mjs`.
Always pass `--workspace /workspace/indie-studio/projects/<Name>/ship`. Set `EASYSHIP_GODOT` to the Godot 4.3 binary.

| Command | |
|---|---|
| `init` | firefly sample (Godot + PixiJS) |
| `doctor` | Godot, templates, Java, Android SDK, butler, login (yes/no), pixi.min.js |
| `check [id]` | config validation (secrets refused) |
| `plan <id> [--targets …]` / `ship <id>` | dry run with exact commands |
| `ship <id> --build [--targets …]` | build + check + zip into `releases/<id>/<version>/` |
| `ship <id> --upload` | butler push — only when the user explicitly asks |
| `report <id>` / `clean <id>` / `bump <id>` / `new <id> …` | |

MCP: `node tools/easyship/dist/mcp/server.js --workspace …` (stdio) or `--http --port 8979` — no upload tool.
