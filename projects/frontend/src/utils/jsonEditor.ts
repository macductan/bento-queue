export interface JsonValidationResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
}

export interface JsonSyntaxToken {
  type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'plain'
  value: string
}

interface BareVarSubstitution {
  sanitized: string
  bareVars: string[]
}

/**
 * Replaces bare (unquoted) {{variable}} placeholders in JSON with quoted sentinel strings
 * so standard JSON.parse / JSON.stringify can process the document without syntax errors.
 */
function substituteBareVariables(input: string): BareVarSubstitution {
  const bareVars: string[] = []
  let out = ''
  let inString = false
  let i = 0
  const len = input.length

  while (i < len) {
    const ch = input[i]

    if (inString) {
      if (ch === '\\' && i + 1 < len) {
        out += ch + input[i + 1]
        i += 2
        continue
      }
      if (ch === '"') {
        inString = false
      }
      out += ch
      i++
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }

    if (ch === '{' && i + 1 < len && input[i + 1] === '{') {
      const closeIdx = input.indexOf('}}', i + 2)
      if (closeIdx !== -1) {
        const rawVar = input.slice(i, closeIdx + 2)
        const idx = bareVars.length
        bareVars.push(rawVar)
        out += `"__HECTO_BARE_VAR_${idx}__"`
        i = closeIdx + 2
        continue
      }
    }

    out += ch
    i++
  }

  return { sanitized: out, bareVars }
}

function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 1
  let column = 1
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}

/**
 * Validates a JSON string while allowing {{variable}} placeholders both inside strings
 * and as bare value tokens.
 */
export function validateJsonWithPlaceholders(content: string): JsonValidationResult {
  if (!content || content.trim() === '') {
    return { valid: true }
  }

  const { sanitized } = substituteBareVariables(content)
  try {
    JSON.parse(sanitized)
    return { valid: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    let line = 1
    let column = 1

    const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
    const posMatch = msg.match(/position\s+(\d+)/i)
    if (lineColMatch) {
      line = Number(lineColMatch[1]) || 1
      column = Number(lineColMatch[2]) || 1
    } else if (posMatch) {
      const pos = Number(posMatch[1]) || 0
      const lc = offsetToLineColumn(sanitized, pos)
      line = lc.line
      column = lc.column
    } else {
      const lc = offsetToLineColumn(sanitized, sanitized.length)
      line = lc.line
      column = lc.column
    }

    return {
      valid: false,
      error: `Lỗi cú pháp JSON (dòng ${line}, cột ${column}): ${msg}`,
      line,
      column
    }
  }
}

/**
 * Formats/prettifies a JSON string with 2-space indentation while preserving
 * {{variable}} placeholders (both quoted and unquoted).
 * Throws an error if the JSON is invalid.
 */
export function prettifyJsonWithPlaceholders(content: string): string {
  if (!content || content.trim() === '') {
    return content
  }

  const { sanitized, bareVars } = substituteBareVariables(content)
  const parsed = JSON.parse(sanitized)
  let formatted = JSON.stringify(parsed, null, 2)

  for (let i = 0; i < bareVars.length; i++) {
    formatted = formatted.replace(`"__HECTO_BARE_VAR_${i}__"`, () => bareVars[i])
  }

  return formatted
}

const JSON_TOKEN_REGEX =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\]:,])/g

/**
 * Tokenizes a plain text segment of JSON into syntax tokens for syntax highlighting.
 */
export function tokenizeJsonTextSegment(
  text: string,
  prevWasVar = false,
  nextIsVar = false
): JsonSyntaxToken[] {
  if (!text) return []

  const tokens: JsonSyntaxToken[] = []
  const workingText = text
  let offset = 0

  // If previous segment was a {{var}} inside a JSON string, consume up to the closing unescaped quote on the same line
  if (prevWasVar) {
    const closeQuoteMatch = workingText.match(/^((?:\\.|[^"\\\r\n])*")(\s*:)?/)
    if (closeQuoteMatch) {
      const strPart = closeQuoteMatch[1]
      const colonPart = closeQuoteMatch[2]
      if (colonPart) {
        tokens.push({ type: 'key', value: strPart })
        tokens.push({ type: 'punctuation', value: colonPart })
        offset = strPart.length + colonPart.length
      } else {
        tokens.push({ type: 'string', value: strPart })
        offset = strPart.length
      }
    }
  }

  let trailingString: string | null = null
  let endLimit = workingText.length
  if (nextIsVar) {
    const rest = workingText.slice(offset)
    const openQuoteMatch = rest.match(/("(?:\\.|[^"\\\r\n])*)$/)
    if (openQuoteMatch && openQuoteMatch.index !== undefined) {
      // Ensure the quote is an opening quote (count unescaped quotes in rest)
      const beforeInRest = rest.slice(0, openQuoteMatch.index)
      const unescapedQuotes = (beforeInRest.match(/(?<!\\)"/g) || []).length
      if (unescapedQuotes % 2 === 0) {
        trailingString = openQuoteMatch[1]
        endLimit = offset + openQuoteMatch.index
      }
    }
  }

  const middleText = workingText.slice(offset, endLimit)
  let lastIdx = 0
  let match: RegExpExecArray | null

  JSON_TOKEN_REGEX.lastIndex = 0
  while ((match = JSON_TOKEN_REGEX.exec(middleText)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({
        type: 'plain',
        value: middleText.slice(lastIdx, match.index)
      })
    }

    const [full, strLiteral, colonSuffix, boolLiteral, nullLiteral, numLiteral, punct] = match
    if (strLiteral !== undefined) {
      if (colonSuffix !== undefined) {
        tokens.push({ type: 'key', value: strLiteral })
        tokens.push({ type: 'punctuation', value: colonSuffix })
      } else {
        tokens.push({ type: 'string', value: strLiteral })
      }
    } else if (boolLiteral !== undefined) {
      tokens.push({ type: 'boolean', value: boolLiteral })
    } else if (nullLiteral !== undefined) {
      tokens.push({ type: 'null', value: nullLiteral })
    } else if (numLiteral !== undefined) {
      tokens.push({ type: 'number', value: numLiteral })
    } else if (punct !== undefined) {
      tokens.push({ type: 'punctuation', value: punct })
    } else {
      tokens.push({ type: 'plain', value: full })
    }

    lastIdx = JSON_TOKEN_REGEX.lastIndex
  }

  if (lastIdx < middleText.length) {
    tokens.push({
      type: 'plain',
      value: middleText.slice(lastIdx)
    })
  }

  if (trailingString !== null) {
    tokens.push({
      type: 'string',
      value: trailingString
    })
  }

  return tokens
}
