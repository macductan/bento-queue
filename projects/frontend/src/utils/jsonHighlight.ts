export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

export function highlightHtmlWithSearch(
  html: string,
  query: string,
  caseSensitive = false,
  activeMatchIndex = 0
): { html: string; matchCount: number } {
  if (!query || !html) {
    return { html, matchCount: 0 }
  }

  interface HtmlSegment {
    isTag: boolean
    raw: string
    text: string
    startOffset: number
    endOffset: number
  }

  const segments: HtmlSegment[] = []
  let fullText = ''
  const tokenRegex = /<[^>]+>|[^<]+|</g
  let tokenMatch: RegExpExecArray | null

  while ((tokenMatch = tokenRegex.exec(html)) !== null) {
    const raw = tokenMatch[0]
    if (raw.startsWith('<') && raw.length > 1) {
      segments.push({
        isTag: true,
        raw,
        text: '',
        startOffset: fullText.length,
        endOffset: fullText.length
      })
    } else {
      const decoded = decodeHtmlEntities(raw)
      const startOffset = fullText.length
      fullText += decoded
      segments.push({
        isTag: false,
        raw,
        text: decoded,
        startOffset,
        endOffset: fullText.length
      })
    }
  }

  if (!fullText) {
    return { html, matchCount: 0 }
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matchRegex = new RegExp(escapedQuery, caseSensitive ? 'g' : 'gi')

  const matches: Array<{ start: number; end: number; index: number }> = []
  let mExec: RegExpExecArray | null
  while ((mExec = matchRegex.exec(fullText)) !== null) {
    if (mExec[0].length === 0) {
      matchRegex.lastIndex++
      continue
    }
    matches.push({
      start: mExec.index,
      end: mExec.index + mExec[0].length,
      index: matches.length
    })
  }

  if (matches.length === 0) {
    return { html, matchCount: 0 }
  }

  const safeActiveIdx = ((activeMatchIndex % matches.length) + matches.length) % matches.length
  const out: string[] = []
  let mPtr = 0

  for (const seg of segments) {
    if (seg.isTag) {
      out.push(seg.raw)
      continue
    }

    while (mPtr < matches.length && matches[mPtr].end <= seg.startOffset) {
      mPtr++
    }

    let cursor = seg.startOffset
    let tempPtr = mPtr

    while (tempPtr < matches.length && matches[tempPtr].start < seg.endOffset) {
      const m = matches[tempPtr]
      const overlapStart = Math.max(seg.startOffset, m.start)
      const overlapEnd = Math.min(seg.endOffset, m.end)

      if (overlapStart > cursor) {
        out.push(escapeHtml(fullText.slice(cursor, overlapStart)))
      }

      const matchedText = escapeHtml(fullText.slice(overlapStart, overlapEnd))
      const isActive = m.index === safeActiveIdx
      const markClass = isActive
        ? 'bg-orange-500 text-slate-950 font-semibold rounded-[2px] ring-1 ring-orange-300 search-match-active'
        : 'bg-amber-400/35 text-amber-100 rounded-[2px] search-match'

      out.push(
        `<mark data-search-match="true" data-match-index="${m.index}"${
          isActive ? ' data-active-match="true"' : ''
        } class="${markClass}">${matchedText}</mark>`
      )

      cursor = overlapEnd

      if (m.end <= seg.endOffset) {
        tempPtr++
        mPtr = tempPtr
      } else {
        break
      }
    }

    if (cursor < seg.endOffset) {
      out.push(escapeHtml(fullText.slice(cursor, seg.endOffset)))
    }
  }

  return {
    html: out.join(''),
    matchCount: matches.length
  }
}

export function isJsonContentType(headers: Record<string, string[]>): boolean {
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-type') {
      for (const val of values) {
        if (val.toLowerCase().includes('json')) {
          return true
        }
      }
    }
  }
  return false
}

