import { describe, it, expect } from 'vitest'
import {
  isXmlContentType,
  tryParseXml,
  validateXmlWithPlaceholders,
  formatXmlText,
  formatXmlHtml,
  tokenizeXmlTextSegment,
  xmlTokenClass
} from '../xmlUtils'

describe('xmlUtils', () => {
  describe('isXmlContentType', () => {
    it('detects standard and vendor/soap XML content types', () => {
      expect(isXmlContentType({ 'content-type': ['application/xml'] })).toBe(true)
      expect(isXmlContentType({ 'Content-Type': ['text/xml; charset=utf-8'] })).toBe(true)
      expect(isXmlContentType({ 'CONTENT-TYPE': ['application/soap+xml; charset=utf-8'] })).toBe(true)
      expect(isXmlContentType({ 'content-type': ['application/atom+xml'] })).toBe(true)
    })

    it('returns false for non-XML or missing headers', () => {
      expect(isXmlContentType(null)).toBe(false)
      expect(isXmlContentType({})).toBe(false)
      expect(isXmlContentType({ 'content-type': ['application/json'] })).toBe(false)
      expect(isXmlContentType({ 'content-type': ['text/plain'] })).toBe(false)
    })
  })

  describe('tryParseXml', () => {
    it('returns true for valid XML documents', () => {
      expect(tryParseXml('<root><item>Hello</item></root>')).toBe(true)
      expect(tryParseXml('<?xml version="1.0"?><note><to>Tove</to></note>')).toBe(true)
      expect(tryParseXml('<self-closing id="1"/>')).toBe(true)
    })

    it('returns false for non-XML and invalid XML', () => {
      expect(tryParseXml('')).toBe(false)
      expect(tryParseXml('   ')).toBe(false)
      expect(tryParseXml('{ "json": true }')).toBe(false)
      expect(tryParseXml('<root><item>Unclosed</root>')).toBe(false)
    })
  })

  describe('validateXmlWithPlaceholders', () => {
    it('validates clean XML', () => {
      const res = validateXmlWithPlaceholders('<root><child>value</child></root>')
      expect(res.valid).toBe(true)
      expect(res.error).toBeUndefined()
    })

    it('validates XML with template variables in attributes and text', () => {
      const xml = '<Envelope xmlns:soap="{{soap_env}}"><Body id="{{body_id}}"><Item>{{item_name}}</Item></Body></Envelope>'
      const res = validateXmlWithPlaceholders(xml)
      expect(res.valid).toBe(true)
    })

    it('validates XML with template variables in tag names', () => {
      const xml = '<root><{{custom_tag}}>hello</{{custom_tag}}></root>'
      const res = validateXmlWithPlaceholders(xml)
      expect(res.valid).toBe(true)
    })

    it('reports error on invalid XML tag mismatch', () => {
      const res = validateXmlWithPlaceholders('<root><open>missing-close</root>')
      expect(res.valid).toBe(false)
      expect(res.error).toBeDefined()
    })

    it('reports error when input does not start with <', () => {
      const res = validateXmlWithPlaceholders('not an xml tag')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('XML phải bắt đầu bằng thẻ mở hoặc khai báo XML')
    })
    it('reports error on mismatched variable tag names', () => {
      const res = validateXmlWithPlaceholders('<root><{{open_tag}}>content</{{close_tag}}></root>')
      expect(res.valid).toBe(false)
      expect(res.error).toBeDefined()
    })
  })

  describe('formatXmlText', () => {
    it('formats unindented XML into clean multi-line hierarchy', () => {
      const input = '<root><item id="1"><name>Alice</name></item><item id="2"><name>Bob</name></item></root>'
      const formatted = formatXmlText(input)
      expect(formatted).toBe(
`<root>
  <item id="1">
    <name>Alice</name>
  </item>
  <item id="2">
    <name>Bob</name>
  </item>
</root>`
      )
    })

    it('preserves tags with > inside quoted attribute values', () => {
      const input = '<rule condition="count > 10"><result>true</result></rule>'
      const formatted = formatXmlText(input)
      expect(formatted).toContain('condition="count > 10"')
    })

    it('preserves self-closing tags and XML declaration', () => {
      const input = '<?xml version="1.0" encoding="UTF-8"?><data><item id="1"/><item id="2"/></data>'
      const formatted = formatXmlText(input)
      expect(formatted).toBe(
`<?xml version="1.0" encoding="UTF-8"?>
<data>
  <item id="1"/>
  <item id="2"/>
</data>`
      )
    })

    it('preserves CDATA sections and comments', () => {
      const input = '<data><!-- comment --><payload><![CDATA[foo & bar <baz>]]></payload></data>'
      const formatted = formatXmlText(input)
      expect(formatted).toContain('<!-- comment -->')
      expect(formatted).toContain('<![CDATA[foo & bar <baz>]]>')
    })

    it('preserves {{var}} placeholders intact', () => {
      const input = '<user id="{{userId}}"><name>{{userName}}</name></user>'
      const formatted = formatXmlText(input)
      expect(formatted).toBe(
`<user id="{{userId}}">
  <name>{{userName}}</name>
</user>`
      )
    })
  })

  describe('formatXmlHtml', () => {
    it('produces syntax-highlighted HTML matching line counts', () => {
      const input = '<root><item id="42">value</item></root>'
      const res = formatXmlHtml(input)
      expect(res.lines).toBe(3)
      expect(res.html).toContain('text-sky-300')
      expect(res.html).toContain('text-amber-300')
      expect(res.html).toContain('text-emerald-300')
      expect(res.html).toContain('&quot;42&quot;')
      expect(res.html).toContain('text-text-primary')
    })

    it('preserves leading < and syntax styling on multi-line comments and CDATA', () => {
      const input = '<root>\n<!-- multi\nline comment -->\n<![CDATA[\nmulti line cdata\n]]>\n</root>'
      const res = formatXmlHtml(input)
      expect(res.html).not.toContain('&gt;!--')
      expect(res.html).toContain('&lt;!--')
      expect(res.html).toContain('&lt;![CDATA[')
    })
  })

  describe('tokenizeXmlTextSegment & xmlTokenClass', () => {
    it('tokenizes opening and closing tags into tag-name, attr-name, attr-value, punctuation', () => {
      const tokens = tokenizeXmlTextSegment('<user id="123" active="true"><name>Sam</name></user>')
      expect(tokens.some(t => t.type === 'tag-name' && t.value === 'user')).toBe(true)
      expect(tokens.some(t => t.type === 'attr-name' && t.value === 'id')).toBe(true)
      expect(tokens.some(t => t.type === 'attr-value' && t.value === '"123"')).toBe(true)
      expect(tokens.some(t => t.type === 'punctuation' && t.value === '<')).toBe(true)
      expect(tokens.some(t => t.type === 'plain' && t.value === 'Sam')).toBe(true)
    })

    it('preserves exact character string when joined back (1:1 caret alignment invariant)', () => {
      const samples = [
        '<>',
        '< >',
        '</ root >',
        '<user id="123" active="true">',
        '<!-- multiline\ncomment -->',
        '<![CDATA[ some data ]]>',
        '<rule condition="a > b && c < d">'
      ]

      for (const s of samples) {
        const tokens = tokenizeXmlTextSegment(s)
        const joined = tokens.map(t => t.value).join('')
        expect(joined).toBe(s)
      }
    })

    it('handles startInsideTag when segment continues an open tag', () => {
      const seg1 = tokenizeXmlTextSegment('<user id="', false)
      expect(seg1.endsInsideTag).toBe(true)

      const seg2 = tokenizeXmlTextSegment('" active="true">', true)
      expect(seg2.endsInsideTag).toBe(false)
      expect(seg2.some(t => t.type === 'attr-name' && t.value === 'active')).toBe(true)
      expect(seg2.some(t => t.type === 'attr-value' && t.value === '"true"')).toBe(true)
      expect(seg2.map(t => t.value).join('')).toBe('" active="true">')
    })

    it('maps token types to correct Tailwind classes', () => {
      expect(xmlTokenClass('tag-name')).toBe('text-sky-300')
      expect(xmlTokenClass('attr-name')).toBe('text-amber-300')
      expect(xmlTokenClass('attr-value')).toBe('text-emerald-300')
      expect(xmlTokenClass('punctuation')).toBe('text-text-secondary')
      expect(xmlTokenClass('comment')).toBe('text-text-muted italic')
      expect(xmlTokenClass('cdata')).toBe('text-purple-300')
      expect(xmlTokenClass('plain')).toBe('')
    })
  })
})
