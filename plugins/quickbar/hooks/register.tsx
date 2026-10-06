import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { QuickbarButton, QuickbarConfig, QuickbarOption, QuickbarSource } from '../types'
import type { BarProps } from './bar'
import { applyMode, chosen, deliveryOf } from './compose'
import { parse, resolveStyle } from './config'
import { activate, layout } from './layout'
import type { Pill } from './layout'

// Quickbar: a band of big buttons above the prompt, read from quickbar.json.
// A button writes its text into the prompt (or sends it); a select opens its options above the bar,
// and each option can open another level, until a final choice writes the composed text.
// Where the surface has a Client (terminal, desktop) the bar is ./bar.tsx: whole-pill clicks and hover
// navigation. Elsewhere it falls back to plain Buttons driven by clicks.

const config = atom({ plugin: 'quickbar', key: 'config' } as const, null as QuickbarConfig | null)
const source = atom({ plugin: 'quickbar', key: 'source' } as const, null as QuickbarSource | null)
const errors = atom({ plugin: 'quickbar', key: 'errors' } as const, [] as string[])
const open = atom({ plugin: 'quickbar', key: 'open' } as const, -1)
const path = atom({ plugin: 'quickbar', key: 'path' } as const, [] as number[])
const hidden = atom({ plugin: 'quickbar', key: 'hidden' } as const, false)

const FILE = 'quickbar.json'
const POLL_MS = 3000
const ERROR_COLOR = '#b42318'

type Candidate = QuickbarSource & { kind: 'project' | 'user' }

async function candidates($: EngineInterface): Promise<Candidate[]> {
  const root = await $.session.root()
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  const out: Candidate[] = [{ kind: 'project', path: `${root}/.claude/${FILE}` }]
  if (home) out.push({ kind: 'user', path: `${home}/.claude/${FILE}` })
  return out
}

/** A fingerprint of the config files: changes when one appears, disappears or is saved. */
async function fingerprint($: EngineInterface): Promise<string> {
  const parts = await Promise.all(
    (await candidates($)).map(async c => ((await $.fs.exists(c.path)) ? `${c.path}@${(await $.fs.stat(c.path)).mtimeMs}` : '-')),
  )
  return parts.join('|')
}

/** Loads the first config found: the project's, then the user's, then the bundled example. */
async function load($: EngineInterface): Promise<void> {
  let found: QuickbarSource = { kind: 'default', path: `${$.plugin.root}/defaults/${FILE}` }
  for (const c of await candidates($)) {
    if (await $.fs.exists(c.path)) {
      found = c
      break
    }
  }
  let text = ''
  let readError = ''
  try {
    text = await $.fs.read(found.path)
  } catch (err) {
    readError = `could not read ${found.path}: ${err instanceof Error ? err.message : String(err)}`
  }
  const parsed = readError ? { config: null, errors: [readError] } : parse(text)
  await update($, config, () => parsed.config)
  await update($, source, () => found)
  await update($, errors, () => parsed.errors)
  await update($, open, () => -1)
  await update($, path, () => [])
}

/** Writes or sends a finished button or select path. */
async function deliver($: EngineInterface, button: QuickbarButton, picked: QuickbarOption[]): Promise<void> {
  const d = deliveryOf(button, picked)
  if (d.send) {
    const box = await $.prompt.read()
    await $.prompt.fill({ text: '', mode: 'replace' })
    await $.prompt.submit({ text: applyMode(box, d.text, d.mode), asUser: true })
    return
  }
  if (d.mode === 'append') {
    await $.prompt.fill({ text: applyMode(await $.prompt.read(), d.text, 'append'), mode: 'replace' })
    return
  }
  await $.prompt.fill({ text: d.text, mode: d.mode })
}

const close = async ($: EngineInterface) => {
  await update($, open, () => -1)
  await update($, path, () => [])
}

const USAGE = [
  'big buttons above the prompt, from quickbar.json',
  '  /quickbar init           copy the example config to ~/.claude/quickbar.json',
  '  /quickbar init project   copy it to this project (.claude/quickbar.json)',
  '  /quickbar where          show which config is active and its errors',
  '  /quickbar reload         read the config again (it also reloads on save)',
  '  /quickbar hide | show    hide or show the bar',
].join('\n')

