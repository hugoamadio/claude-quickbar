import type { QuickbarButton, QuickbarConfig, QuickbarOption, QuickbarStyle } from '../types'

// Reads and checks a quickbar.json. Pure: no `$`, so the tests drive it directly.

const MODES = ['insert', 'append', 'replace']
const SIZES = ['sm', 'md', 'lg']
const MAX_BUTTONS = 20
const MAX_DEPTH = 6

export type Parsed = { config: QuickbarConfig | null; errors: string[] }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function checkColor(v: unknown, at: string, errors: string[]) {
  if (v !== undefined && (typeof v !== 'string' || !v.trim())) errors.push(`${at}: must be a color name or hex like "#2e7d4f"`)
}

function checkCommon(o: Record<string, unknown>, at: string, errors: string[]) {
  if (typeof o.label !== 'string' || !o.label.trim()) errors.push(`${at}.label: required text`)
  if (o.text !== undefined && typeof o.text !== 'string') errors.push(`${at}.text: must be text`)
  checkColor(o.color, `${at}.color`, errors)
  if (o.mode !== undefined && !MODES.includes(o.mode as string)) errors.push(`${at}.mode: one of ${MODES.join(', ')}`)
  if (o.send !== undefined && typeof o.send !== 'boolean') errors.push(`${at}.send: true or false`)
}

function checkOptions(v: unknown, at: string, depth: number, errors: string[]) {
  if (!Array.isArray(v) || v.length === 0) {
    errors.push(`${at}: must be a non-empty list`)
    return
  }
  if (depth > MAX_DEPTH) {
    errors.push(`${at}: nested deeper than ${MAX_DEPTH} levels`)
    return
  }
  v.forEach((opt: unknown, i) => {
    const here = `${at}[${i}]`
    if (!isObject(opt)) {
      errors.push(`${here}: must be an object`)
      return
    }
    checkCommon(opt, here, errors)
    if (opt.options !== undefined) checkOptions(opt.options, `${here}.options`, depth + 1, errors)
  })
}

function checkStyle(v: unknown, errors: string[]) {
  if (v === undefined) return
  if (!isObject(v)) {
    errors.push('style: must be an object')
    return
  }
  if (v.size !== undefined && !SIZES.includes(v.size as string)) errors.push(`style.size: one of ${SIZES.join(', ')}`)
  for (const [k, max] of [['paddingX', 8], ['paddingY', 3], ['gap', 4]] as const) {
    const n = v[k]
    if (n !== undefined && (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max)) {
      errors.push(`style.${k}: a whole number from 0 to ${max}`)
    }
  }
  for (const k of ['color', 'activeColor', 'hoverColor']) checkColor(v[k], `style.${k}`, errors)
}

/** Checks a parsed JSON value; returns the config only when there is no error. */
export function validate(raw: unknown): Parsed {
  const errors: string[] = []
  if (!isObject(raw)) return { config: null, errors: ['the file must hold a JSON object'] }
  checkStyle(raw.style, errors)
  if (raw.navigation !== undefined && !['click', 'hover'].includes(raw.navigation as string)) errors.push('navigation: one of click, hover')
  const buttons = raw.buttons
  if (!Array.isArray(buttons) || buttons.length === 0) {
    errors.push('buttons: must be a non-empty list')
  } else {
    if (buttons.length > MAX_BUTTONS) errors.push(`buttons: at most ${MAX_BUTTONS}`)
    const hotkeys = new Set<string>()
    buttons.forEach((b: unknown, i) => {
      const at = `buttons[${i}]`
      if (!isObject(b)) {
        errors.push(`${at}: must be an object`)
        return
      }
      checkCommon(b, at, errors)
      if (b.separator !== undefined && typeof b.separator !== 'string') errors.push(`${at}.separator: must be text`)
      if (b.options === undefined && typeof b.text !== 'string') errors.push(`${at}: needs "text" (a button) or "options" (a select)`)
      if (b.options !== undefined) checkOptions(b.options, `${at}.options`, 1, errors)
      if (b.hotkey !== undefined) {
        if (typeof b.hotkey !== 'string' || !/^[a-z0-9]$/.test(b.hotkey)) errors.push(`${at}.hotkey: one lowercase letter or digit`)
        else if (hotkeys.has(b.hotkey)) errors.push(`${at}.hotkey: "${b.hotkey}" is already used`)
        else hotkeys.add(b.hotkey)
      }
    })
  }
  return errors.length ? { config: null, errors } : { config: raw as unknown as QuickbarConfig, errors }
}

/** Parses the file's text, then validates it. */
export function parse(text: string): Parsed {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { config: null, errors: [`not valid JSON: ${err instanceof Error ? err.message : String(err)}`] }
  }
  return validate(raw)
}

export type ResolvedStyle = Required<Pick<QuickbarStyle, 'paddingX' | 'paddingY' | 'gap' | 'color' | 'activeColor' | 'hoverColor'>>

const SIZE: Record<string, { paddingX: number; paddingY: number }> = {
  sm: { paddingX: 1, paddingY: 0 },
  md: { paddingX: 2, paddingY: 0 },
  lg: { paddingX: 3, paddingY: 1 },
}

export function resolveStyle(style: QuickbarStyle | undefined): ResolvedStyle {
  const s = style ?? {}
  const size = SIZE[s.size ?? 'lg'] ?? SIZE.lg!
  return {
    paddingX: s.paddingX ?? size.paddingX,
    paddingY: s.paddingY ?? size.paddingY,
    gap: s.gap ?? 1,
    color: s.color ?? '#3b4252',
    activeColor: s.activeColor ?? '#2e7d4f',
    hoverColor: s.hoverColor ?? '#5e6a82',
  }
}

export type { QuickbarButton, QuickbarOption }
