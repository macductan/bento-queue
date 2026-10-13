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
