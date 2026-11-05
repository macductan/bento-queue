import { ref, computed } from 'vue'
import en from './locales/en'
import vi from './locales/vi'

export type Locale = 'en' | 'vi'

export const DEFAULT_LOCALE: Locale = 'en'
export const SUPPORTED_LOCALES: Locale[] = ['en', 'vi']
export const LOCALE_STORAGE_KEY = 'hecto_locale'

const dictionaries: Record<Locale, Record<string, any>> = {
  en,
  vi
}

function readStoredLocale(): Locale {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
      if (stored === 'en' || stored === 'vi') {
        return stored
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_LOCALE
}

// Global reactive locale state
const currentLocale = ref<Locale>(readStoredLocale())

function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let curr = obj
  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') {
      return undefined
    }
    curr = curr[part]
  }
  return typeof curr === 'string' ? curr : undefined
}

function interpolate(template: string, params?: Record<string, string | number | undefined | null>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params && params[key] !== undefined && params[key] !== null ? String(params[key]) : match
  })
}

export function t(key: string, params?: Record<string, string | number | undefined | null>): string {
  const locale = currentLocale.value
  const dict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE]

  let val = getNestedValue(dict, key)

  // Fallback to default locale if missing in current locale
  if (val === undefined && locale !== DEFAULT_LOCALE) {
    val = getNestedValue(dictionaries[DEFAULT_LOCALE], key)
  }

  if (val === undefined) {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.warn(`[i18n] Missing translation key: "${key}" for locale: "${locale}"`)
    }
    return key
  }

  return interpolate(val, params)
}

export function setLocale(newLocale: Locale): void {
  if (!SUPPORTED_LOCALES.includes(newLocale)) return
  currentLocale.value = newLocale
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
    } catch {
      // ignore
    }
  }
}

export function getLocale(): Locale {
  return currentLocale.value
}

export function useI18n() {
  const locale = computed({
    get: () => currentLocale.value,
    set: (val: Locale) => setLocale(val)
  })

  return {
    t,
    locale,
    setLocale,
    supportedLocales: SUPPORTED_LOCALES
  }
}
