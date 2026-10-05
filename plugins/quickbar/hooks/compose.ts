import type { QuickbarButton, QuickbarMode, QuickbarOption } from '../types'

// What a select shows and what it writes. Pure, like config.ts.

/** The option lists shown for a select, one per level: the button's own, then each chosen option's. */
export function levels(button: QuickbarButton, path: readonly number[]): QuickbarOption[][] {
  const out: QuickbarOption[][] = []
  let current = button.options
  for (let depth = 0; current && current.length; depth++) {
    out.push(current)
    const chosen = path[depth]
    current = chosen === undefined ? undefined : current[chosen]?.options
  }
  return out
}

/** The chosen options along the path, stopping at the first index that does not exist. */
export function chosen(button: QuickbarButton, path: readonly number[]): QuickbarOption[] {
  const out: QuickbarOption[] = []
  let current = button.options
  for (const i of path) {
    const opt = current?.[i]
    if (!opt) break
    out.push(opt)
    current = opt.options
  }
  return out
}

/** The text a finished path writes: the button's prefix, each chosen `text`, the last choice's label if it has none. */
export function composeText(button: QuickbarButton, picked: readonly QuickbarOption[]): string {
  const parts = picked.map((o, i) => (o.text ?? (i === picked.length - 1 ? o.label : '')))
  return [button.text ?? '', ...parts].filter(p => p.trim() !== '').join(button.separator ?? ' ')
}

export type Delivery = { text: string; mode: QuickbarMode; send: boolean }

/** How a finished path is delivered; the last choice's `mode`/`send` win over the button's. */
export function deliveryOf(button: QuickbarButton, picked: readonly QuickbarOption[]): Delivery {
  const last = picked[picked.length - 1]
  return {
    text: picked.length ? composeText(button, picked) : (button.text ?? ''),
    mode: last?.mode ?? button.mode ?? 'insert',
    send: last?.send ?? button.send ?? false,
  }
}

/** The prompt box after writing `text` by `mode` (used when sending, to send what the box would hold). */
export function applyMode(box: { text: string; cursor: number }, text: string, mode: QuickbarMode): string {
  if (mode === 'replace') return text
  if (mode === 'append') return box.text ? `${box.text.replace(/\s*$/, '')} ${text}` : text
  const at = Math.max(0, Math.min(box.cursor, box.text.length))
  return box.text.slice(0, at) + text + box.text.slice(at)
}
