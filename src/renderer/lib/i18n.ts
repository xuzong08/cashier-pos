import { useMemo } from 'react'
import { dateLocaleOf, translate, type Vars } from '@shared/i18n'
import { useApp } from '@/store/app'

export type T = ((key: string, vars?: Vars) => string) & { dateLocale: string }

/** Translator for the station language. English text is the key: t('Cart is empty'). */
export function useT(): T {
  const lang = useApp((s) => s.settings.language)
  return useMemo(() => Object.assign((k: string, v?: Vars) => translate(lang, k, v), { dateLocale: dateLocaleOf(lang) }), [lang])
}

/** Same as useT() for code outside components (stores, toasts from helpers). */
export const tNow = (key: string, vars?: Vars): string => translate(useApp.getState().settings.language, key, vars)

/** Current date locale outside components. */
export const dateLocaleNow = (): string => dateLocaleOf(useApp.getState().settings.language)
