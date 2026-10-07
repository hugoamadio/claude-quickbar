import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// The bar end to end: a fake disk with a user config, the session starting, presses on the drawing.

const HOME = '/home/dev'
const ROOT = '/work/app'
const USER_FILE = `${HOME}/.claude/quickbar.json`

const CONFIG = {
  buttons: [
    { label: 'Explain', text: 'Explain this', hotkey: 'e' },
    { label: 'Ship', text: 'Ship it', send: true },
    { label: 'Review', text: 'Review', options: [
      { label: 'Bugs', text: 'for bugs' },
      { label: 'Style', text: 'for style', options: [{ label: 'Strict' }, { label: 'Gentle' }] },
    ] },
  ],
}

// The bundled example, as the plugin ships it (the fake disk answers it for any path it does not hold).
const DEFAULT = JSON.stringify({ buttons: [
  { label: 'A', text: 'a' }, { label: 'B', text: 'b' },
  { label: 'C', options: [{ label: 'c' }] }, { label: 'D', options: [{ label: 'd' }] }, { label: 'E', options: [{ label: 'e' }] },
] })

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 160, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

type World = { files: Map<string, string>; box: { text: string; cursor: number }; sent: string[] }

function fakeEngine(on: On, files: Record<string, string>): World {
  const w: World = { files: new Map(Object.entries(files)), box: { text: '', cursor: 0 }, sent: [] }
  mock.clock(on)
  on('session.root', async () => ({ value: ROOT }))
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.exists', async (_$, e) => ({ value: w.files.has(e.path) }))
  on('fs.stat', async () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('fs.read', async (_$, e) => (w.files.has(e.path) ? { value: w.files.get(e.path)! } : { value: DEFAULT }))
  on('fs.write', async (_$, e) => { w.files.set(e.path, e.text); return { value: undefined } })
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('prompt.read', async () => ({ value: { ...w.box } }))
  on('prompt.fill', async (_$, e) => {
    const t = e.text
    if (e.mode === 'insert') w.box = { text: w.box.text.slice(0, w.box.cursor) + t + w.box.text.slice(w.box.cursor), cursor: w.box.cursor + t.length }
    else if (e.mode === 'append') w.box = { text: w.box.text + t, cursor: w.box.text.length + t.length }
    else w.box = { text: t, cursor: t.length }
    return { isFilled: true }
  })
  on('prompt.submit', async (_$, e) => { w.sent.push(e.text); return { text: e.text } })
  // The engine draws nothing of its own above the prompt.
  on('ui.render', async ($$, e) => { const { Box } = $$.ui.resolve(e); return <Box key="engine-band" /> })
  return w
}

// Cell positions of the pills, from the same layout the bar draws with.
import { resolveStyle } from '../hooks/config'
import { layout } from '../hooks/layout'
import type { QuickbarButton } from '../types'

const STYLE = resolveStyle(undefined)
function at(open: number, path: number[], id: string) {
  const l = layout(CONFIG.buttons as QuickbarButton[], STYLE, { open, path }, BAND.props.bodyColumns)
  const line = l.lines.find(x => x.pills.some(p => p.id === id))!
  const p = line.pills.find(x => x.id === id)!
  return { x: p.x, y: line.y } // the top-left cell: padding, not the label
}

test('navigation hover (terminal, desktop): whole-pill clicks, hover opens, click again folds, leave closes', async ($, on) => {
  const w = fakeEngine(on, { [USER_FILE]: JSON.stringify({ ...CONFIG, navigation: 'hover' }) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    w.box = { text: '', cursor: 0 }
    w.sent = []
    const ui = await $.ui.mount({ plugin: 'quickbar', surface, ...BAND })
    const move = (p: { x: number; y: number }) => ui.pointer({ type: 'move', x: p.x, y: p.y, in: 'bar' })
    const click = async (p: { x: number; y: number }) => {
      await ui.pointer({ type: 'down', x: p.x, y: p.y, button: 'left', in: 'bar' })
      await ui.pointer({ type: 'up', x: p.x, y: p.y, button: 'left', in: 'bar' })
    }

    expect(await ui.find({ type: 'Text', text: 'Review ▾', in: 'bar' })).toBeDefined()

    await click(at(-1, [], 'b0')) // the padding corner of "Explain"
    expect(w.box.text).toBe('Explain this')

    await click(at(-1, [], 'b1'))
    expect(w.sent).toEqual(['Explain thisShip it'])

    // Hover alone opens Review, then Style's level.
    await move(at(-1, [], 'b2'))
    expect(await ui.find({ type: 'Text', text: 'Style ›', in: 'bar' })).toBeDefined()
    await move(at(2, [], 'o0.1'))
    expect(await ui.find({ type: 'Text', text: 'Strict', in: 'bar' })).toBeDefined()

    // Clicking the open "Style" again folds its level.
    await click(at(2, [1], 'o0.1'))
    expect(await ui.find({ type: 'Text', text: 'Strict', in: 'bar' })).toBeUndefined()

    // Open it again and pick the final choice.
    await click(at(2, [], 'o0.1'))
    await click(at(2, [1], 'o1.0'))
    expect(w.box.text).toBe('Review for style Strict')
    expect(await ui.find({ type: 'Text', text: 'Style ›', in: 'bar' })).toBeUndefined()

    // Leaving the bar closes open menus after a moment.
    await move(at(-1, [], 'b2'))
    expect(await ui.find({ type: 'Text', text: 'Bugs', in: 'bar' })).toBeDefined()
    await ui.pointer({ type: 'leave', x: 0, y: 0, in: 'bar' })
    await ui.advance(700)
    expect(await ui.find({ type: 'Text', text: 'Bugs', in: 'bar' })).toBeUndefined()
    await ui.unmount()
  }
})

test('vscode ignores hover (no Client): the same bar as Buttons', async ($, on) => {
  const w = fakeEngine(on, { [USER_FILE]: JSON.stringify({ ...CONFIG, navigation: 'hover' }) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'vscode', ...BAND })
  await ui.press({ key: 'b0' })
  expect(w.box.text).toBe('Explain this')
  await ui.press({ key: 'b2' })
  await ui.press({ key: 'o0.1' })
  expect(await ui.find({ key: 'o1.0' })).toBeDefined()
  await ui.press({ key: 'o0.1' })
  expect(await ui.find({ key: 'o1.0' })).toBeUndefined()
  await ui.unmount()
})

test('without a config file it shows the bundled example (5 buttons, 3 selects)', async ($, on) => {
  fakeEngine(on, {})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  for (let i = 0; i < 5; i++) expect(await ui.find({ key: `b${i}` })).toBeDefined()
  expect(await ui.find({ key: 'b5' })).toBeUndefined()
  expect((await $.command.run({ command: 'quickbar', args: 'where' } as never)).text).toContain('default config')
  await ui.unmount()
})

test('a broken config shows one error button and /quickbar where lists the problems', async ($, on) => {
  fakeEngine(on, { [USER_FILE]: '{"buttons": [{"label": "x"}]}' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  expect((await ui.find({ key: 'error' }))?.text).toContain('1 config error')
  expect((await $.command.run({ command: 'quickbar', args: 'where' } as never)).text).toContain('needs "text"')
  await ui.unmount()
})

test('/quickbar init writes the example once and never overwrites', async ($, on) => {
  const w = fakeEngine(on, {})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ command: 'quickbar', args: 'init' } as never)).text).toContain(`wrote ${USER_FILE}`)
  expect(JSON.parse(w.files.get(USER_FILE)!).buttons.length).toBe(5)
  expect((await $.command.run({ command: 'quickbar', args: 'init' } as never)).text).toContain('already exists')
  expect((await $.command.run({ command: 'quickbar', args: 'init project' } as never)).text).toContain(`${ROOT}/.claude/quickbar.json`)
})

