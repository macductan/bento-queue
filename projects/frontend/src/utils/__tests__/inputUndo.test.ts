import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  installGlobalInputUndo,
  recordInputSnapshot,
  undoInput,
  redoInput,
  isEditableTextControl
} from '../inputUndo'

describe('inputUndo utility', () => {
  let cleanup: (() => void) | null = null
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    cleanup = installGlobalInputUndo(window)
  })

  afterEach(() => {
    cleanup?.()
    cleanup = null
    container.remove()
  })

  it('identifies editable text inputs and textareas while excluding non-text or disabled/readonly controls', () => {
    const textInput = document.createElement('input')
    textInput.type = 'text'
    expect(isEditableTextControl(textInput)).toBe(true)

    const textarea = document.createElement('textarea')
    expect(isEditableTextControl(textarea)).toBe(true)

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    expect(isEditableTextControl(checkbox)).toBe(false)

    const readOnlyInput = document.createElement('input')
    readOnlyInput.readOnly = true
    expect(isEditableTextControl(readOnlyInput)).toBe(false)

    const disabledTextarea = document.createElement('textarea')
    disabledTextarea.disabled = true
    expect(isEditableTextControl(disabledTextarea)).toBe(false)
  })

  it('supports Ctrl+Z undo and Ctrl+Shift+Z / Ctrl+Y redo on input and textarea with input event emission', () => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = 'https://api.test/v1'
    container.appendChild(input)

    const emittedValues: string[] = []
    input.addEventListener('input', () => {
      emittedValues.push(input.value)
    })

    input.focus()
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    // Edit 1
    input.value = 'https://api.test/v2'
    input.setSelectionRange(19, 19)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Edit 2
    input.value = 'https://api.test/v3'
    input.setSelectionRange(19, 19)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Press Ctrl+Z -> back to v2
    const undoEvt1 = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    input.dispatchEvent(undoEvt1)
    expect(undoEvt1.defaultPrevented).toBe(true)
    expect(input.value).toBe('https://api.test/v2')

    // Press Ctrl+Z -> back to v1
    const undoEvt2 = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    input.dispatchEvent(undoEvt2)
    expect(input.value).toBe('https://api.test/v1')

    // Press Ctrl+Z at beginning of stack -> stays v1
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    )
    expect(input.value).toBe('https://api.test/v1')

    // Press Ctrl+Shift+Z -> redo to v2
    const redoEvt1 = new KeyboardEvent('keydown', {
      key: 'Z',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    input.dispatchEvent(redoEvt1)
    expect(redoEvt1.defaultPrevented).toBe(true)
    expect(input.value).toBe('https://api.test/v2')

    // Press Ctrl+Y -> redo to v3
    const redoEvt2 = new KeyboardEvent('keydown', {
      key: 'y',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    input.dispatchEvent(redoEvt2)
    expect(redoEvt2.defaultPrevented).toBe(true)
    expect(input.value).toBe('https://api.test/v3')

    expect(emittedValues).toContain('https://api.test/v1')
    expect(emittedValues).toContain('https://api.test/v2')
    expect(emittedValues).toContain('https://api.test/v3')
  })

  it('supports programmatic snapshot recording (e.g. Tab indentation in BodyEditor) and undoing it', () => {
    const textarea = document.createElement('textarea')
    textarea.value = '{\n}'
    container.appendChild(textarea)

    recordInputSnapshot(textarea)
    textarea.value = '{\n  }'
    textarea.setSelectionRange(4, 4)
    recordInputSnapshot(textarea)

    expect(undoInput(textarea)).toBe(true)
    expect(textarea.value).toBe('{\n}')

    expect(redoInput(textarea)).toBe(true)
    expect(textarea.value).toBe('{\n  }')
    expect(textarea.selectionStart).toBe(4)
  })

  it('ignores intermediate input events during IME composition and records final value on compositionend', () => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = ''
    container.appendChild(input)

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))

    input.value = 't'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.value = 'ti'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Ctrl+Z during composition does not undo
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    )
    expect(input.value).toBe('ti')

    input.value = 'tiếng'
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    // Now Ctrl+Z undoes the whole composed word back to ''
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    )
    expect(input.value).toBe('')
  })

  it('preserves cursor location and scroll position on undo without jumping to 0', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10'
    container.appendChild(textarea)

    textarea.focus()
    textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    // User clicks at character 45 (e.g. line 6)
    textarea.setSelectionRange(45, 45)
    textarea.scrollTop = 120
    textarea.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // User types something
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', bubbles: true }))
    textarea.value = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6X\nline 7\nline 8\nline 9\nline 10'
    textarea.setSelectionRange(46, 46)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    // Undo via Ctrl+Z
    const undoEvt = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    textarea.dispatchEvent(undoEvt)

    // Selection must be preserved near line 6 (at character 45), NOT 0!
    expect(textarea.selectionStart).toBe(45)
    expect(textarea.selectionEnd).toBe(45)
    expect(textarea.scrollTop).toBe(120)
  })
})
