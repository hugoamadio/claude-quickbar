import { describe, expect, test } from 'claude-code/testing'

import { parse, resolveStyle, validate } from '../hooks/config'

const ok = { buttons: [{ label: 'Hi', text: 'hello' }] }

describe('validate', () => {
  test('accepts a minimal config', async () => {
    expect(validate(ok).errors).toEqual([])
  })

  test('a button needs text or options', async () => {
    expect(validate({ buttons: [{ label: 'X' }] }).errors).toEqual(['buttons[0]: needs "text" (a button) or "options" (a select)'])
  })

  test('reports where each problem is', async () => {
    const { config, errors } = validate({
      style: { size: 'xl', paddingY: 9 },
      buttons: [
        { label: '', text: 'a', mode: 'shout', hotkey: 'A' },
        { label: 'S', options: [{ label: 'o', options: [] }] },
        { label: 'D', text: 'b', hotkey: 'g' },
        { label: 'E', text: 'c', hotkey: 'g', send: 'yes' },
      ],
    })
    expect(config).toBeNull()
    expect(errors).toEqual([
      'style.size: one of sm, md, lg',
      'style.paddingY: a whole number from 0 to 3',
      'buttons[0].label: required text',
      'buttons[0].mode: one of insert, append, replace',
      'buttons[0].hotkey: one lowercase letter or digit',
      'buttons[1].options[0].options: must be a non-empty list',
      'buttons[3].send: true or false',
      'buttons[3].hotkey: "g" is already used',
    ])
  })

  test('limits nesting depth', async () => {
    let opts: unknown = [{ label: 'leaf' }]
    for (let i = 0; i < 7; i++) opts = [{ label: `l${i}`, options: opts }]
    expect(validate({ buttons: [{ label: 'deep', options: opts }] }).errors.join()).toContain('nested deeper than 6 levels')
  })

  test('bad JSON says so', async () => {
    expect(parse('{ nope').errors[0]).toContain('not valid JSON')
  })
})

describe('resolveStyle', () => {
  test('lg is the default and is tall', async () => {
    expect(resolveStyle(undefined)).toEqual({
      paddingX: 3, paddingY: 1, gap: 1, color: '#3b4252', activeColor: '#2e7d4f', hoverColor: '#5e6a82',
    })
  })

  test('size presets and explicit padding', async () => {
    expect(resolveStyle({ size: 'sm' }).paddingY).toBe(0)
    expect(resolveStyle({ size: 'sm', paddingY: 2 }).paddingY).toBe(2)
  })
})
