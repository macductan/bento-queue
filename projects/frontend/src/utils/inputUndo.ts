export interface InputSnapshot {
  value: string
  selectionStart: number
  selectionEnd: number
}

interface UndoHistory {
  stack: InputSnapshot[]
  index: number
  isApplying: boolean
  isComposing: boolean
}

const MAX_HISTORY_SIZE = 200
const historyMap = new WeakMap<HTMLInputElement | HTMLTextAreaElement, UndoHistory>()

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'image',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week'
])

export function isEditableTextControl(
  el: EventTarget | null | undefined
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || typeof el !== 'object') return false
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled
  }
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false
    const type = (el.type || 'text').toLowerCase()
    return !NON_TEXT_INPUT_TYPES.has(type)
  }
  return false
}

function getSelection(el: HTMLInputElement | HTMLTextAreaElement): { start: number; end: number } {
  try {
    const len = (el.value || '').length
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : len
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : len
    return { start, end }
  } catch {
    const len = (el.value || '').length
    return { start: len, end: len }
  }
}

function restoreSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number
): void {
  try {
    if (typeof el.setSelectionRange === 'function') {
      const len = el.value.length
      const clampedStart = Math.max(0, Math.min(len, start))
      const clampedEnd = Math.max(clampedStart, Math.min(len, end))
      el.setSelectionRange(clampedStart, clampedEnd)
    }
  } catch {
    // Ignore for input types that do not support selection ranges
  }
}

function getOrCreateHistory(el: HTMLInputElement | HTMLTextAreaElement): UndoHistory {
  let hist = historyMap.get(el)
  if (!hist) {
    const { start, end } = getSelection(el)
    hist = {
      stack: [
        {
          value: el.value || '',
          selectionStart: start,
          selectionEnd: end
        }
      ],
      index: 0,
      isApplying: false,
      isComposing: false
    }
    historyMap.set(el, hist)
  }
  return hist
}

export function recordInputSnapshot(el: HTMLInputElement | HTMLTextAreaElement | null | undefined): void {
  if (!isEditableTextControl(el)) return
  const hist = getOrCreateHistory(el)
  if (hist.isApplying) return

  const currentVal = el.value || ''
  const { start, end } = getSelection(el)
  const currentEntry = hist.stack[hist.index]

  if (currentEntry && currentEntry.value === currentVal) {
    currentEntry.selectionStart = start
    currentEntry.selectionEnd = end
    return
  }

  // Truncate redo branch
  if (hist.index < hist.stack.length - 1) {
    hist.stack.splice(hist.index + 1)
  }

  hist.stack.push({
    value: currentVal,
    selectionStart: start,
    selectionEnd: end
  })

  if (hist.stack.length > MAX_HISTORY_SIZE) {
    hist.stack.shift()
  } else {
    hist.index = hist.stack.length - 1
  }
}

export function undoInput(el: HTMLInputElement | HTMLTextAreaElement | null | undefined): boolean {
  if (!isEditableTextControl(el)) return false
  const hist = getOrCreateHistory(el)
  if (hist.isComposing) return false

  // Sync current unrecorded DOM value first if needed
  const currentEntry = hist.stack[hist.index]
  if (!currentEntry || currentEntry.value !== (el.value || '')) {
    recordInputSnapshot(el)
  }

  if (hist.index <= 0) return false

  hist.index -= 1
  const targetEntry = hist.stack[hist.index]
  if (!targetEntry) return false

  hist.isApplying = true
  try {
    el.value = targetEntry.value
    restoreSelection(el, targetEntry.selectionStart, targetEntry.selectionEnd)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } finally {
    hist.isApplying = false
  }
  return true
}

export function redoInput(el: HTMLInputElement | HTMLTextAreaElement | null | undefined): boolean {
  if (!isEditableTextControl(el)) return false
  const hist = getOrCreateHistory(el)
  if (hist.isComposing) return false

  if (hist.index >= hist.stack.length - 1) return false

  hist.index += 1
  const targetEntry = hist.stack[hist.index]
  if (!targetEntry) return false

  hist.isApplying = true
  try {
    el.value = targetEntry.value
    restoreSelection(el, targetEntry.selectionStart, targetEntry.selectionEnd)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } finally {
    hist.isApplying = false
  }
  return true
}

export function installGlobalInputUndo(target: Window | Document | HTMLElement = window): () => void {
  const onFocusIn = (e: Event) => {
    if (isEditableTextControl(e.target)) {
      recordInputSnapshot(e.target)
    }
  }

  const onCompositionStart = (e: Event) => {
    if (isEditableTextControl(e.target)) {
      const hist = getOrCreateHistory(e.target)
      hist.isComposing = true
    }
  }

  const onCompositionEnd = (e: Event) => {
    if (isEditableTextControl(e.target)) {
      const hist = getOrCreateHistory(e.target)
      hist.isComposing = false
      recordInputSnapshot(e.target)
    }
  }

  const onInput = (e: Event) => {
    if (!isEditableTextControl(e.target)) return
    const hist = getOrCreateHistory(e.target)
    const ie = e as InputEvent
    if (hist.isApplying || hist.isComposing || ie?.isComposing) return
    recordInputSnapshot(e.target)
  }

  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent
    if (!isEditableTextControl(ke.target)) return
    const hist = getOrCreateHistory(ke.target)
    if (hist.isComposing || ke.isComposing) return

    if ((ke.ctrlKey || ke.metaKey) && !ke.altKey) {
      const key = (ke.key || '').toLowerCase()
      if (key === 'z' && !ke.shiftKey) {
        ke.preventDefault()
        ke.stopPropagation()
        undoInput(ke.target)
      } else if ((key === 'z' && ke.shiftKey) || (key === 'y' && !ke.shiftKey)) {
        ke.preventDefault()
        ke.stopPropagation()
        redoInput(ke.target)
      }
    }
  }

  target.addEventListener('focusin', onFocusIn, true)
  target.addEventListener('compositionstart', onCompositionStart, true)
  target.addEventListener('compositionend', onCompositionEnd, true)
  target.addEventListener('input', onInput, true)
  target.addEventListener('keydown', onKeyDown, true)

  return () => {
    target.removeEventListener('focusin', onFocusIn, true)
    target.removeEventListener('compositionstart', onCompositionStart, true)
    target.removeEventListener('compositionend', onCompositionEnd, true)
    target.removeEventListener('input', onInput, true)
    target.removeEventListener('keydown', onKeyDown, true)
  }
}
