import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from '../uiStore'

describe('uiStore - Unsaved Prompt', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sets message on unsavedPrompt and resolves with chosen action', async () => {
    const store = useUiStore()
    expect(store.unsavedPrompt).toBeNull()

    const customMessage = 'Bạn có muốn lưu trước khi chuyển collection?'
    const promptPromise = store.requestUnsavedPrompt(customMessage)

    expect(store.unsavedPrompt).not.toBeNull()
    expect(store.unsavedPrompt?.message).toBe(customMessage)

    store.resolveUnsavedPrompt('save')

    const result = await promptPromise
    expect(result).toBe('save')
    expect(store.unsavedPrompt).toBeNull()
  })

  it('resolves with discard and clears unsavedPrompt', async () => {
    const store = useUiStore()

    const promptPromise = store.requestUnsavedPrompt('Discard test')
    expect(store.unsavedPrompt?.message).toBe('Discard test')

    store.resolveUnsavedPrompt('discard')

    const result = await promptPromise
    expect(result).toBe('discard')
    expect(store.unsavedPrompt).toBeNull()
  })

  it('resolves with cancel and clears unsavedPrompt', async () => {
    const store = useUiStore()

    const promptPromise = store.requestUnsavedPrompt('Cancel test')
    expect(store.unsavedPrompt?.message).toBe('Cancel test')

    store.resolveUnsavedPrompt('cancel')

    const result = await promptPromise
    expect(result).toBe('cancel')
    expect(store.unsavedPrompt).toBeNull()
  })

  it('cancels previous prompt when a new prompt is requested', async () => {
    const store = useUiStore()

    const firstPromise = store.requestUnsavedPrompt('First')
    const secondPromise = store.requestUnsavedPrompt('Second')

    const firstResult = await firstPromise
    expect(firstResult).toBe('cancel')
    expect(store.unsavedPrompt?.message).toBe('Second')

    store.resolveUnsavedPrompt('save')
    const secondResult = await secondPromise
    expect(secondResult).toBe('save')
  })

  it('works without message argument', async () => {
    const store = useUiStore()

    const promptPromise = store.requestUnsavedPrompt()
    expect(store.unsavedPrompt).not.toBeNull()
    expect(store.unsavedPrompt?.message).toBeUndefined()

    store.resolveUnsavedPrompt('save')
    const result = await promptPromise
    expect(result).toBe('save')
  })

  it('manages autoSaveEnabled state and persistence', () => {
    const store = useUiStore()
    expect(store.autoSaveEnabled).toBe(true)

    store.setAutoSaveEnabled(false)
    expect(store.autoSaveEnabled).toBe(false)

    store.setAutoSaveEnabled(true)
    expect(store.autoSaveEnabled).toBe(true)
  })
})

