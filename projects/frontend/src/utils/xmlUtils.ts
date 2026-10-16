/**
 * XML parsing, validation, formatting, and syntax highlighting utilities.
 * Supports standard XML, SOAP/XML, and documents containing {{variable}} placeholders.
 */

export interface XmlValidationResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
}

export interface XmlSyntaxToken {
  type: 'tag-name' | 'attr-name' | 'attr-value' | 'punctuation' | 'comment' | 'cdata' | 'plain'
  value: string
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Checks whether response headers indicate an XML content-type.
 */
export function isXmlContentType(headers?: Record<string, string[]> | null): boolean {
  if (!headers) return false
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      for (const val of values) {
        const lower = val.toLowerCase()
        if (lower.includes('xml') || lower.includes('/xml') || lower.includes('+xml')) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Fast check whether a string is valid XML.
 */
export function tryParseXml(body: string): boolean {
  if (!body || !body.trim()) return false
  const trimmed = body.trim()
  if (!trimmed.startsWith('<')) return false

  if (typeof DOMParser === 'undefined') {
    return true
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(trimmed, 'application/xml')
    const parserError = doc.querySelector('parsererror')
    return !parserError
  } catch {
    return false
  }
}

/**
 * Validates XML content while gracefully tolerating {{variable}} template placeholders.
 */
export function validateXmlWithPlaceholders(body: string): XmlValidationResult {
  if (!body || !body.trim()) {
    return { valid: true }
  }

  const trimmed = body.trim()
  if (!trimmed.startsWith('<')) {
    return {
      valid: false,
      error: 'XML phải bắt đầu bằng thẻ mở hoặc khai báo XML (ký tự <)'
    }
  }

  if (typeof DOMParser === 'undefined') {
    return { valid: true }
  }

  // Map distinct variable placeholders to consistent identifiers so tag pairs validate properly
  const varMap = new Map<string, string>()
  const reverseMap = new Map<string, string>()
  let varCounter = 0
  const sanitized = body.replace(/\{\{[^}]+\}\}/g, (match) => {
    if (!varMap.has(match)) {
      const id = `_hecto_var_${varCounter++}_`
      varMap.set(match, id)
      reverseMap.set(id, match)
    }
    return varMap.get(match)!
  })

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(sanitized, 'application/xml')
    const parserError = doc.querySelector('parsererror')
    if (parserError) {
      const errText = parserError.textContent || 'XML lỗi cú pháp'
      const lineMatch = errText.match(/line\s+(\d+)/i)
      const colMatch = errText.match(/column\s+(\d+)/i)
      const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined
      const column = colMatch ? parseInt(colMatch[1], 10) : undefined

      // Extract human-friendly error snippet
      let message = errText
      const detailMatch = errText.match(/error on line \d+ at column \d+:\s*(.+)/i)
      if (detailMatch) {
        message = detailMatch[1].trim()
      } else {
        const firstLine = errText.split('\n')[0].replace(/^This page contains the following errors:\s*/, '').trim()
        if (firstLine) message = firstLine
      }

      // Restore original variable placeholders in error message
      for (const [id, originalVar] of reverseMap.entries()) {
        message = message.replaceAll(id, originalVar)
      }

      return {
        valid: false,
        error: message,
        line,
        column
      }
    }
    return { valid: true }
  } catch (err: any) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * Formats XML into indented, human-readable text while preserving comments, CDATA,
 * XML declarations, self-closing tags, and variable placeholders.
 */
export function formatXmlText(xml: string, indent = '  '): string {
  if (!xml || !xml.trim()) return xml || ''

  const tokenRegex = /(<!--[\s\S]*?-->)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<!DOCTYPE[\s\S]*?>)|(<\?[\s\S]*?\?>)|(<(?:"[^"]*"|'[^']*'|[^'">])+>)|([^<]+)/g
  const tokens: string[] = []
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(xml)) !== null) {
    tokens.push(match[0])
  }

  let formatted = ''
  let depth = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const trimmed = token.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('<?') || trimmed.startsWith('<!DOCTYPE')) {
      formatted += (depth > 0 ? indent.repeat(depth) : '') + trimmed + '\n'
    } else if (trimmed.startsWith('<!--') || trimmed.startsWith('<![CDATA[')) {
      formatted += indent.repeat(depth) + trimmed + '\n'
    } else if (trimmed.startsWith('</')) {
      depth = Math.max(0, depth - 1)
      formatted += indent.repeat(depth) + trimmed + '\n'
    } else if (trimmed.endsWith('/>')) {
      formatted += indent.repeat(depth) + trimmed + '\n'
    } else if (trimmed.startsWith('<')) {
      const tagNameMatch = trimmed.match(/^<([-_a-zA-Z0-9:.]+)/)
      const tagName = tagNameMatch ? tagNameMatch[1] : null

      let isSingleLineTextChild = false
      if (tagName && i + 2 < tokens.length) {
        const next1 = tokens[i + 1].trim()
        const next2 = tokens[i + 2].trim()
        if (!next1.startsWith('<') && !next1.includes('\n') && next2 === `</${tagName}>`) {
          isSingleLineTextChild = true
          formatted += indent.repeat(depth) + trimmed + next1 + next2 + '\n'
          i += 2
        }
      }

      if (!isSingleLineTextChild) {
        formatted += indent.repeat(depth) + trimmed + '\n'
        depth++
      }
    } else {
      formatted += indent.repeat(depth) + trimmed + '\n'
    }
  }

  return formatted.trimEnd()
}

