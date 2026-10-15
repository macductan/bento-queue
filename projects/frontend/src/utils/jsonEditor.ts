import {
  parseTree,
  format as formatJsoncEdits,
  applyEdits,
  stripComments,
  createScanner,
  printParseErrorCode,
  type ParseError
} from 'jsonc-parser'

export interface JsonValidationResult {
  valid: boolean
  isJsonc: boolean
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

const SMART_CHAR_MAP: Record<string, string> = {
  '\u201C': '"',
  '\u201D': '"',
  '\u2018': "'",
  '\u2019': "'",
  '\uFF5B': '{',
  '\uFF5D': '}',
  '\u300C': '[',
  '\u300D': ']'
}

const SMART_CHAR_REGEX = /[\u201C\u201D\u2018\u2019\uFF5B\uFF5D\u300C\u300D]/g

/**
 * Replaces smart quotes and fullwidth/CJK brackets in a textarea with standard ASCII characters
 * while preserving the user's cursor selection position.
 */
export function normalizeSmartChars(el: HTMLTextAreaElement): string {
  const val = el.value || ''
  SMART_CHAR_REGEX.lastIndex = 0
  if (!SMART_CHAR_REGEX.test(val)) {
    return val
  }
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : val.length
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : val.length
  const scrollTop = el.scrollTop
  const scrollLeft = el.scrollLeft
  const normalized = val.replace(SMART_CHAR_REGEX, (ch) => SMART_CHAR_MAP[ch] ?? ch)
  if (normalized !== val) {
    el.value = normalized
    try {
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(start, end)
      }
      el.scrollTop = scrollTop
      el.scrollLeft = scrollLeft
    } catch {
      // Ignore selection range errors on detached elements
    }
  }
  return normalized
}

/**
 * Replaces bare (unquoted) {{variable}} placeholders in JSON/JSONC with quoted sentinel strings
 * while skipping over strings and line/block comments so standard parsers can process the document.
 */
function substituteBareVariables(input: string): BareVarSubstitution {
  const bareVars: string[] = []
  let out = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let i = 0
  const len = input.length

  while (i < len) {
    const ch = input[i]

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false
      }
      out += ch
      i++
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && i + 1 < len && input[i + 1] === '/') {
        out += '*/'
        inBlockComment = false
        i += 2
        continue
      }
      out += ch
      i++
      continue
    }

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

    if (ch === '/' && i + 1 < len) {
      if (input[i + 1] === '/') {
        inLineComment = true
        out += '//'
        i += 2
        continue
      }
      if (input[i + 1] === '*') {
        inBlockComment = true
        out += '/*'
        i += 2
        continue
      }
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

// Numeric values matching jsonc-parser SyntaxKind (declared as ambient const enum in jsonc-parser)
const TOKEN_CLOSE_BRACE = 2
const TOKEN_CLOSE_BRACKET = 4
const TOKEN_COMMA = 5
const TOKEN_LINE_COMMENT = 12
const TOKEN_BLOCK_COMMENT = 13
const TOKEN_LINE_BREAK = 14
const TOKEN_TRIVIA = 15
const TOKEN_EOF = 17

function detectJsoncFeatures(sanitized: string): boolean {
  const scanner = createScanner(sanitized, false)
  let prevNonTrivia: number | null = null
  let token = scanner.scan() as number
  while (token !== TOKEN_EOF) {
    if (token === TOKEN_LINE_COMMENT || token === TOKEN_BLOCK_COMMENT) {
      return true
    }
    if (token !== TOKEN_TRIVIA && token !== TOKEN_LINE_BREAK) {
      if (
        (token === TOKEN_CLOSE_BRACE || token === TOKEN_CLOSE_BRACKET) &&
        prevNonTrivia === TOKEN_COMMA
      ) {
        return true
      }
      prevNonTrivia = token
    }
    token = scanner.scan() as number
  }
  return false
}

function parseErrorToMessage(error: ParseError['error']): string {
  const name = printParseErrorCode(error)
  switch (name) {
    case 'InvalidSymbol':
      return 'Ký hiệu không hợp lệ'
    case 'InvalidNumberFormat':
      return 'Định dạng số không hợp lệ'
    case 'PropertyNameExpected':
      return 'Thiếu tên thuộc tính (key)'
    case 'ValueExpected':
      return 'Thiếu giá trị (value)'
    case 'ColonExpected':
      return 'Thiếu dấu hai chấm (:)'
    case 'CommaExpected':
      return 'Thiếu dấu phẩy (,)'
    case 'CloseBraceExpected':
      return 'Thiếu dấu đóng ngoặc nhọn (})'
    case 'CloseBracketExpected':
      return 'Thiếu dấu đóng ngoặc vuông (])'
    case 'EndOfFileExpected':
      return 'Dữ liệu thừa sau kết thúc JSON'
    case 'UnexpectedEndOfComment':
      return 'Comment chưa được đóng (*/)'
    case 'UnexpectedEndOfString':
      return 'Chuỗi ký tự chưa được đóng (")'
    case 'UnexpectedEndOfNumber':
      return 'Số chưa hoàn chỉnh'
    case 'InvalidEscapeCharacter':
      return 'Ký tự escape không hợp lệ'
    case 'InvalidUnicode':
      return 'Ký tự Unicode không hợp lệ'
    case 'InvalidCharacter':
      return 'Ký tự không hợp lệ'
    default:
      return 'Cú pháp JSON không hợp lệ'
  }
}

/**
 * Validates a JSON or JSONC string while allowing {{variable}} placeholders both inside strings
 * and as bare value tokens.
 */
export function validateJsonWithPlaceholders(content: string): JsonValidationResult {
  if (!content || content.trim() === '') {
    return { valid: true, isJsonc: false }
  }

  const { sanitized } = substituteBareVariables(content)
  const errors: ParseError[] = []
  parseTree(sanitized, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
    disallowComments: false
  })

  if (errors.length === 0) {
    const isJsonc = detectJsoncFeatures(sanitized)
    return { valid: true, isJsonc }
  }

  const firstErr = errors[0]
  const offset = firstErr ? firstErr.offset : sanitized.length
  const { line, column } = offsetToLineColumn(sanitized, offset)
  const detail = firstErr ? parseErrorToMessage(firstErr.error) : 'Cú pháp JSON không hợp lệ'

  return {
    valid: false,
    isJsonc: false,
    error: `Lỗi cú pháp JSON (dòng ${line}, cột ${column}): ${detail}`,
    line,
    column
  }
}

