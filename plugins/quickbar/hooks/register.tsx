import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { QuickbarButton, QuickbarConfig, QuickbarOption, QuickbarSource } from '../types'
import { applyMode, chosen, deliveryOf, levels } from './compose'
import { parse, resolveStyle } from './config'

// Quickbar: a band of big buttons above the prompt, read from quickbar.json.
// A button writes its text into the prompt (or sends it); a select opens its options above the bar,
// and each option can open another level, until a final choice writes the composed text.

const config = atom({ plugin: 'quickbar', key: 'config' } as const, null as QuickbarConfig | null)
const source = atom({ plugin: 'quickbar', key: 'source' } as const, null as QuickbarSource | null)
const errors = atom({ plugin: 'quickbar', key: 'errors' } as const, [] as string[])
const open = atom({ plugin: 'quickbar', key: 'open' } as const, -1)
const path = atom({ plugin: 'quickbar', key: 'path' } as const, [] as number[])
const hidden = atom({ plugin: 'quickbar', key: 'hidden' } as const, false)

const FILE = 'quickbar.json'
const POLL_MS = 2000
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
  'quickbar: big buttons above the prompt, from quickbar.json',
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
    if (!dest) return 'quickbar: no home directory found for the user config.'
    if (await $.fs.exists(dest.path)) return `quickbar: ${dest.path} already exists; edit it, nothing was overwritten.`
    await $.fs.write(dest.path, await $.fs.read(`${$.plugin.root}/defaults/${FILE}`))
    await load($)
    return `quickbar: wrote ${dest.path}. Edit it and save; the bar updates by itself.`
  }
  if (verb === 'reload') {
    await load($)
  } else if (verb === 'hide' || verb === 'show') {
    await update($, hidden, () => verb === 'hide')
    return `quickbar: bar ${verb === 'hide' ? 'hidden' : 'shown'}.`
  } else if (verb !== 'where') {
    return USAGE
  }
  const src = await read($, source)
  const errs = await read($, errors)
  const where = src ? `${src.kind} config: ${src.path}` : 'no config loaded'
  return errs.length ? `quickbar: ${where}\n${errs.length} error(s):\n- ${errs.join('\n- ')}` : `quickbar: ${where} (ok)`
}

export const register: Register = on => {
  let timer: Timer | undefined
  let last = ''

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

    const pill = (key: string, label: string, bg: string, onPress: () => unknown, hotkey?: string) => (
      <Box key={`pill-${key}`} backgroundColor={bg} paddingX={st.paddingX} paddingY={st.paddingY}
        marginRight={st.gap} hover={{ backgroundColor: st.hoverColor }}>
        <Button key={key} plain label={label} hover={{ bold: true }} onPress={() => void onPress()}
          {...(hotkey ? { hotkey } : {})} />
      </Box>
    )

    if (!cfg) {
      return (
        <Box key="quickbar-error">
          {pill('error', `quickbar: ${errs.length} config error${errs.length === 1 ? '' : 's'}, press for details`, ERROR_COLOR,
            () => $.ui.toast(`${errs.slice(0, 3).join(' · ')}  (run /quickbar where)`, { timeoutMs: 10000 }))}
        </Box>
      )
    }

    const openIdx = await read($, open)
    const picked = await read($, path)
    const openButton = openIdx >= 0 ? cfg.buttons[openIdx] : undefined

    const levelRows = openButton
      ? levels(openButton, picked).map((opts, depth) => (
        <Box key={`level-${depth}`} flexWrap="wrap">
          {opts.map((opt, j) => {
            const isChosen = picked[depth] === j
            return pill(`opt-${depth}-${j}`, opt.options ? `${opt.label} ›` : opt.label,
              isChosen ? st.activeColor : (opt.color ?? st.color),
              async () => {
                const nextPath = [...picked.slice(0, depth), j]
                if (opt.options) {
                  await update($, path, () => nextPath)
                  return
                }
                await close($)
                await deliver($, openButton, chosen(openButton, nextPath))
              })
          })}
          {depth === 0 && pill('close', '✕', st.color, () => close($))}
        </Box>
      )).reverse()
      : []

    return (
      <Box key="quickbar" flexDirection="column">
        {levelRows}
        <Box key="bar" flexWrap="wrap">
          {cfg.buttons.map((b, i) => {
            const isSelect = Boolean(b.options)
            const isOpen = openIdx === i
            return pill(`btn-${i}`, isSelect ? `${b.label} ${isOpen ? '▴' : '▾'}` : b.label,
              isOpen ? st.activeColor : (b.color ?? st.color),
              async () => {
                if (!isSelect) return deliver($, b, [])
                await update($, open, () => (isOpen ? -1 : i))
                await update($, path, () => [])
              },
              b.hotkey)
          })}
        </Box>
        {errs.length > 0 && <Text dimColor>{`quickbar: ${errs[0]}`}</Text>}
      </Box>
    )
  })

  on('session.end', async ($, e, next) => {
    timer?.cancel()
    return next(e)
  })
}
