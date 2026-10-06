// Quickbar's config shape and its session state. Self-contained: no imports.

/** How text reaches the prompt box. */
export type QuickbarMode = 'insert' | 'append' | 'replace'

/** One choice inside a select. A choice with `options` opens another level instead of writing. */
export type QuickbarOption = {
  label: string
  /** Text this choice contributes. A final choice without `text` contributes its `label`. */
  text?: string
  color?: string
  /** Overrides the button's `mode` when this choice ends the path. */
  mode?: QuickbarMode
  /** Overrides the button's `send` when this choice ends the path. */
  send?: boolean
  options?: QuickbarOption[]
}

/** A bar button: a plain button when it has `text`, a select when it has `options`. */
export type QuickbarButton = {
  label: string
  /** Plain button: the text it writes. Select: an optional prefix before the chosen path. */
  text?: string
  color?: string
  /** One lowercase letter or digit that presses the button while the bar has focus. */
  hotkey?: string
  /** Where the text goes. Default `insert` (at the cursor). */
  mode?: QuickbarMode
  /** Submit the prompt right away instead of only writing it. Default `false`. */
  send?: boolean
  /** Joins the prefix and the chosen texts of a select. Default a single space. */
  separator?: string
  options?: QuickbarOption[]
}

export type QuickbarStyle = {
  /** `sm` one row, `md` one row with wider padding, `lg` three rows tall. Default `lg`. */
  size?: 'sm' | 'md' | 'lg'
  paddingX?: number
  paddingY?: number
  /** Columns between buttons. Default 1. */
  gap?: number
  /** Default button background. */
  color?: string
  /** Background of the open select and the chosen options. */
  activeColor?: string
  /** Background under the pointer. */
  hoverColor?: string
}

/**
 * `click` (default): click to open and pick; text selection in the terminal keeps working.
 * `hover`: hovering opens selects and levels like a desktop menu. It makes Claude Code track the pointer,
 * which takes over text selection in the terminal (selection may start a little off the pointer).
 * `peek` (experimental): hovering a select reveals its first level with a hover style, no pointer tracking;
 * deeper levels open on click.
 */
export type QuickbarNavigation = 'click' | 'hover' | 'peek'

export type QuickbarConfig = {
  $schema?: string
  navigation?: QuickbarNavigation
  style?: QuickbarStyle
  buttons: QuickbarButton[]
}

/** Where the active config came from. */
export type QuickbarSource = { kind: 'project' | 'user' | 'default'; path: string }

declare module 'claude-code' {
  interface PluginState {
    quickbar: {
      config: QuickbarConfig | null
      source: QuickbarSource | null
      errors: string[]
      /** Index of the open select in `buttons`, or -1. */
      open: number
      /** Indexes of the chosen options, one per level, of the open select. */
      path: number[]
      hidden: boolean
    }
  }
}