/**
 * Formats/prettifies a JSON or JSONC string with 2-space indentation while preserving
 * comments, trailing commas, and {{variable}} placeholders (both quoted and unquoted).
 * Throws an error if the JSON/JSONC is invalid.
 */
export function prettifyJsonWithPlaceholders(content: string): string {
  if (!content || content.trim() === '') {
    return content
  }

  const validation = validateJsonWithPlaceholders(content)
  if (!validation.valid) {
    throw new Error(validation.error || 'JSON không hợp lệ')
  }

  const { sanitized, bareVars } = substituteBareVariables(content)
  const edits = formatJsoncEdits(sanitized, undefined, {
    tabSize: 2,
    insertSpaces: true,
    eol: '\n'
  })
  let formatted = applyEdits(sanitized, edits)

  for (let i = 0; i < bareVars.length; i++) {
    formatted = formatted.replace(`"__HECTO_BARE_VAR_${i}__"`, () => bareVars[i])
  }

  return formatted
}

export const formatJsonc = prettifyJsonWithPlaceholders

/**
 * Strips line/block comments and trailing commas from a JSONC string to produce pure JSON,
 * without touching content inside string literals.
 */
export function stripJsoncToJson(content: string): string {
  if (!content || content.trim() === '') {
    return content
  }

  // 1. Strip comments using jsonc-parser's AST-aware scanner (safe for strings containing // or /*)
  const withoutComments = stripComments(content)

  // 2. Remove trailing commas outside of string literals by masking strings first
  const strings: string[] = []
  let masked = ''
  let inString = false
  let strStart = 0
  let i = 0
  const len = withoutComments.length

  while (i < len) {
    const ch = withoutComments[i]
    if (inString) {
      if (ch === '\\' && i + 1 < len) {
        i += 2
        continue
      }
      if (ch === '"') {
        inString = false
        const literal = withoutComments.slice(strStart, i + 1)
        const idx = strings.length
        strings.push(literal)
        masked += `"__HECTO_STR_${idx}__"`
        i++
        continue
      }
      i++
      continue
    }

    if (ch === '"') {
      inString = true
      strStart = i
      i++
      continue
    }

    masked += ch
    i++
  }

  if (inString) {
    // Unclosed string fallback: append remaining characters as-is
    masked += withoutComments.slice(strStart)
  }

  let strippedMasked = masked
  while (/,(\s*[}\]])/.test(strippedMasked)) {
    strippedMasked = strippedMasked.replace(/,(\s*[}\]])/g, '$1')
  }

  return strippedMasked.replace(/"__HECTO_STR_(\d+)__"/g, (_, idxStr) => {
    const idx = Number(idxStr)
    return strings[idx] ?? _
  })
}

const JSON_TOKEN_REGEX =
  /(\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\]:,])/g

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

    const [full, commentLiteral, strLiteral, colonSuffix, boolLiteral, nullLiteral, numLiteral, punct] = match
    if (commentLiteral !== undefined) {
      tokens.push({ type: 'plain', value: commentLiteral })
    } else if (strLiteral !== undefined) {
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
