import { describe, expect, test } from 'claude-code/testing'

import { resolveStyle } from '../hooks/config'
import { activate, hitTest, hoverView, layout } from '../hooks/layout'
import type { QuickbarButton } from '../types'

const st = resolveStyle({ size: 'lg' }) // paddingX 3, paddingY 1, gap 1: pills are 3 rows tall
const buttons: QuickbarButton[] = [
  { label: 'Explain', text: 'Explain' },
  { label: 'Review', options: [{ label: 'Bugs' }, { label: 'Style', options: [{ label: 'Strict' }] }] },
]

describe('layout', () => {
  test('the bar alone, pills sized by label and padding', async () => {
    const l = layout(buttons, st, { open: -1, path: [] }, 200)
    expect(l.lines.length).toBe(1)
    expect(l.lines[0]!.pills.map(p => [p.label, p.x, p.width])).toEqual([['Explain', 0, 13], ['Review ▾', 14, 14]])
    expect(l.height).toBe(3)
  })

  test('open levels stack above the bar, deepest first', async () => {
    const l = layout(buttons, st, { open: 1, path: [1] }, 200)
    expect(l.lines.map(line => line.pills.map(p => p.label))).toEqual([['Strict'], ['Bugs', 'Style ›', '✕'], ['Explain', 'Review ▴']])
    expect(l.lines.map(line => line.y)).toEqual([0, 3, 6])
  })

  test('wraps a level that does not fit', async () => {
    const l = layout(buttons, st, { open: -1, path: [] }, 20)
    expect(l.lines.map(line => line.pills.map(p => p.x))).toEqual([[0], [0]])
  })

  test('hitTest covers the whole pill, padding included, and not the gap', async () => {
    const l = layout(buttons, st, { open: -1, path: [] }, 200)
    expect(hitTest(l, 0, 0)?.id).toBe('b0') // top-left corner, padding
    expect(hitTest(l, 12, 2)?.id).toBe('b0') // bottom-right corner
    expect(hitTest(l, 13, 1)).toBeUndefined() // the gap
    expect(hitTest(l, 14, 1)?.id).toBe('b1')
    expect(hitTest(l, 5, 3)).toBeUndefined() // below the bar
  })
})

describe('hover walks the menus', () => {
  const l = (open: number, path: number[]) => layout(buttons, st, { open, path }, 200)
  const pill = (open: number, path: number[], id: string) => l(open, path).lines.flatMap(x => x.pills).find(p => p.id === id)!

  test('hovering a select opens it; a plain button closes menus', async () => {
    expect(hoverView(buttons, { open: -1, path: [] }, pill(-1, [], 'b1'))).toEqual({ open: 1, path: [] })
    expect(hoverView(buttons, { open: 1, path: [1] }, pill(1, [1], 'b0'))).toEqual({ open: -1, path: [] })
  })

  test('hovering an option with children opens its level; a final option closes deeper levels', async () => {
    expect(hoverView(buttons, { open: 1, path: [] }, pill(1, [], 'o0.1'))).toEqual({ open: 1, path: [1] })
    expect(hoverView(buttons, { open: 1, path: [1] }, pill(1, [1], 'o0.0'))).toEqual({ open: 1, path: [] })
  })
})

describe('clicks', () => {
  const pill = (open: number, path: number[], id: string) =>
    layout(buttons, st, { open, path }, 200).lines.flatMap(x => x.pills).find(p => p.id === id)!

  test('a plain button and a final option deliver and close', async () => {
    expect(activate({ open: -1, path: [] }, pill(-1, [], 'b0'))).toEqual({ kind: 'deliver', button: 0, path: [], view: { open: -1, path: [] } })
    expect(activate({ open: 1, path: [1] }, pill(1, [1], 'o1.0'))).toEqual({ kind: 'deliver', button: 1, path: [1, 0], view: { open: -1, path: [] } })
  })

  test('clicking the open option again folds it; clicking the open select closes it', async () => {
    expect(activate({ open: 1, path: [1] }, pill(1, [1], 'o0.1'))).toEqual({ kind: 'view', view: { open: 1, path: [] } })
    expect(activate({ open: 1, path: [] }, pill(1, [], 'o0.1'))).toEqual({ kind: 'view', view: { open: 1, path: [1] } })
    expect(activate({ open: 1, path: [] }, pill(1, [], 'b1'))).toEqual({ kind: 'view', view: { open: -1, path: [] } })
  })
})
