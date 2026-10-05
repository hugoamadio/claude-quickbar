import { describe, expect, test } from 'claude-code/testing'

import { applyMode, chosen, composeText, deliveryOf, levels } from '../hooks/compose'
import type { QuickbarButton } from '../types'

const review: QuickbarButton = {
  label: 'Review',
  text: 'Review the changes',
  options: [
    { label: 'Bugs', text: 'for bugs' },
    { label: 'Style', text: 'for style', options: [{ label: 'Strict' }, { label: 'Gentle', text: 'gently', send: true, mode: 'replace' }] },
  ],
}

describe('levels and paths', () => {
  test('a chosen option with options opens the next level', async () => {
    expect(levels(review, []).length).toBe(1)
    expect(levels(review, [1]).map(l => l.map(o => o.label))).toEqual([['Bugs', 'Style'], ['Strict', 'Gentle']])
    expect(levels(review, [0]).length).toBe(1)
  })

  test('chosen stops at an index that does not exist', async () => {
    expect(chosen(review, [1, 0]).map(o => o.label)).toEqual(['Style', 'Strict'])
    expect(chosen(review, [5]).length).toBe(0)
  })
})

describe('composeText and deliveryOf', () => {
  test('prefix + each text; a final choice without text adds its label', async () => {
    expect(composeText(review, chosen(review, [1, 0]))).toBe('Review the changes for style Strict')
  })

  test('the last choice overrides mode and send', async () => {
    expect(deliveryOf(review, chosen(review, [1, 1]))).toEqual({ text: 'Review the changes for style gently', mode: 'replace', send: true })
    expect(deliveryOf(review, chosen(review, [0]))).toEqual({ text: 'Review the changes for bugs', mode: 'insert', send: false })
  })

  test('custom separator', async () => {
    expect(composeText({ ...review, separator: ' / ' }, chosen(review, [0]))).toBe('Review the changes / for bugs')
  })
})

describe('applyMode', () => {
  const box = { text: 'fix this', cursor: 3 }
  test('insert at the cursor, append with a space, replace', async () => {
    expect(applyMode(box, 'X', 'insert')).toBe('fixX this')
    expect(applyMode(box, 'please', 'append')).toBe('fix this please')
    expect(applyMode({ text: '', cursor: 0 }, 'please', 'append')).toBe('please')
    expect(applyMode(box, 'new', 'replace')).toBe('new')
  })
})
