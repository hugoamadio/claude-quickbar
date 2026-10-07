# Changelog

## 0.4.2

- A button with a hotkey keeps its label centered: Claude Code draws the hotkey as "e:" before the label, which now takes two padding columns instead of pushing the label right.

## 0.4.1

- `/quickbar demo` shows the bundled example in the current session only (for recording a demo); `/quickbar demo off` goes back.

## 0.4.0

- Buttons are one row tall in `click` and `peek` navigation, and use Claude Code's own pointer highlight with no hover colors of their own. Claude Code inverts a button under the pointer, cleanly only for one-row buttons (a taller button inverted only its first row, stacked rows lit row by row, and pre-set hover colors showed as white blocks). This replaces the 0.3.x attempts.
- Peek: the options row opens right above its own select, and the select no longer turns white while the pointer is on its options.
- `⏎` after a label marks a button or option that sends the prompt right away.

## 0.3.5

- Terminal: each button is one block (a single Button whose label spans every row). A click anywhere presses it, and under the pointer the whole block lights at once in the hover color, the same on every row.

## 0.3.4

- Terminal: clicking on a button's label works again (the label had been drawn over the button and took the click). Under the pointer the label row now inverts to a darker shade of the hover color instead of white.

## 0.3.3

- Shares the band above the prompt: whatever other plugins draw there is kept, above the bar, instead of being replaced.

## 0.3.2

- Terminal: no more white stripe on the row under the pointer. Each row of a button is a blank Button whose inversion is invisible, and the label is drawn over it, so the whole button lights as one block.

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
