# Changelog

## 0.3.1

- Click and peek modes: a button lights as one block in `hoverColor` under the pointer, instead of row by row.

## 0.3.0

- `"navigation": "peek"` (experimental): hovering a select reveals its first level with a hover style, without the pointer-tracking region; deeper levels open on click.

## 0.2.0

- `navigation`: `click` (new default) or `hover`. Hover tracks the pointer, which took over text selection in the terminal (selection started off the pointer), so it is now opt-in.
- In click mode the whole button is clickable too, padding rows included.
- Command replies no longer repeat the plugin name.

## 0.1.1

- No more "0 config errors" button when the bar is drawn before the config finished loading.
- The close timer runs only while menus wait to close; the config is checked every 3 s instead of 2 s.

## 0.1.0

- Buttons that write, append, replace or send a prompt.
- Nested selects (up to 6 levels) that compose a prompt from the chosen options.
- Desktop-menu navigation: hover opens selects and levels, leaving closes them; the whole button is clickable; clicking an open option folds it.
- `~/.claude/quickbar.json` and per-project `.claude/quickbar.json`, reloaded on save.
- JSON Schema for editor autocompletion; `scripts/check-config.ts` for CI.
- `/quickbar init | where | reload | hide | show`.
