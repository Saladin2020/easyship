# Easy Ship MCP server

```bash
npx tsx src/mcp/server.ts --workspace ~/ship                     # stdio
npx tsx src/mcp/server.ts --http --port 8979 --workspace ~/ship  # Streamable HTTP at http://127.0.0.1:8979/mcp
```

| Tool | Does |
|---|---|
| `workspace_info` | games and the config format — call first |
| `doctor` | toolchain report (login present yes/no only) |
| `check_games` | validate configs |
| `write_game` | create / replace a config (validated; secret-looking keys refused) |
| `plan_ship` | dry run: steps, commands, blockers, butler commands |
| `build_game` | build + check + zip locally |
| `read_report` | last report |

There is deliberately no upload tool: an agent can prepare everything, and a person runs
`easyship ship <id> --upload`. Off loopback, HTTP needs `Authorization: Bearer <token>` (printed at start).
