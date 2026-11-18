import { describe, it, expect, beforeEach } from 'vitest'
import { useI18n, t, setLocale, DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '../index'
import en from '../locales/en'

describe('i18n composable and dictionaries', () => {
  beforeEach(() => {
    localStorage.clear()
    setLocale('en')
  })

  it('has default locale as "en"', () => {
    const { locale } = useI18n()
    expect(locale.value).toBe(DEFAULT_LOCALE)
    expect(locale.value).toBe('en')
  })

  it('translates common keys correctly in English', () => {
    expect(t('common.save')).toBe('Save')
    expect(t('common.cancel')).toBe('Cancel')
    expect(t('common.delete')).toBe('Delete')
    expect(t('common.rename')).toBe('Rename')
  })

  it('translates keys reactively when switching to Vietnamese', () => {
    const { locale, setLocale } = useI18n()
    expect(t('common.save')).toBe('Save')

    setLocale('vi')
    expect(locale.value).toBe('vi')
    expect(t('common.save')).toBe('Lưu')
    expect(t('common.cancel')).toBe('Hủy')
    expect(t('common.delete')).toBe('Xóa')
    expect(t('common.rename')).toBe('Đổi tên')
  })

  it('supports interpolation with params', () => {
    setLocale('en')
    expect(t('header.gitConflict', { count: 5 })).toBe('Git Conflict (5)')

    setLocale('vi')
    expect(t('header.gitConflict', { count: 5 })).toBe('Xung đột Git (5)')
  })

  it('safely falls back to raw key if key does not exist', () => {
    expect(t('completely.nonexistent.key')).toBe('completely.nonexistent.key')
  })

  it('persists locale choice to localStorage', () => {
    setLocale('vi')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('vi')

    setLocale('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('ignores unsupported locales gracefully', () => {
    setLocale('fr' as any)
    expect(useI18n().locale.value).toBe('en')
  })

  it('falls back to English when a translation key is missing in Vietnamese dictionary', () => {
    ;(en as any).missingInViKey = 'English Fallback Value'
    setLocale('vi')
    expect(t('missingInViKey')).toBe('English Fallback Value')
  })
})