test('drawn before the config finished loading: no error button, and it loads by itself', async ($, on) => {
  fakeEngine(on, { [USER_FILE]: JSON.stringify(CONFIG) })
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'error' })).toBeUndefined()
  // The render started the load; the next draws show the bar once it lands.
  let bar
  for (let i = 0; i < 10 && !bar; i++) {
    await ui.redraw()
    bar = await ui.find({ key: 'b2' })
  }
  expect(bar).toBeDefined()
  await ui.unmount()
})

test('navigation click (the default): Buttons only, no pointer-tracking Client, padding rows click too', async ($, on) => {
  const w = fakeEngine(on, { [USER_FILE]: JSON.stringify(CONFIG) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    w.box = { text: '', cursor: 0 }
    const ui = await $.ui.mount({ plugin: 'quickbar', surface, ...BAND })
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    await ui.press({ key: 'b0' })
    expect(w.box.text).toBe('Explain this')
    await ui.press({ key: 'b2' })
    expect(await ui.find({ key: 'o0.1' })).toBeDefined()
    await ui.press({ key: 'o0.1' })
    await ui.press({ key: 'o1.0' })
    expect(w.box.text).toBe('Explain thisReview for style Strict')
    await ui.unmount()
  }
})

test('navigation peek: each closed select has its first level hidden above the bar, pressable, no Client', async ($, on) => {
  const two = { ...CONFIG, navigation: 'peek', buttons: [...CONFIG.buttons, { label: 'Git', options: [{ label: 'Status', text: 'git status' }] }] }
  const w = fakeEngine(on, { [USER_FILE]: JSON.stringify(two) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    w.box = { text: '', cursor: 0 }
    const ui = await $.ui.mount({ plugin: 'quickbar', surface, ...BAND })
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    // The peek row of "Review" (button 2) is drawn, hidden until hover: its options are already pressable.
    await ui.press({ key: 'p2-o0.0' }) // "Bugs", a final choice, straight from Review's peek row
    expect(w.box.text).toBe('Review for bugs')
    await ui.press({ key: 'p3-o0.0' }) // Git's peek row: same option position, its own key
    expect(w.box.text).toBe('Review for bugsgit status')
    // An option with children opens its level by click, as in click navigation.
    await ui.press({ key: 'p2-o0.1' })
    expect(await ui.find({ key: 'o1.0' })).toBeDefined()
    expect(await ui.find({ key: 'p2-o0.1' })).toBeUndefined() // open by click: no peek row for it
    await ui.press({ key: 'x' })
    await ui.unmount()
  }
})

test('terminal pill: one single-row Button, no hover colors of its own (Claude Code inverts it as a whole)', async ($, on) => {
  const w = fakeEngine(on, { [USER_FILE]: JSON.stringify(CONFIG) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  const b0 = await ui.find({ key: 'b0' })
  expect(b0?.text).toBe(' Explain   ') // drawn as "e: Explain   ": the hotkey takes two padding columns
  expect(JSON.stringify(b0)).not.toContain('hover')
  expect((await ui.find({ key: 'b1' }))?.text).toBe('   Ship ⏎   ') // sends right away
  await ui.press({ key: 'b0' })
  expect(w.box.text).toBe('Explain this')
  await ui.unmount()
})

test('peek: the options row sits above its own select', async ($, on) => {
  const two = { ...CONFIG, navigation: 'peek' }
  fakeEngine(on, { [USER_FILE]: JSON.stringify(two) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  // Review is the third button: Explain (13) + gap + Ship ⏎ (12) + gap = column 27
  expect(JSON.stringify(await ui.find({ key: 'peek-2' }))).toContain('"marginLeft":27')
  await ui.unmount()
})

test('shares the band: what other plugins draw there stays, above the bar', async ($, on) => {
  fakeEngine(on, { [USER_FILE]: JSON.stringify(CONFIG) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  expect(await ui.find({ key: 'b0' })).toBeDefined()
  expect(await ui.find({ key: 'engine-band', plugin: 'test' } as never)).toBeDefined()
  await ui.unmount()
})

test('/quickbar demo shows the bundled example in this session, demo off brings the config back', async ($, on) => {
  fakeEngine(on, { [USER_FILE]: JSON.stringify(CONFIG) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ command: 'quickbar', args: 'demo' } as never)).text).toContain('demo on')
  expect((await $.command.run({ command: 'quickbar', args: 'where' } as never)).text).toContain('default config')
  await $.command.run({ command: 'quickbar', args: 'demo off' } as never)
  expect((await $.command.run({ command: 'quickbar', args: 'where' } as never)).text).toContain(`user config: ${USER_FILE}`)
})