function highlightXmlTag(tagStr: string): string {
  if (tagStr.startsWith('<!--')) {
    return `<span class="text-text-muted italic">${escapeHtml(tagStr)}</span>`
  }
  if (tagStr.startsWith('<![CDATA[')) {
    return `<span class="text-purple-300">${escapeHtml(tagStr)}</span>`
  }
  if (tagStr.startsWith('<?') || tagStr.startsWith('<!DOCTYPE')) {
    return `<span class="text-text-secondary">${escapeHtml(tagStr)}</span>`
  }
  if (tagStr.startsWith('</')) {
    const m = tagStr.match(/^<\/\s*([^\s>]+)\s*>$/)
    if (m) {
      return `<span class="text-text-secondary">&lt;/</span><span class="text-sky-300">${escapeHtml(m[1])}</span><span class="text-text-secondary">&gt;</span>`
    }
  }

  const isSelfClosing = tagStr.endsWith('/>')
  const inner = isSelfClosing ? tagStr.slice(1, -2) : tagStr.slice(1, -1)
  const tagMatch = inner.match(/^([^\s/>]+)([\s\S]*)$/)
  if (!tagMatch) {
    return `<span class="text-text-secondary">${escapeHtml(tagStr)}</span>`
  }

  const tagName = tagMatch[1]
  const attrsPart = tagMatch[2]

  let res = `<span class="text-text-secondary">&lt;</span><span class="text-sky-300">${escapeHtml(tagName)}</span>`

  if (attrsPart) {
    const attrRegex = /(\s+)([-_a-zA-Z0-9:.]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrRegex.exec(attrsPart)) !== null) {
      res += attrMatch[1]
      res += `<span class="text-amber-300">${escapeHtml(attrMatch[2])}</span>`
      if (attrMatch[3]) {
        res += `<span class="text-text-secondary">${escapeHtml(attrMatch[3])}</span>`
      }
      if (attrMatch[4]) {
        res += `<span class="text-emerald-300">${escapeHtml(attrMatch[4])}</span>`
      }
    }
  }

  res += isSelfClosing
    ? `<span class="text-text-secondary">/&gt;</span>`
    : `<span class="text-text-secondary">&gt;</span>`
  return res
}

