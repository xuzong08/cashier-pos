import type { Language } from './types'
import { id } from './i18n/id'
import { zh } from './i18n/zh'

// English text is the key. Other languages map English -> translation; a missing entry falls back to English.
// tests/unit/i18n.test.ts checks every t('...') string in the source has an id and zh entry.
export const DICTS: Record<Exclude<Language, 'en'>, Record<string, string>> = { id, zh }

export const LANGUAGES: { id: Language; label: string; dateLocale: string }[] = [
  { id: 'en', label: 'English', dateLocale: 'en-US' },
  { id: 'id', label: 'Bahasa Indonesia', dateLocale: 'id-ID' },
  { id: 'zh', label: '简体中文', dateLocale: 'zh-CN' }
]

export type Vars = Record<string, string | number>

export function translate(lang: Language, key: string, vars?: Vars): string {
  const s = lang === 'en' ? key : (DICTS[lang]?.[key] ?? key)
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

export const dateLocaleOf = (lang: Language): string => LANGUAGES.find((l) => l.id === lang)?.dateLocale ?? 'en-US'

/** Marks a string for translation where it is stored as data and translated later with t(). */
export const tr = (s: string): string => s