describe('uiStore - Resizable Layout Panes', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('initializes with default sidebarWidth (260) and requestPaneRatio (50) when localStorage is empty', () => {
    const store = useUiStore()
    expect(store.sidebarWidth).toBe(260)
    expect(store.requestPaneRatio).toBe(50)
  })

  it('restores valid sidebarWidth and requestPaneRatio from localStorage', () => {
    localStorage.setItem('hecto_sidebar_width', '340')
    localStorage.setItem('hecto_request_pane_ratio', '35')

    const store = useUiStore()
    expect(store.sidebarWidth).toBe(340)
    expect(store.requestPaneRatio).toBe(35)
  })

  it('clamps out-of-range numeric values in localStorage on initialization', () => {
    localStorage.setItem('hecto_sidebar_width', '90')
    localStorage.setItem('hecto_request_pane_ratio', '99')

    const store = useUiStore()
    expect(store.sidebarWidth).toBe(180)
    expect(store.requestPaneRatio).toBe(85)

    localStorage.setItem('hecto_sidebar_width', '700')
    localStorage.setItem('hecto_request_pane_ratio', '5')
    setActivePinia(createPinia())
    const store2 = useUiStore()
    expect(store2.sidebarWidth).toBe(520)
    expect(store2.requestPaneRatio).toBe(15)
  })

  it('falls back to defaults when localStorage contains corrupt or empty strings', () => {
    localStorage.setItem('hecto_sidebar_width', 'abc')
    localStorage.setItem('hecto_request_pane_ratio', '')

    const store = useUiStore()
    expect(store.sidebarWidth).toBe(260)
    expect(store.requestPaneRatio).toBe(50)

    localStorage.setItem('hecto_sidebar_width', '   ')
    localStorage.setItem('hecto_request_pane_ratio', 'NaN')
    setActivePinia(createPinia())
    const store2 = useUiStore()
    expect(store2.sidebarWidth).toBe(260)
    expect(store2.requestPaneRatio).toBe(50)
  })

  it('updates and clamps sidebarWidth respecting min (180), max (520), and 50% viewport', () => {
    const store = useUiStore()

    store.setSidebarWidth(340, 1200)
    expect(store.sidebarWidth).toBe(340)
    expect(localStorage.getItem('hecto_sidebar_width')).toBe('340')

    store.setSidebarWidth(100, 1200)
    expect(store.sidebarWidth).toBe(180)
    expect(localStorage.getItem('hecto_sidebar_width')).toBe('180')

    store.setSidebarWidth(800, 1200)
    expect(store.sidebarWidth).toBe(520)
    expect(localStorage.getItem('hecto_sidebar_width')).toBe('520')

    // Viewport 800px -> 50% is 400px (< 520px)
    store.setSidebarWidth(500, 800)
    expect(store.sidebarWidth).toBe(400)
    expect(localStorage.getItem('hecto_sidebar_width')).toBe('400')

    // Invalid viewport falls back to 520px max
    store.setSidebarWidth(600, 0)
    expect(store.sidebarWidth).toBe(520)

    // Non-finite input is ignored
    store.setSidebarWidth(Number.NaN, 1200)
    expect(store.sidebarWidth).toBe(520)
  })

  it('resets sidebarWidth back to 260 and persists to localStorage', () => {
    const store = useUiStore()
    store.setSidebarWidth(340, 1200)
    expect(store.sidebarWidth).toBe(340)

    store.resetSidebarWidth()
    expect(store.sidebarWidth).toBe(260)
    expect(localStorage.getItem('hecto_sidebar_width')).toBe('260')
  })

  it('updates and clamps requestPaneRatio respecting [15, 85] and 120px minimum pane height', () => {
    const store = useUiStore()

    store.setRequestPaneRatio(35, 600)
    expect(store.requestPaneRatio).toBe(35)
    expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('35')

    // In 600px container, 120px is 20%, so dragging to 5% (30px) clamps at 20%
    store.setRequestPaneRatio(5, 600)
    expect(store.requestPaneRatio).toBe(20)
    expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('20')

    // In 600px container, max is 80% (leaving 120px for bottom pane)
    store.setRequestPaneRatio(95, 600)
    expect(store.requestPaneRatio).toBe(80)
    expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('80')

    // In 1000px container, 120px is 12%, so [15%, 85%] bounds take precedence
    store.setRequestPaneRatio(10, 1000)
    expect(store.requestPaneRatio).toBe(15)
    store.setRequestPaneRatio(90, 1000)
    expect(store.requestPaneRatio).toBe(85)

    // When containerHeight < 240 (minRatio > maxRatio), falls back to 50
    store.setRequestPaneRatio(30, 200)
    expect(store.requestPaneRatio).toBe(50)

    // Non-finite input is ignored
    store.setRequestPaneRatio(Number.NaN, 600)
    expect(store.requestPaneRatio).toBe(50)
  })

  it('resets requestPaneRatio back to 50 and persists to localStorage', () => {
    const store = useUiStore()
    store.setRequestPaneRatio(35, 600)
    expect(store.requestPaneRatio).toBe(35)

    store.resetRequestPaneRatio()
    expect(store.requestPaneRatio).toBe(50)
    expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('50')
  })
})