function highlightXmlLine(line: string): string {
  const indentMatch = line.match(/^(\s*)/)
  const indent = indentMatch ? indentMatch[1] : ''
  const content = line.slice(indent.length)
  if (!content) return indent

  const tagRegex = /(<!--[\s\S]*?-->)|(<!--[\s\S]*)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<!\[CDATA\[[\s\S]*)|(<\?[^>]*\?>)|(<!DOCTYPE[^>]*>)|(<(?:"[^"]*"|'[^']*'|[^'">])+>)|(<(?:"[^"]*"|'[^']*'|[^'">])*)|([^<]+)/g
  let res = indent
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(content)) !== null) {
    const part = match[0]
    if (part.startsWith('<!--')) {
      res += `<span class="text-text-muted italic">${escapeHtml(part)}</span>`
    } else if (part.startsWith('<![CDATA[')) {
      res += `<span class="text-purple-300">${escapeHtml(part)}</span>`
    } else if (part.startsWith('<')) {
      res += highlightXmlTag(part)
    } else {
      res += `<span class="text-text-primary">${escapeHtml(part)}</span>`
    }
  }
  return res
}

/**
 * Formats XML and returns syntax-colored HTML along with exact line count.
 */
export function formatXmlHtml(rawXml: string): { html: string; lines: number } {
  const formattedText = formatXmlText(rawXml)
  const lines = formattedText.split('\n')
  const html = lines.map(highlightXmlLine).join('\n')
  return {
    html,
    lines: lines.length
  }
}

/**
 * Tokenizes a single text segment for VariableHighlighter when syntax === 'xml'.
 */
