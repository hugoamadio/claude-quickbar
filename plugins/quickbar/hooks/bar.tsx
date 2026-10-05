import type { ClientModule, ClientPointerEvent, RenderElement } from 'claude-code'

import type { QuickbarButton } from '../types'
import type { ResolvedStyle } from './config'
import { activate, hitTest, hoverView, layout, sameView } from './layout'
import type { View } from './layout'

// The bar as a Client: it draws every pill itself and gets the pointer, so the whole pill is clickable and
// hovering walks the menus like a desktop menu bar. Writing to the prompt happens in the hooks module (post).

export type BarProps = { buttons: QuickbarButton[]; style: ResolvedStyle; columns: number }

type State = { view: View; hover: string | null; pressed: string | null; closeIn: number }

const CLOSED: View = { open: -1, path: [] }
const TICK_MS = 100
/** Ticks after the pointer leaves before open menus close. */
const CLOSE_TICKS = 5

const Bar: ClientModule<BarProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const st = surface.state ?? { view: CLOSED, hover: null, pressed: null, closeIn: 0 }
  const set = (patch: Partial<State>) => {
    const now = surface.state ?? st
    const next = { ...now, ...patch }
    const same = sameView(now.view, next.view) && now.hover === next.hover && now.pressed === next.pressed && now.closeIn === next.closeIn
    if (!same) surface.setState(next)
  }

  // A config reload can drop the open select.
  const view = st.view.open < props.buttons.length ? st.view : CLOSED
  const l = layout(props.buttons, props.style, view, props.columns)

  if (surface.state === undefined) {
    surface.setState(st)
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (!s || s.closeIn <= 0) return
      set(s.closeIn === 1 ? { closeIn: 0, view: CLOSED, hover: null } : { closeIn: s.closeIn - 1 })
    })
  }

  surface.onPointer((e: ClientPointerEvent) => {
    const s = surface.state ?? st
    if (e.type === 'leave') {
      set({ hover: null, pressed: null, closeIn: s.view.open >= 0 ? CLOSE_TICKS : 0 })
      return
    }
    const pill = hitTest(l, e.x, e.y)
    if (e.type === 'move' || e.type === 'enter') {
      set({ hover: pill?.id ?? null, closeIn: 0, view: pill && e.button === undefined ? hoverView(props.buttons, s.view, pill) : s.view })
      return
    }
    if (e.type === 'down') {
      set({ pressed: pill?.id ?? null, closeIn: 0 })
      return
    }
    // up: a click is a down and an up on the same pill.
    if (!pill || pill.id !== s.pressed) {
      set({ pressed: null })
      return
    }
    const act = activate(s.view, pill)
    if (act.kind === 'deliver') surface.post({ type: 'deliver', button: act.button, path: act.path })
    set({ pressed: null, view: act.view })
  })

  surface.onKey(e => {
    const i = props.buttons.findIndex(b => b.hotkey === e.key)
    const s = surface.state ?? st
    const pill = l.lines.flatMap(line => line.pills).find(p => p.kind === 'button' && p.index === i)
    if (!pill) return
    const act = activate(s.view, pill)
    if (act.kind === 'deliver') surface.post({ type: 'deliver', button: act.button, path: act.path })
    set({ view: act.view })
  })

  // Children are passed spread: a surface module's `h` does not flatten arrays.
  const pill = (p: (typeof l.lines)[number]['pills'][number]) => {
    const isHover = st.hover === p.id
    return (
      <Box key={p.id} width={p.width} height={l.pillHeight} marginRight={props.style.gap}
        paddingX={props.style.paddingX} paddingY={props.style.paddingY}
        backgroundColor={isHover ? props.style.hoverColor : p.color}>
        <Text bold={isHover || p.isActive} wrap="truncate-end">{p.label}</Text>
      </Box>
    )
  }
  const lines = l.lines.map(line => h(Box, { key: `line-${line.y}`, height: l.pillHeight }, ...line.pills.map(pill)))
  return h(Box, { flexDirection: 'column' }, ...lines) as RenderElement
}

export default Bar