export function tryParseJson(body: string): boolean {
  if (!body || body.trim() === '') return false
  try {
    JSON.parse(body)
    return true
  } catch {
    return false
  }
}

export function formatJsonHtml(body: string): { html: string; lines: number } {
  const result: string[] = []
  let indentLevel = 0
  let lineCount = 1

  function appendIndent() {
    result.push('  '.repeat(indentLevel))
  }

  // Tokenize the string (simple regex-based approach for formatting)
  const tokens = body.match(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\]]|\s+|.)/g) || []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.trim() === '') {
      continue
    }

    if (token.match(/^"(.*)"\s*:$/)) {
      // Key
      const str = token.match(/^"(.*)"/)![0]
      result.push(`<span class="text-syntax-key">${escapeHtml(str)}</span><span class="text-text-secondary">: </span>`)
    } else if (token.match(/^"(.*)"$/)) {
      // String
      result.push(`<span class="text-syntax-string">${escapeHtml(token)}</span>`)
    } else if (token.match(/^-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?$/)) {
      // Number
      result.push(`<span class="text-syntax-number">${token}</span>`)
    } else if (token.match(/^(true|false)$/)) {
      // Boolean
      result.push(`<span class="text-syntax-boolean">${token}</span>`)
    } else if (token === 'null') {
      // Null
      result.push(`<span class="text-syntax-null">${token}</span>`)
    } else if (token === '{' || token === '[') {
      result.push(`<span class="text-text-secondary">${token}</span>`)
      
      // Look ahead for empty object/array
      let nextValidIndex = i + 1
      while (nextValidIndex < tokens.length && tokens[nextValidIndex].trim() === '') {
        nextValidIndex++
      }
      
      if (nextValidIndex < tokens.length && ((token === '{' && tokens[nextValidIndex] === '}') || (token === '[' && tokens[nextValidIndex] === ']'))) {
        result.push(`<span class="text-text-secondary">${tokens[nextValidIndex]}</span>`)
        i = nextValidIndex
      } else {
        result.push('\n')
        lineCount++
        indentLevel++
        appendIndent()
      }
    } else if (token === '}' || token === ']') {
      result.push('\n')
      lineCount++
      indentLevel--
      appendIndent()
      result.push(`<span class="text-text-secondary">${token}</span>`)
    } else if (token === ',') {
      result.push(`<span class="text-text-secondary">${token}</span>\n`)
      lineCount++
      appendIndent()
    } else {
      // Fallback
      result.push(`<span class="text-text-secondary">${escapeHtml(token)}</span>`)
    }
  }

  return { html: result.join(''), lines: lineCount }
}

export function formatJsonText(body: string): string {
  const result: string[] = []
  let indentLevel = 0

  function appendIndent() {
    result.push('  '.repeat(indentLevel))
  }

  const tokens = body.match(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\]]|\s+|.)/g) || []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.trim() === '') {
      continue
    }

    if (token.match(/^"(.*)"\s*:$/)) {
      const str = token.match(/^"(.*)"/)![0]
      result.push(`${str}: `)
    } else if (token === '{' || token === '[') {
      result.push(token)
      
      let nextValidIndex = i + 1
      while (nextValidIndex < tokens.length && tokens[nextValidIndex].trim() === '') {
        nextValidIndex++
      }
      
      if (nextValidIndex < tokens.length && ((token === '{' && tokens[nextValidIndex] === '}') || (token === '[' && tokens[nextValidIndex] === ']'))) {
        result.push(tokens[nextValidIndex])
        i = nextValidIndex
      } else {
        result.push('\n')
        indentLevel++
        appendIndent()
      }
    } else if (token === '}' || token === ']') {
      result.push('\n')
      indentLevel--
      appendIndent()
      result.push(token)
    } else if (token === ',') {
      result.push(`${token}\n`)
      appendIndent()
    } else {
      result.push(token)
    }
  }

  return result.join('')
}
