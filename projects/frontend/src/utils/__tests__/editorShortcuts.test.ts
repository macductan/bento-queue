import { describe, it, expect } from 'vitest'
import {
  computeAutoIndent,
  computeToggleComment
} from '../editorShortcuts'

describe('editorShortcuts - computeAutoIndent', () => {
  it('preserves existing indentation on Enter', () => {
    const val = '    const a = 1;'
    const res = computeAutoIndent(val, val.length, val.length, 'javascript')
    expect(res.value).toBe('    const a = 1;\n    ')
    expect(res.cursor).toBe(res.value.length)
  })

  it('adds +2 spaces when line ends with { in JSON', () => {
    const val = '  "user": {'
    const res = computeAutoIndent(val, val.length, val.length, 'json')
    expect(res.value).toBe('  "user": {\n    ')
    expect(res.cursor).toBe(res.value.length)
  })

  it('adds +2 spaces when line ends with [ in JSON', () => {
    const val = '  "items": ['
    const res = computeAutoIndent(val, val.length, val.length, 'json')
    expect(res.value).toBe('  "items": [\n    ')
    expect(res.cursor).toBe(res.value.length)
  })

  it('expands bracket pair when Enter is pressed between { and }', () => {
    const val = '  {' + '}'
    const res = computeAutoIndent(val, 3, 3, 'json')
    expect(res.value).toBe('  {\n    \n  }')
    // Cursor is placed on the indented middle line
    expect(res.cursor).toBe('  {\n    '.length)
  })

  it('adds +2 spaces when line ends with unclosed XML tag', () => {
    const val = '  <root>'
    const res = computeAutoIndent(val, val.length, val.length, 'xml')
    expect(res.value).toBe('  <root>\n    ')
    expect(res.cursor).toBe(res.value.length)
  })

  it('does NOT add extra indent for self-closing XML tag', () => {
    const val = '  <item id="1" />'
    const res = computeAutoIndent(val, val.length, val.length, 'xml')
    expect(res.value).toBe('  <item id="1" />\n  ')
  })

  it('does NOT add extra indent for closing XML tag', () => {
    const val = '  </root>'
    const res = computeAutoIndent(val, val.length, val.length, 'xml')
    expect(res.value).toBe('  </root>\n  ')
  })
})

describe('editorShortcuts - computeToggleComment', () => {
  it('toggles comment on a single line in JSON/JS', () => {
    const val = '  const a = 10;'
    const commented = computeToggleComment(val, 4, 4, 'json')
    expect(commented.value).toBe('  // const a = 10;')

    const uncommented = computeToggleComment(commented.value, 4, 4, 'json')
    expect(uncommented.value).toBe('  const a = 10;')
  })

  it('toggles comment on multiple selected lines in JSON/JS', () => {
    const val = 'line1\nline2\nline3'
    const commented = computeToggleComment(val, 0, val.length, 'javascript')
    expect(commented.value).toBe('// line1\n// line2\n// line3')

    const uncommented = computeToggleComment(commented.value, 0, commented.value.length, 'javascript')
    expect(uncommented.value).toBe('line1\nline2\nline3')
  })

  it('comments all lines if some are commented and some are not', () => {
    const val = '// line1\nline2'
    const commented = computeToggleComment(val, 0, val.length, 'json')
    expect(commented.value).toBe('// // line1\n// line2')
  })

  it('toggles comment on a single line in XML', () => {
    const val = '  <tag>value</tag>'
    const commented = computeToggleComment(val, 5, 5, 'xml')
    expect(commented.value).toBe('  <!-- <tag>value</tag> -->')

    const uncommented = computeToggleComment(commented.value, 5, 5, 'xml')
    expect(uncommented.value).toBe('  <tag>value</tag>')
  })

  it('toggles comment on a selected block in XML', () => {
    const val = '<tag>hello</tag>'
    const commented = computeToggleComment(val, 0, val.length, 'xml')
    expect(commented.value).toBe('<!-- <tag>hello</tag> -->')

    const uncommented = computeToggleComment(commented.value, 0, commented.value.length, 'xml')
    expect(uncommented.value).toBe('<tag>hello</tag>')
  })
})