async function runCommand($: EngineInterface, args: string): Promise<string> {
  const [verb = '', target = ''] = args.trim().split(/\s+/)
  if (verb === 'init') {
    const list = await candidates($)
    const dest = list.find(c => c.kind === (target === 'project' ? 'project' : 'user'))
    if (!dest) return 'no home directory found for the user config.'
    if (await $.fs.exists(dest.path)) return `${dest.path} already exists; edit it, nothing was overwritten.`
    await $.fs.write(dest.path, await $.fs.read(`${$.plugin.root}/defaults/${FILE}`))
    await load($)
    return `wrote ${dest.path}. Edit it and save; the bar updates by itself.`
  }
  if (verb === 'reload') {
    await load($)
  } else if (verb === 'hide' || verb === 'show') {
    await update($, hidden, () => verb === 'hide')
    return `bar ${verb === 'hide' ? 'hidden' : 'shown'}.`
  } else if (verb !== 'where') {
    return USAGE
  }
  const src = await read($, source)
  const errs = await read($, errors)
  const where = src ? `${src.kind} config: ${src.path}` : 'no config loaded'
  return errs.length ? `${where}\n${errs.length} error(s):\n- ${errs.join('\n- ')}` : `${where} (ok)`
}

export const register: Register = on => {
  let timer: Timer | undefined
  let last = ''
  let loading: Promise<void> | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'quickbar', description: 'Quickbar: init, where, reload, hide, show' })
    await load($)
    last = await fingerprint($)
    timer = $.clock.every(POLL_MS, () => {
      void fingerprint($).then(async now => {
        if (now === last) return
        last = now
        await load($)
      }).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'quickbar' }, async ($, e) => ({ text: await runCommand($, e.args) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const cfg = await read($, config)
    const errs = await read($, errors)
    const st = resolveStyle(cfg?.style)

    // A pill made only of Buttons, so the whole colored area is clickable without tracking the pointer:
    // blank Buttons for the padding rows, and the label padded with spaces to the pill's width.
    const pill = (key: string, label: string, bg: string, onPress: () => unknown, hotkey?: string, scope?: string) => {
      const width = [...label].length + 2 * st.paddingX
      const pad = ' '.repeat(st.paddingX)
      const press = () => void onPress()
      // Every row of a pill shares one hover scope, so the whole pill lights at once in the hover color.
      // A select in peek mode passes its own scope, which also reveals its options row.
      const group = scope ?? `quickbar-pill-${key}`
      const lit = { scope: group, backgroundColor: st.hoverColor }
      const keys = hotkey ? { hotkey } : {}

      if (e.surface !== 'terminal') {
        // Desktop and VS Code draw native buttons: one per pill, with its label.
        return (
          <Box key={`pill-${key}`} backgroundColor={bg} marginRight={st.gap} hover={lit}>
            <Button key={key} plain label={`${pad}${label}${pad}`} hover={{ ...lit, bold: true }} onPress={press} {...keys} />
          </Box>
        )
      }

      // Terminal: the terminal inverts the Button under the pointer (text and background swap). Every row is
      // a blank Button whose text color is the hover color, so that inversion changes nothing on screen, and
      // the label is a plain Text laid over the middle row, which never inverts. Clicks on any row press.
      const rows = 1 + 2 * st.paddingY
      const blankLit = { ...lit, color: st.hoverColor }
      return (
        <Box key={`pill-${key}`} flexDirection="column" backgroundColor={bg} marginRight={st.gap} hover={lit}>
          {Array.from({ length: rows }, (_, r) => (
            <Button key={r === st.paddingY ? key : `${key}-r${r}`} plain label={' '.repeat(width)} hover={blankLit}
              onPress={press} {...(r === st.paddingY ? keys : {})} />
          ))}
          <Box key={`label-${key}`} position="absolute" top={st.paddingY} left={st.paddingX}>
            <Text hover={{ scope: group, bold: true }}>{label}</Text>
          </Box>
        </Box>
      )
    }

    // Not loaded yet (drawn before session.start finished): draw nothing and make sure a load is on its way.
    if (!cfg && errs.length === 0) {
      if (!loading) loading = load($).finally(() => { loading = undefined })
      return next(e)
    }

    if (!cfg) {
      return (
        <Box key="quickbar-error">
          {pill('error', `quickbar: ${errs.length} config error${errs.length === 1 ? '' : 's'}, press for details`, ERROR_COLOR,
            () => $.ui.toast(`${errs.slice(0, 3).join(' · ')}  (run /quickbar where)`, { timeoutMs: 10000 }))}
        </Box>
      )
    }

    const errLine = errs.length > 0 ? <Text dimColor>{`quickbar: ${errs[0]}`}</Text> : null
    const table = $.ui.resolve(e)

    // Hover navigation is opt-in: its Client tracks the pointer, which takes over text selection in the terminal.
    if (cfg.navigation === 'hover' && (e.surface === 'terminal' || e.surface === 'desktop') && 'Client' in table) {
      const { Client } = table
      const props: BarProps = { buttons: cfg.buttons, style: st, columns: e.props.bodyColumns }
      return (
        <Box key="quickbar" flexDirection="column">
          <Client key="bar" module="./bar.tsx" props={props} />
          {errLine}
        </Box>
      )
    }

    // Click navigation (the default, and VS Code): the same layout drawn with Buttons.
    const view = { open: await read($, open), path: await read($, path) }
    const l = layout(cfg.buttons, st, view, e.props.bodyColumns)
    const press = (p: Pill) => async () => {
      const act = activate(view, p)
      await update($, open, () => act.view.open)
      await update($, path, () => [...act.view.path])
      if (act.kind === 'deliver') {
        const b = cfg.buttons[act.button]
        if (b) await deliver($, b, chosen(b, act.path))
      }
    }
    const isPeek = cfg.navigation === 'peek'
    const scopeOf = (i: number) => `quickbar-select-${i}`
    const drawLine = (line: (typeof l.lines)[number], onPress: (p: Pill) => () => Promise<void>, prefix = '') => (
      <Box key={`${prefix}line-${line.y}`}>
        {line.pills.map(p => pill(`${prefix}${p.id}`, p.label, p.color, onPress(p),
          p.kind === 'button' ? cfg.buttons[p.index]?.hotkey : undefined,
          isPeek && p.kind === 'button' && p.hasChildren && view.open !== p.index ? scopeOf(p.index) : undefined))}
      </Box>
    )
    const barStart = l.lines.findIndex(line => line.pills.some(p => p.kind === 'button'))

    // Peek: each closed select's first level, hidden right above the bar and revealed by hovering the select
    // (a hover style, no pointer tracking). The revealed row shares the select's hover scope, so moving onto
    // it keeps it open; a click there works like click navigation.
    const peeks = isPeek
      ? cfg.buttons.flatMap((b, i) => {
        if (!b.options || view.open === i) return []
        const pv = { open: i, path: [] as number[] }
        const pl = layout(cfg.buttons, st, pv, e.props.bodyColumns)
        const rows = pl.lines.filter(line => line.pills.every(p => p.kind !== 'button'))
        const pressPeek = (p: Pill) => async () => {
          const act = activate(pv, p)
          await update($, open, () => act.view.open)
          await update($, path, () => [...act.view.path])
          if (act.kind === 'deliver') await deliver($, b, chosen(b, act.path))
        }
        return [(
          <Box key={`peek-${i}`} flexDirection="column" display="none" hover={{ display: 'flex', scope: scopeOf(i) }}>
            {rows.map(line => drawLine(line, pressPeek, `p${i}-`))}
          </Box>
        )]
      })
      : []

    return (
      <Box key="quickbar" flexDirection="column">
        {l.lines.slice(0, barStart).map(line => drawLine(line, press))}
        {peeks}
        {l.lines.slice(barStart).map(line => drawLine(line, press))}
        {errLine}
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    const data = e.data as { type?: string; button?: number; path?: number[] } | null
    if (e.module.endsWith('bar.tsx') && data?.type === 'deliver' && typeof data.button === 'number') {
      const cfg = await read($, config)
      const b = cfg?.buttons[data.button]
      if (b) await deliver($, b, chosen(b, Array.isArray(data.path) ? data.path : []))
      return {}
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    timer?.cancel()
    return next(e)
  })
}
