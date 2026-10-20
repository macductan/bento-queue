export interface InputSnapshot {
  value: string
  selectionStart: number
  selectionEnd: number
  scrollTop?: number
  scrollLeft?: number
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

function getSelection(el: HTMLInputElement | HTMLTextAreaElement): {
  start: number
  end: number
  scrollTop?: number
  scrollLeft?: number
} {
  let start = 0
  let end = 0
  try {
    const len = (el.value || '').length
    start = typeof el.selectionStart === 'number' ? el.selectionStart : len
    end = typeof el.selectionEnd === 'number' ? el.selectionEnd : len
  } catch {
    const len = (el.value || '').length
    start = len
    end = len
  }
  const scrollTop = 'scrollTop' in el ? el.scrollTop : undefined
  const scrollLeft = 'scrollLeft' in el ? el.scrollLeft : undefined
  return { start, end, scrollTop, scrollLeft }
}

function restoreSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number
): void {
  try {
    if (typeof el.setSelectionRange === 'function') {
      const len = (el.value || '').length
      const clampedStart = Math.max(0, Math.min(len, start))
      const clampedEnd = Math.max(clampedStart, Math.min(len, end))
      el.setSelectionRange(clampedStart, clampedEnd)
    }
  } catch {
    // Ignore for input types that do not support selection ranges
  }
}

function findFirstDiff(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length)
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return i
  }
  return a.length !== b.length ? minLen : -1
}

function getOrCreateHistory(el: HTMLInputElement | HTMLTextAreaElement): UndoHistory {
  let hist = historyMap.get(el)
  if (!hist) {
    const { start, end, scrollTop, scrollLeft } = getSelection(el)
    hist = {
      stack: [
        {
          value: el.value || '',
          selectionStart: start,
          selectionEnd: end,
          scrollTop,
          scrollLeft
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
  const { start, end, scrollTop, scrollLeft } = getSelection(el)
  const currentEntry = hist.stack[hist.index]

  if (currentEntry && currentEntry.value === currentVal) {
    currentEntry.selectionStart = start
    currentEntry.selectionEnd = end
    currentEntry.scrollTop = scrollTop
    currentEntry.scrollLeft = scrollLeft
    return
  }

  // Truncate redo branch
  if (hist.index < hist.stack.length - 1) {
    hist.stack.splice(hist.index + 1)
  }

  hist.stack.push({
    value: currentVal,
    selectionStart: start,
    selectionEnd: end,
    scrollTop,
    scrollLeft
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

  const prevEntry = hist.stack[hist.index]
  hist.index -= 1
  const targetEntry = hist.stack[hist.index]
  if (!targetEntry) return false

  let restoreStart = targetEntry.selectionStart
  let restoreEnd = targetEntry.selectionEnd

  if (prevEntry) {
    const diffPos = findFirstDiff(prevEntry.value, targetEntry.value)
    if (diffPos >= 0) {
      if (restoreStart === 0 && diffPos > 0) {
        restoreStart = diffPos
        restoreEnd = diffPos
      }
    }
  }

  const savedScrollTop = targetEntry.scrollTop ?? ('scrollTop' in el ? el.scrollTop : undefined)
  const savedScrollLeft = targetEntry.scrollLeft ?? ('scrollLeft' in el ? el.scrollLeft : undefined)

  hist.isApplying = true
  try {
    el.value = targetEntry.value
    restoreSelection(el, restoreStart, restoreEnd)
    if (savedScrollTop !== undefined && 'scrollTop' in el) {
      el.scrollTop = savedScrollTop
      el.scrollLeft = savedScrollLeft || 0
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } finally {
    hist.isApplying = false
  }

  const scheduleRestore = () => {
    try {
      restoreSelection(el, restoreStart, restoreEnd)
      if (savedScrollTop !== undefined && 'scrollTop' in el) {
        el.scrollTop = savedScrollTop
        el.scrollLeft = savedScrollLeft || 0
      }
    } catch {}
  }
  scheduleRestore()
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(scheduleRestore)
  } else {
    setTimeout(scheduleRestore, 0)
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

  const restoreStart = targetEntry.selectionStart
  const restoreEnd = targetEntry.selectionEnd
  const savedScrollTop = targetEntry.scrollTop ?? ('scrollTop' in el ? el.scrollTop : undefined)
  const savedScrollLeft = targetEntry.scrollLeft ?? ('scrollLeft' in el ? el.scrollLeft : undefined)

  hist.isApplying = true
  try {
    el.value = targetEntry.value
    restoreSelection(el, restoreStart, restoreEnd)
    if (savedScrollTop !== undefined && 'scrollTop' in el) {
      el.scrollTop = savedScrollTop
      el.scrollLeft = savedScrollLeft || 0
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } finally {
    hist.isApplying = false
  }

  const scheduleRestore = () => {
    try {
      restoreSelection(el, restoreStart, restoreEnd)
      if (savedScrollTop !== undefined && 'scrollTop' in el) {
        el.scrollTop = savedScrollTop
        el.scrollLeft = savedScrollLeft || 0
      }
    } catch {}
  }
  scheduleRestore()
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(scheduleRestore)
  } else {
    setTimeout(scheduleRestore, 0)
  }

  return true
}

export function installGlobalInputUndo(target: Window | Document | HTMLElement = window): () => void {
  const updateCursorOnCurrentSnapshot = (el: EventTarget | null) => {
    if (isEditableTextControl(el)) {
      const hist = historyMap.get(el)
      if (hist && !hist.isApplying && !hist.isComposing) {
        const currentEntry = hist.stack[hist.index]
        if (currentEntry && currentEntry.value === (el.value || '')) {
          const { start, end, scrollTop, scrollLeft } = getSelection(el)
          currentEntry.selectionStart = start
          currentEntry.selectionEnd = end
          currentEntry.scrollTop = scrollTop
          currentEntry.scrollLeft = scrollLeft
        }
      }
    }
  }

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
        return
      } else if ((key === 'z' && ke.shiftKey) || (key === 'y' && !ke.shiftKey)) {
        ke.preventDefault()
        ke.stopPropagation()
        redoInput(ke.target)
        return
      }
    }

    updateCursorOnCurrentSnapshot(ke.target)
  }

  const onPointerOrKeyMove = (e: Event) => {
    updateCursorOnCurrentSnapshot(e.target)
  }

  target.addEventListener('focusin', onFocusIn, true)
  target.addEventListener('compositionstart', onCompositionStart, true)
  target.addEventListener('compositionend', onCompositionEnd, true)
  target.addEventListener('input', onInput, true)
  target.addEventListener('keydown', onKeyDown, true)
  target.addEventListener('keyup', onPointerOrKeyMove, true)
  target.addEventListener('pointerup', onPointerOrKeyMove, true)
  target.addEventListener('click', onPointerOrKeyMove, true)
  target.addEventListener('select', onPointerOrKeyMove, true)

  return () => {
    target.removeEventListener('focusin', onFocusIn, true)
    target.removeEventListener('compositionstart', onCompositionStart, true)
    target.removeEventListener('compositionend', onCompositionEnd, true)
    target.removeEventListener('input', onInput, true)
    target.removeEventListener('keydown', onKeyDown, true)
    target.removeEventListener('keyup', onPointerOrKeyMove, true)
    target.removeEventListener('pointerup', onPointerOrKeyMove, true)
    target.removeEventListener('click', onPointerOrKeyMove, true)
    target.removeEventListener('select', onPointerOrKeyMove, true)
  }
}