export function tokenizeXmlTextSegment(text: string, startInsideTag = false): XmlSyntaxToken[] & { endsInsideTag?: boolean } {
  const tokens: XmlSyntaxToken[] = []
  let endsInsideTag = false
  if (!text) {
    const res = tokens as XmlSyntaxToken[] & { endsInsideTag?: boolean }
    res.endsInsideTag = false
    return res
  }

  const parseAttrs = (attrsPart: string) => {
    if (!attrsPart) return
    let remaining = attrsPart
    if (remaining.startsWith('"') || remaining.startsWith("'")) {
      tokens.push({ type: 'plain', value: remaining[0] })
      remaining = remaining.slice(1)
    }
    const attrRegex = /(\s+)|([-_a-zA-Z0-9:.]+)|(\s*=\s*)|("[^"]*"?|'[^']*'?)|([^\s>]+)|(.)/g
    let aMatch: RegExpExecArray | null
    while ((aMatch = attrRegex.exec(remaining)) !== null) {
      if (aMatch[1]) {
        tokens.push({ type: 'plain', value: aMatch[1] })
      } else if (aMatch[2]) {
        tokens.push({ type: 'attr-name', value: aMatch[2] })
      } else if (aMatch[3]) {
        tokens.push({ type: 'punctuation', value: aMatch[3] })
      } else if (aMatch[4]) {
        tokens.push({ type: 'attr-value', value: aMatch[4] })
      } else {
        tokens.push({ type: 'plain', value: aMatch[0] })
      }
    }
  }

  let textToParse = text

  if (startInsideTag) {
    let quote: string | null = null
    let closeIdx = -1
    let isSelf = false

    let textForTag = text
    let leadingQuote = ''
    if (text.startsWith('"') || text.startsWith("'")) {
      leadingQuote = text[0]
      textForTag = text.slice(1)
    }

    for (let i = 0; i < textForTag.length; i++) {
      const ch = textForTag[i]
      if (quote) {
        if (ch === quote) quote = null
      } else {
        if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '/' && textForTag[i + 1] === '>') {
          closeIdx = i
          isSelf = true
          break
        } else if (ch === '>') {
          closeIdx = i
          isSelf = false
          break
        }
      }
    }

    if (closeIdx !== -1) {
      const tagContent = leadingQuote + textForTag.slice(0, closeIdx)
      parseAttrs(tagContent)
      if (isSelf) {
        tokens.push({ type: 'punctuation', value: '/>' })
        textToParse = textForTag.slice(closeIdx + 2)
      } else {
        tokens.push({ type: 'punctuation', value: '>' })
        textToParse = textForTag.slice(closeIdx + 1)
      }
      endsInsideTag = false
    } else {
      parseAttrs(text)
      textToParse = ''
      endsInsideTag = true
    }
  }

  if (textToParse) {
    const mainRegex = /(<!--[\s\S]*?-->)|(<!--[\s\S]*)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<!\[CDATA\[[\s\S]*)|(<\?[^>]*\?>)|(<!DOCTYPE[^>]*>)|(<(?:"[^"]*"|'[^']*'|[^'">])+>)|(<(?:"[^"]*"|'[^']*'|[^'">])*)|([^<]+)/g
    let match: RegExpExecArray | null

    while ((match = mainRegex.exec(textToParse)) !== null) {
      const chunk = match[0]
      if (!chunk) continue

      if (chunk.startsWith('<!--')) {
        tokens.push({ type: 'comment', value: chunk })
      } else if (chunk.startsWith('<![CDATA[')) {
        tokens.push({ type: 'cdata', value: chunk })
      } else if (chunk.startsWith('<?') || chunk.startsWith('<!DOCTYPE')) {
        tokens.push({ type: 'punctuation', value: chunk })
      } else if (chunk.startsWith('</')) {
        const m = chunk.match(/^<\/(\s*)([^\s>]*?)(\s*)(>)?$/)
        if (m) {
          tokens.push({ type: 'punctuation', value: '</' })
          if (m[1]) tokens.push({ type: 'plain', value: m[1] })
          if (m[2]) tokens.push({ type: 'tag-name', value: m[2] })
          if (m[3]) tokens.push({ type: 'plain', value: m[3] })
          if (m[4]) tokens.push({ type: 'punctuation', value: m[4] })
        } else {
          tokens.push({ type: 'punctuation', value: chunk })
        }
      } else if (chunk.startsWith('<')) {
        const isSelfClosing = chunk.endsWith('/>')
        const hasEndBracket = chunk.endsWith('>') && !isSelfClosing
        let inner = chunk.slice(1)
        if (isSelfClosing) inner = inner.slice(0, -2)
        else if (hasEndBracket) inner = inner.slice(0, -1)

        const tagMatch = inner.match(/^([^\s/>]+)([\s\S]*)$/)
        if (!tagMatch) {
          tokens.push({ type: 'punctuation', value: '<' })
          if (inner) tokens.push({ type: 'plain', value: inner })
          if (isSelfClosing) tokens.push({ type: 'punctuation', value: '/>' })
          else if (hasEndBracket) tokens.push({ type: 'punctuation', value: '>' })
        } else {
          tokens.push({ type: 'punctuation', value: '<' })
          tokens.push({ type: 'tag-name', value: tagMatch[1] })
          if (tagMatch[2]) {
            parseAttrs(tagMatch[2])
          }
          if (isSelfClosing) tokens.push({ type: 'punctuation', value: '/>' })
          else if (hasEndBracket) tokens.push({ type: 'punctuation', value: '>' })
          else endsInsideTag = true
        }
      } else {
        tokens.push({ type: 'plain', value: chunk })
      }
    }
  }

  const result = tokens as XmlSyntaxToken[] & { endsInsideTag?: boolean }
  result.endsInsideTag = endsInsideTag
  return result
}

export function xmlTokenClass(type: XmlSyntaxToken['type']): string {
  switch (type) {
    case 'tag-name':
      return 'text-sky-300'
    case 'attr-name':
      return 'text-amber-300'
    case 'attr-value':
      return 'text-emerald-300'
    case 'punctuation':
      return 'text-text-secondary'
    case 'comment':
      return 'text-text-muted italic'
    case 'cdata':
      return 'text-purple-300'
    default:
      return ''
  }
}
