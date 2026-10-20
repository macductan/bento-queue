/**
 * Lightweight, robust JavaScript code formatter for Hecto API Script Editor.
 * Formats indentation, braces, spacing around operators/keywords,
 * and preserves strings and comments without any external dependencies.
 */

function extractStringsAndComment(line: string): {
  codeTemplate: string
  strings: string[]
  comment: string
} {
  const strings: string[] = []
  let comment = ''
  let inString: string | null = null
  let result = ''
  let currentStr = ''

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    const prev = i > 0 ? line[i - 1] : ''
    const next = i < line.length - 1 ? line[i + 1] : ''

    if (inString) {
      currentStr += c
      if (c === inString && prev !== '\\') {
        const placeholder = `__HECTO_STR_${strings.length}__`
        strings.push(currentStr)
        result += placeholder
        currentStr = ''
        inString = null
      }
      continue
    }

    if (c === '/' && next === '/') {
      comment = line.slice(i)
      break
    }

    if (c === '"' || c === "'" || c === '`') {
      inString = c
      currentStr = c
      continue
    }

    result += c
  }

  if (inString) {
    // Unclosed string, append as is
    result += currentStr
  }

  return { codeTemplate: result, strings, comment }
}

function formatCode(template: string): string {
  let s = template

  // Commas: space after comma, avoid multiple spaces
  s = s.replace(/,(\S)/g, ', $1')
  s = s.replace(/,\s+/g, ', ')

  // Colons: space after colon, e.g. key: value (except for URLs or cases like case 'x':)
  s = s.replace(/:(\S)/g, ': $1')
  s = s.replace(/:\s+/g, ': ')

  // Control flow keywords: if, for, while, switch, catch followed by '('
  s = s.replace(/\b(if|for|while|switch|catch)\s*\(/g, '$1 (')

  // Function paren to brace: ) {
  s = s.replace(/\)\s*\{/g, ') {')

  // Assignment = (excluding ==, ===, !=, !==, <=, >=, =>)
  s = s.replace(/([^=!<>]|^)=([^=><])/g, '$1 = $2')

  // Logical operators
  s = s.replace(/([^&])&&([^&])/g, '$1 && $2')
  s = s.replace(/([^|])\|\|([^|])/g, '$1 || $2')

  // Binary operators (+, -, *, /) between identifiers/numbers/placeholders/parens
  // e.g. a + b, 1 - 2, x * y
  s = s.replace(/([a-zA-Z0-9_$\)\]])\s*([+\-*])\s*([a-zA-Z0-9_$\(\[])/g, '$1 $2 $3')

  // Arrow functions: =>
  s = s.replace(/\s*=>\s*/g, ' => ')

  // Single line object braces spacing: { foo: bar }
  s = s.replace(/\{\s*([^}\s]+)/g, '{ $1')
  s = s.replace(/([^}\s]+)\s*\}/g, '$1 }')
  s = s.replace(/\{\s*\}/g, '{}')

  // Normalize duplicate spaces (not newlines)
  s = s.replace(/[ \t]+/g, ' ')

  return s.trim()
}

export function formatJavaScript(code: string, indent = '  '): string {
  if (!code || !code.trim()) return code

  const rawLines = code.split('\n')
  const formattedLines: string[] = []
  let depth = 0
  let inMultiLineComment = false

  for (let idx = 0; idx < rawLines.length; idx++) {
    const rawLine = rawLines[idx]
    const trimmed = rawLine.trim()

    // Handle empty line (allow single blank lines, avoid consecutive blank lines)
    if (!trimmed) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('')
      }
      continue
    }

    // Check multiline comment
    if (inMultiLineComment) {
      formattedLines.push(indent.repeat(depth) + trimmed)
      if (trimmed.includes('*/')) {
        inMultiLineComment = false
      }
      continue
    }

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) {
        inMultiLineComment = true
      }
      formattedLines.push(indent.repeat(depth) + trimmed)
      continue
    }

    const { codeTemplate, strings, comment } = extractStringsAndComment(trimmed)

    // Count open and close braces/brackets outside of strings & comments
    let openCount = 0
    let closeCount = 0
    let leadingCloseCount = 0
    let checkLeading = true

    for (let i = 0; i < codeTemplate.length; i++) {
      const c = codeTemplate[i]
      if (c === '}' || c === ']') {
        closeCount++
        if (checkLeading) leadingCloseCount++
      } else if (c === '{' || c === '[') {
        openCount++
        checkLeading = false
      } else if (c !== ' ' && c !== '\t' && c !== ')' && c !== ';' && c !== ',') {
        checkLeading = false
      }
    }

    // Indentation for current line: reduce depth if line starts with closing brace(s)
    const currentLineDepth = Math.max(0, depth - leadingCloseCount)

    // Format the code portion
    let formattedCode = formatCode(codeTemplate)

    // Restore string literals
    for (let sIdx = 0; sIdx < strings.length; sIdx++) {
      formattedCode = formattedCode.replace(`__HECTO_STR_${sIdx}__`, strings[sIdx])
    }

    // Re-attach comment
    let finalLine = formattedCode
    if (comment) {
      if (finalLine.length > 0) {
        finalLine = finalLine + ' ' + comment.trim()
      } else {
        finalLine = comment.trim()
      }
    }

    formattedLines.push(indent.repeat(currentLineDepth) + finalLine)

    // Calculate depth for subsequent lines
    depth = Math.max(0, depth + openCount - closeCount)
  }

  return formattedLines.join('\n').trimEnd()
}
