import { expect, test } from 'claude-code/testing'
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
  return w
}

test('draws the user config and writes, sends and walks a select', async ($, on) => {
  const w = fakeEngine(on, { [USER_FILE]: JSON.stringify(CONFIG) })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    w.box = { text: '', cursor: 0 }
    w.sent = []
    const ui = await $.ui.mount({ plugin: 'quickbar', surface, ...BAND })

    expect((await ui.find({ key: 'btn-2' }))?.text).toContain('Review ▾')
    await ui.press({ key: 'btn-0' })
    expect(w.box.text).toBe('Explain this')

    await ui.press({ key: 'btn-1' })
    expect(w.sent).toEqual(['Explain thisShip it'])
    expect(w.box.text).toBe('')

    await ui.press({ key: 'btn-2' })
    expect(await ui.find({ key: 'opt-0-1' })).toBeDefined()
    await ui.press({ key: 'opt-0-1' })
    expect((await ui.find({ key: 'opt-1-0' }))?.text).toContain('Strict')
    await ui.press({ key: 'opt-1-0' })
    expect(w.box.text).toBe('Review for style Strict')
    expect(await ui.find({ key: 'opt-0-0' })).toBeUndefined()
    await ui.unmount()
  }
})

test('without a config file it shows the bundled example (5 buttons, 3 selects)', async ($, on) => {
  fakeEngine(on, {})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'quickbar', surface: 'terminal', ...BAND })
  for (let i = 0; i < 5; i++) expect(await ui.find({ key: `btn-${i}` })).toBeDefined()
  expect(await ui.find({ key: 'btn-5' })).toBeUndefined()
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
