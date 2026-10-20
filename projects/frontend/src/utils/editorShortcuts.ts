import { recordInputSnapshot } from './inputUndo'

export interface IndentResult {
  value: string
  cursor: number
}

export interface CommentResult {
  value: string
  selectionStart: number
  selectionEnd: number
}

/**
 * Computes auto-indent when Enter is pressed in an editor textarea.
 * Retains existing indentation and adds +2 spaces if previous line opened { [ or an XML tag.
 */
export function computeAutoIndent(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  language: 'json' | 'xml' | 'javascript' | 'text' = 'json'
): IndentResult {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const lineBeforeCursor = value.slice(lineStart, selectionStart)
  const lineAfterCursor = value.slice(selectionStart, selectionEnd === selectionStart ? value.length : selectionStart + 1)

  const indentMatch = lineBeforeCursor.match(/^[\t ]*/)
  const baseIndent = indentMatch ? indentMatch[0] : ''
  const trimmedBefore = lineBeforeCursor.trimEnd()

  let extraIndent = ''

  if (language === 'json' || language === 'javascript') {
    if (trimmedBefore.endsWith('{') || trimmedBefore.endsWith('[')) {
      extraIndent = '  '
    }
  } else if (language === 'xml') {
    // Check if ends with opening tag, e.g. <tag> or <tag attr="1"> (not </tag>, not <tag/>, not <!-- -->, not <?xml ?>)
    const xmlOpenTagRegex = /<([a-zA-Z0-9_:-]+)(?:\s+[^>]*)?>$/
    if (
      xmlOpenTagRegex.test(trimmedBefore) &&
      !trimmedBefore.endsWith('/>') &&
      !trimmedBefore.startsWith('</') &&
      !trimmedBefore.endsWith('-->') &&
      !trimmedBefore.endsWith('?>')
    ) {
      extraIndent = '  '
    }
  }

  // Bracket pair expansion: e.g. pressing Enter between { and } or [ and ]
  const nextChar = lineAfterCursor.charAt(0)
  const isClosingBracket =
    (trimmedBefore.endsWith('{') && nextChar === '}') ||
    (trimmedBefore.endsWith('[') && nextChar === ']') ||
    (language === 'xml' && extraIndent !== '' && nextChar === '<' && value.slice(selectionStart).startsWith('</'))

  if (isClosingBracket && extraIndent !== '') {
    const insertion = '\n' + baseIndent + extraIndent + '\n' + baseIndent
    const newValue = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd)
    const newCursor = selectionStart + 1 + baseIndent.length + extraIndent.length
    return { value: newValue, cursor: newCursor }
  }

  const insertion = '\n' + baseIndent + extraIndent
  const newValue = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd)
  const newCursor = selectionStart + insertion.length

  return { value: newValue, cursor: newCursor }
}

/**
 * Computes toggle line/block comment for selection or current line.
 * JSON / JS: // line comment
 * XML: <!-- --> block / line comment
 */
export function computeToggleComment(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  language: 'json' | 'xml' | 'javascript' | 'text' = 'json'
): CommentResult {
  if (language === 'xml') {
    return toggleXmlComment(value, selectionStart, selectionEnd)
  }
  return toggleLineComment(value, selectionStart, selectionEnd)
}

