import type { QuickbarButton } from '../types'
import { levels } from './compose'
import type { ResolvedStyle } from './config'

// Where every pill sits, in cells, so the bar can draw them and find the one under the pointer. Pure.

export type PillKind = 'button' | 'option' | 'close'

export type Pill = {
  /** Stable address: `b3` a bar button, `o1.2` option 2 of level 1, `x` the close pill. */
  id: string
  kind: PillKind
  /** Bar index (buttons) or option index within its level. */
  index: number
  /** -1 for the bar, the level for options. */
  depth: number
  label: string
  /** Background before hover: the button or option color, or the active color. */
  color: string
  isActive: boolean
  hasChildren: boolean
  x: number
  width: number
}

export type Line = { y: number; pills: Pill[] }
export type Layout = { lines: Line[]; pillHeight: number; width: number; height: number }

export type View = { open: number; path: readonly number[] }

const cells = (s: string) => [...s].length

function wrap(pills: Omit<Pill, 'x'>[], columns: number, gap: number): Pill[][] {
  const out: Pill[][] = []
  let line: Pill[] = []
  let x = 0
  for (const p of pills) {
    if (line.length && x + p.width > columns) {
      out.push(line)
      line = []
      x = 0
    }
    line.push({ ...p, x })
    x += p.width + gap
  }
  if (line.length) out.push(line)
  return out
}

/** Lines top to bottom: the deepest open level first, the bar last. */
export function layout(buttons: readonly QuickbarButton[], st: ResolvedStyle, view: View, columns: number): Layout {
  const pillHeight = 1 + 2 * st.paddingY
  const width = (label: string) => cells(label) + 2 * st.paddingX
  const cols = Math.max(columns, 1)

  const bar = buttons.map((b, i): Omit<Pill, 'x'> => {
    const isSelect = Boolean(b.options)
    const isOpen = view.open === i
    const label = isSelect ? `${b.label} ${isOpen ? '▴' : '▾'}` : b.send ? `${b.label} ⏎` : b.label
    return {
      id: `b${i}`, kind: 'button', index: i, depth: -1, label, width: width(label),
      color: isOpen ? st.activeColor : (b.color ?? st.color), isActive: isOpen, hasChildren: isSelect,
    }
  })

  const groups: Pill[][][] = []
  const open = view.open >= 0 ? buttons[view.open] : undefined
  if (open?.options) {
    levels(open, view.path).forEach((opts, depth) => {
      const pills = opts.map((o, j): Omit<Pill, 'x'> => {
        // ⏎ marks a final choice that sends the prompt right away.
        const label = o.options ? `${o.label} ›` : (o.send ?? open.send) ? `${o.label} ⏎` : o.label
        const isActive = view.path[depth] === j
        return {
          id: `o${depth}.${j}`, kind: 'option', index: j, depth, label, width: width(label),
          color: isActive ? st.activeColor : (o.color ?? st.color), isActive, hasChildren: Boolean(o.options),
        }
      })
      if (depth === 0) {
        pills.push({ id: 'x', kind: 'close', index: 0, depth: 0, label: '✕', width: width('✕'), color: st.color, isActive: false, hasChildren: false })
      }
      groups.unshift(wrap(pills, cols, st.gap))
    })
  }
  groups.push(wrap(bar, cols, st.gap))

  const lines: Line[] = []
  for (const group of groups) for (const pills of group) lines.push({ y: lines.length * pillHeight, pills })
  const used = Math.max(0, ...lines.map(l => {
    const last = l.pills[l.pills.length - 1]
    return last ? last.x + last.width : 0
  }))
  return { lines, pillHeight, width: used, height: lines.length * pillHeight }
}

/** The pill under a region-relative cell, or undefined. */
export function hitTest(l: Layout, x: number, y: number): Pill | undefined {
  if (y < 0 || x < 0) return undefined
  const line = l.lines[Math.floor(y / l.pillHeight)]
  return line?.pills.find(p => x >= p.x && x < p.x + p.width)
}

/** What hovering a pill does to the open menus, like a desktop menu bar. */
export function hoverView(buttons: readonly QuickbarButton[], view: View, pill: Pill): View {
  if (pill.kind === 'button') {
    if (!pill.hasChildren) return view.open === -1 ? view : { open: -1, path: [] }
    return view.open === pill.index ? view : { open: pill.index, path: [] }
  }
  if (pill.kind === 'option') {
    const next = pill.hasChildren ? [...view.path.slice(0, pill.depth), pill.index] : view.path.slice(0, pill.depth)
    return sameView(view, { open: view.open, path: next }) ? view : { open: view.open, path: next }
  }
  return view
}

export type Activation =
  | { kind: 'view'; view: View }
  | { kind: 'deliver'; button: number; path: number[]; view: View }

/** What clicking a pill does: write/send a button or a final choice, or open and close levels. */
export function activate(view: View, pill: Pill): Activation {
  const closed: View = { open: -1, path: [] }
  if (pill.kind === 'close') return { kind: 'view', view: closed }
  if (pill.kind === 'button') {
    if (!pill.hasChildren) return { kind: 'deliver', button: pill.index, path: [], view: closed }
    return { kind: 'view', view: view.open === pill.index ? closed : { open: pill.index, path: [] } }
  }
  const before = view.path.slice(0, pill.depth)
  if (!pill.hasChildren) return { kind: 'deliver', button: view.open, path: [...before, pill.index], view: closed }
  // Clicking the open option again folds what it opened.
  const isOpen = view.path[pill.depth] === pill.index
  return { kind: 'view', view: { open: view.open, path: isOpen ? before : [...before, pill.index] } }
}

export const sameView = (a: View, b: View) => a.open === b.open && a.path.length === b.path.length && a.path.every((v, i) => v === b.path[i])
