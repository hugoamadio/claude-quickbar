# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

You need Claude Code 2.1.287 or later and Node 22.18 or later.

```bash
claude --plugin-dir ./plugins/quickbar     # try your change in a real session
claude plugin validate ./plugins/quickbar
claude plugin test ./plugins/quickbar
node scripts/check-config.ts               # the bundled example still validates
```

## Layout

| Path | What |
|---|---|
| `plugins/quickbar/hooks/register.tsx` | Hooks: loading the config, commands, delivering text, the VS Code fallback |
| `plugins/quickbar/hooks/bar.tsx` | The bar as a Client: drawing, pointer and keys |
| `plugins/quickbar/hooks/layout.ts` | Pill positions, hit testing, hover and click rules (pure) |
| `plugins/quickbar/hooks/config.ts` | Parsing and validation (pure) |
| `plugins/quickbar/hooks/compose.ts` | Select levels and the text a path writes (pure) |
| `plugins/quickbar/types/index.d.ts` | Config types and the plugin's state contract |
| `plugins/quickbar/defaults/quickbar.json` | The example shown after installing |
| `schema/quickbar.schema.json` | JSON Schema for editors |

## Pull requests

- Keep the plugin dependency-free.
- Add or update a test for behavior changes.
- When you add a config field, update the types, `config.ts`, the schema and the README tables together.