function toggleLineComment(
  value: string,
  selectionStart: number,
  selectionEnd: number
): CommentResult {
  const firstLineStart = value.lastIndexOf('\n', selectionStart - 1) + 1

  let effectiveSelEnd = selectionEnd
  if (effectiveSelEnd > selectionStart && value[effectiveSelEnd - 1] === '\n') {
    effectiveSelEnd -= 1
  }

  const nextNewline = value.indexOf('\n', effectiveSelEnd)
  const lastLineEnd = nextNewline === -1 ? value.length : nextNewline

  const block = value.slice(firstLineStart, lastLineEnd)
  const lines = block.split('\n')

  const nonBlankLines = lines.filter(l => l.trim().length > 0)
  const allCommented = nonBlankLines.length > 0 && nonBlankLines.every(l => l.trim().startsWith('//'))

  let newLines: string[]
  let firstLineDelta = 0
  let totalDelta = 0

  if (allCommented) {
    // Uncomment
    newLines = lines.map((line, idx) => {
      const uncommented = line.replace(/^(\s*)\/\/\s?/, '$1')
      const diff = uncommented.length - line.length
      if (idx === 0) firstLineDelta = diff
      totalDelta += diff
      return uncommented
    })
  } else {
    // Comment
    newLines = lines.map((line, idx) => {
      const commented = line.replace(/^(\s*)/, '$1// ')
      const diff = commented.length - line.length
      if (idx === 0) firstLineDelta = diff
      totalDelta += diff
      return commented
    })
  }

  const newBlock = newLines.join('\n')
  const newValue = value.slice(0, firstLineStart) + newBlock + value.slice(lastLineEnd)

  let newSelStart = selectionStart
  let newSelEnd = selectionEnd

  if (selectionStart === selectionEnd) {
    newSelStart = Math.max(firstLineStart, selectionStart + firstLineDelta)
    newSelEnd = newSelStart
  } else {
    newSelStart = Math.max(firstLineStart, selectionStart + (selectionStart > firstLineStart ? firstLineDelta : 0))
    newSelEnd = Math.max(newSelStart, selectionEnd + totalDelta)
  }

  return {
    value: newValue,
    selectionStart: newSelStart,
    selectionEnd: newSelEnd
  }
}

function toggleXmlComment(
  value: string,
  selectionStart: number,
  selectionEnd: number
): CommentResult {
  if (selectionStart < selectionEnd) {
    // Selection exists: toggle comment over selected text
    const selectedText = value.slice(selectionStart, selectionEnd)
    const trimmed = selectedText.trim()

    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
      // Uncomment selection
      const uncommented = selectedText
        .replace(/^(\s*)<!--\s?/, '$1')
        .replace(/\s?-->(\s*)$/, '$1')
      const newValue = value.slice(0, selectionStart) + uncommented + value.slice(selectionEnd)
      return {
        value: newValue,
        selectionStart,
        selectionEnd: selectionStart + uncommented.length
      }
    } else {
      // Comment selection
      const commented = `<!-- ${selectedText} -->`
      const newValue = value.slice(0, selectionStart) + commented + value.slice(selectionEnd)
      return {
        value: newValue,
        selectionStart,
        selectionEnd: selectionStart + commented.length
      }
    }
  }

  // No selection: toggle current line
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const nextNewline = value.indexOf('\n', selectionStart)
  const lineEnd = nextNewline === -1 ? value.length : nextNewline
  const line = value.slice(lineStart, lineEnd)
  const trimmed = line.trim()

  let newLine: string
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
    // Uncomment line
    newLine = line.replace(/^(\s*)<!--\s?/, '$1').replace(/\s?-->(\s*)$/, '$1')
  } else {
    // Comment line
    newLine = line.replace(/^(\s*)(.*)$/, '$1<!-- $2 -->')
  }

  const delta = newLine.length - line.length
  const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd)
  const newCursor = Math.max(lineStart, Math.min(lineStart + newLine.length, selectionStart + delta))

  return {
    value: newValue,
    selectionStart: newCursor,
    selectionEnd: newCursor
  }
}

/**
 * Applies auto-indent to a textarea element on Enter keydown.
 */
export function applyEditorEnter(
  el: HTMLTextAreaElement,
  language: 'json' | 'xml' | 'javascript' | 'text' = 'json'
): string | null {
  recordInputSnapshot(el)
  const res = computeAutoIndent(el.value, el.selectionStart, el.selectionEnd, language)
  el.value = res.value
  el.selectionStart = el.selectionEnd = res.cursor
  recordInputSnapshot(el)
  return res.value
}

/**
 * Applies comment toggle to a textarea element on Ctrl+/ or Cmd+/ keydown.
 */
export function applyEditorToggleComment(
  el: HTMLTextAreaElement,
  language: 'json' | 'xml' | 'javascript' | 'text' = 'json'
): string | null {
  recordInputSnapshot(el)
  const res = computeToggleComment(el.value, el.selectionStart, el.selectionEnd, language)
  el.value = res.value
  el.selectionStart = res.selectionStart
  el.selectionEnd = res.selectionEnd
  recordInputSnapshot(el)
  return res.value
}
