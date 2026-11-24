import { describe, expect, it } from 'vitest'
import { DICTS, translate } from '@shared/i18n'
import { collectKeys } from './i18nKeys'

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const keys = [...collectKeys()]

describe('translations', () => {
  it('finds the UI strings', () => {
    expect(keys.length).toBeGreaterThan(300)
  })

  for (const [lang, dict] of Object.entries(DICTS)) {
    it(`${lang} has every UI string`, () => {
      expect(keys.filter((k) => !(k in dict))).toEqual([])
    })
    it(`${lang} keeps the same {placeholders}`, () => {
      const bad = Object.entries(dict).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join())
      expect(bad).toEqual([])
    })
  }

  it('fills variables and falls back to English', () => {
    expect(translate('id', 'Only {n} left', { n: 3 })).toBe('Sisa 3')
    expect(translate('zh', 'Cash')).toBe('现金')
    expect(translate('en', 'Hello {who}', { who: 'Sam' })).toBe('Hello Sam')
    expect(translate('id', 'Not a real key')).toBe('Not a real key')
  })
})
