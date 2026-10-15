export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
