# Changelog

## 0.1.0

- Buttons that write, append, replace or send a prompt.
- Nested selects (up to 6 levels) that compose a prompt from the chosen options.
- Desktop-menu navigation: hover opens selects and levels, leaving closes them; the whole button is clickable; clicking an open option folds it.
- `~/.claude/quickbar.json` and per-project `.claude/quickbar.json`, reloaded on save.
- JSON Schema for editor autocompletion; `scripts/check-config.ts` for CI.
- `/quickbar init | where | reload | hide | show`.
