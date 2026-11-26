import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ResponseViewer from '../ResponseViewer.vue'
import JsonViewer from '../JsonViewer.vue'
import { useResponseStore } from '@/stores/responseStore'
import { RESPONSE_WORD_WRAP_STORAGE_KEY, useUiStore } from '@/stores/uiStore'
import { formatJsonHtml, highlightHtmlWithSearch, decodeHtmlEntities, splitHtmlLinesSafe } from '@/utils/jsonHighlight'
import { formatXmlHtml } from '@/utils/xmlUtils'
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime'

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  ClipboardSetText: vi.fn().mockResolvedValue(true)
}))

describe('ResponseViewer.vue', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useUiStore().setLocale('vi')
    vi.clearAllMocks()
  })

  const sampleXmlResponse = {
    request_id: 'req-1',
    status_code: 200,
    status_text: 'OK',
    time_ms: 120,
    size_bytes: 145,
    timestamp: '2026-10-16T10:00:00Z',
    headers: {
      'content-type': ['application/xml; charset=utf-8']
    },
    body: '<root><item id="1"><name>Item 1</name></item></root>',
    is_binary: false,
    truncated: false
  }

  const sampleJsonResponse = {
    request_id: 'req-2',
    status_code: 200,
    status_text: 'OK',
    time_ms: 95,
    size_bytes: 80,
    timestamp: '2026-10-16T10:00:00Z',
    headers: {
      'content-type': ['application/json']
    },
    body: '{"status":"ok","count":42}',
    is_binary: false,
    truncated: false
  }

  it('renders tabs and ResponseMetaBar on top line, and moves Pretty/Raw and Copy to sub-toolbar in Body tab', async () => {
    const store = useResponseStore()
    store.response = sampleJsonResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    // Main top row contains tabs and meta bar
    const topBar = wrapper.find('.h-10.border-b')
    expect(topBar.exists()).toBe(true)
    expect(topBar.find('[role="tablist"]').exists()).toBe(true)
    expect(topBar.findComponent({ name: 'ResponseMetaBar' }).exists()).toBe(true)

    // Sub-toolbar below tab row contains Pretty/Raw and Copy
    const subToolbar = wrapper.find('[data-test="response-body-subtoolbar"]')
    expect(subToolbar.exists()).toBe(true)
    expect(subToolbar.find('[role="radiogroup"]').exists()).toBe(true)
    expect(subToolbar.text()).toContain('Pretty')
    expect(subToolbar.text()).toContain('Raw')
    expect(subToolbar.text()).toContain('Sao chép')

    // Switch to Headers tab -> sub-toolbar is not shown
    const headersTab = wrapper.find('#tab-headers')
    await headersTab.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="response-body-subtoolbar"]').exists()).toBe(false)
  })

  it('auto-selects Pretty mode for XML response with XML Content-Type and valid body', async () => {
    const store = useResponseStore()
    store.response = sampleXmlResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.mode).toBe('pretty')
    expect(vm.canBePretty).toBe(true)

    const prettyRadio = wrapper.find('[data-test="response-body-subtoolbar"] button[role="radio"][aria-checked="true"]')
    expect(prettyRadio.text()).toBe('Pretty')

    // In Pretty mode, JsonViewer formats XML with syntax highlighting
    const jsonViewer = wrapper.findComponent({ name: 'JsonViewer' })
    expect(jsonViewer.exists()).toBe(true)
    expect(jsonViewer.props('mode')).toBe('pretty')
    expect(jsonViewer.html()).toContain('text-sky-300') // tag name color
  })

  it('copies formatted XML when clicking Sao chép in Pretty mode', async () => {
    const store = useResponseStore()
    store.response = sampleXmlResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    const copyBtn = wrapper.find('[data-test="copy-response-btn"]')
    expect(copyBtn.exists()).toBe(true)
    await copyBtn.trigger('click')
    await flushPromises()

    expect(ClipboardSetText).toHaveBeenCalledWith(
`<root>
  <item id="1">
    <name>Item 1</name>
  </item>
</root>`
    )
  })

  it('copies raw XML when mode is toggled to Raw', async () => {
    const store = useResponseStore()
    store.response = sampleXmlResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    // Switch to Raw mode
    const rawRadio = wrapper.findAll('[data-test="response-body-subtoolbar"] button[role="radio"]')[1]
    await rawRadio.trigger('click')
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.mode).toBe('raw')

    const copyBtn = wrapper.find('[data-test="copy-response-btn"]')
    await copyBtn.trigger('click')
    await flushPromises()

    expect(ClipboardSetText).toHaveBeenCalledWith(sampleXmlResponse.body)
  })

  it('disables Pretty button when body is neither valid JSON nor valid XML', async () => {
    const store = useResponseStore()
    store.response = {
      ...sampleXmlResponse,
      headers: { 'content-type': ['text/plain'] },
      body: 'this is not xml or json <unclosed'
    } as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.canBePretty).toBe(false)
    expect(vm.mode).toBe('raw')

    const prettyRadio = wrapper.find('[data-test="response-body-subtoolbar"] button[role="radio"][aria-checked="false"]')
    expect(prettyRadio.attributes('disabled')).toBeDefined()
  })

  it('copies formatted JSON when clicking Sao chép in Pretty mode', async () => {
    const store = useResponseStore()
    store.response = sampleJsonResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    const copyBtn = wrapper.find('[data-test="copy-response-btn"]')
    expect(copyBtn.exists()).toBe(true)
    await copyBtn.trigger('click')
    await flushPromises()

    expect(ClipboardSetText).toHaveBeenCalledWith(
`{
  "status": "ok",
  "count": 42
}`
    )
  })

  it('enables word wrap by default in Pretty and Raw modes, and restores sticky line number gutter when toggled OFF', async () => {
    const store = useResponseStore()
    store.response = sampleJsonResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

    const wrapBtn = wrapper.find('[data-test="toggle-response-wrap-btn"]')
    const searchBtn = wrapper.find('[data-test="toggle-response-search-btn"]')
    const copyBtn = wrapper.find('[data-test="copy-response-btn"]')
    const subToolbar = wrapper.find('[data-test="response-body-subtoolbar"]')
    expect(subToolbar.classes()).toContain('flex-wrap')
    expect(subToolbar.classes()).toContain('gap-2')
    expect(wrapBtn.exists()).toBe(true)
    expect(wrapBtn.attributes('aria-pressed')).toBe('true')
    expect(wrapBtn.classes()).toContain('whitespace-nowrap')
    expect(wrapBtn.classes()).toContain('shrink-0')
    expect(searchBtn.classes()).toContain('whitespace-nowrap')
    expect(searchBtn.classes()).toContain('shrink-0')
    expect(copyBtn.classes()).toContain('whitespace-nowrap')
    expect(copyBtn.classes()).toContain('shrink-0')

    // Pretty mode defaults to independent flex row layout per line with gutter filler, 17px gutter padding+border, and no scroll-pl-14
    const prettyWrapped = wrapper.find('[data-test="json-viewer-pretty-wrapped"]')
    expect(prettyWrapped.exists()).toBe(true)
    expect(prettyWrapped.classes()).toContain('shrink-0')
    expect(prettyWrapped.element.parentElement?.getAttribute('style')).toContain('calc(2ch + 17px)')
    const filler = wrapper.find('[data-test="json-viewer-gutter-filler"]')
    expect(filler.exists()).toBe(true)
    expect(filler.attributes('style')).toContain('width: var(--gutter-w)')
    expect(wrapper.find('[data-test="json-viewer-gutter"]').exists()).toBe(false)
    const lineRows = prettyWrapped.findAll('[data-json-line]')
    expect(lineRows.length).toBeGreaterThan(0)
    expect(lineRows[0].classes()).toContain('flex')
    expect(lineRows[0].classes()).toContain('items-stretch')
    expect(lineRows[0].classes()).toContain('w-full')
    expect(prettyWrapped.html()).toContain('min-h-[21px]')
    expect(prettyWrapped.html()).toContain('whitespace-pre-wrap')
    expect(prettyWrapped.html()).toContain('[overflow-wrap:anywhere]')
    expect(prettyWrapped.element.parentElement?.className).toContain('flex-col')
    expect(prettyWrapped.element.parentElement?.className).toContain('overflow-x-hidden')
    expect(prettyWrapped.element.parentElement?.className).not.toContain('flex-row')
    expect(prettyWrapped.element.parentElement?.className).not.toContain('scroll-pl-14')

    // Switch to Raw mode while wrap is ON -> uses whitespace-pre-wrap
    const rawRadio = wrapper.findAll('[data-test="response-body-subtoolbar"] button[role="radio"]')[1]
    await rawRadio.trigger('click')
    await nextTick()
    const rawPre = wrapper.findAll('pre').find(p => p.text().includes('"status"'))!
    expect(rawPre.classes()).toContain('whitespace-pre-wrap')
    expect(rawPre.classes()).not.toContain('whitespace-pre')

    // Toggle Wrap OFF -> persists to localStorage and switches Raw to whitespace-pre
    await wrapBtn.trigger('click')
    await nextTick()
    expect(wrapBtn.attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem(RESPONSE_WORD_WRAP_STORAGE_KEY)).toBe('false')
    expect(rawPre.classes()).toContain('whitespace-pre')
    expect(rawPre.classes()).not.toContain('whitespace-pre-wrap')

    // Switch back to Pretty mode while wrap is OFF -> restores sticky gutter + whitespace-pre
    const prettyRadio = wrapper.findAll('[data-test="response-body-subtoolbar"] button[role="radio"]')[0]
    await prettyRadio.trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="json-viewer-pretty-wrapped"]').exists()).toBe(false)
    const gutter = wrapper.find('[data-test="json-viewer-gutter"]')
    expect(gutter.exists()).toBe(true)
    const classes = gutter.classes()
    expect(classes).toContain('sticky')
    expect(classes).toContain('left-0')
    expect(classes).toContain('z-10')
    expect(classes).toContain('bg-[#090d15]')
    expect(classes).toContain('border-r')
    expect(classes).toContain('h-fit')
    expect(classes).toContain('min-h-full')
    expect(classes).toContain('min-w-[48px]')
    expect(classes).toContain('w-fit')
  })

  it('toggles search bar via Tìm kiếm button and Ctrl+F / Cmd+F, highlights matches in Pretty and Raw modes, and navigates Prev/Next', async () => {
    const store = useResponseStore()
    store.response = {
      ...sampleJsonResponse,
      body: '{"status":"ok","secondary_status":"OK","status_note":"status check"}'
    } as any

    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollIntoViewMock = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    const wrapper = mount(ResponseViewer, { attachTo: document.body })
    try {
      await nextTick()

      const searchToggleBtn = wrapper.find('[data-test="toggle-response-search-btn"]')
      expect(searchToggleBtn.exists()).toBe(true)
      expect(searchToggleBtn.text()).toContain('Tìm kiếm')
      expect(searchToggleBtn.attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(false)

      // Click Tìm kiếm button to open search bar and click again to toggle closed
      await searchToggleBtn.trigger('click')
      await nextTick()
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(true)
      expect(searchToggleBtn.attributes('aria-pressed')).toBe('true')

      await searchToggleBtn.trigger('click')
      await nextTick()
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(false)
      expect(searchToggleBtn.attributes('aria-pressed')).toBe('false')

      // Switch to Headers tab, then trigger Ctrl+F on window -> switches back to Body tab and opens search
      await wrapper.find('#tab-headers').trigger('click')
      await nextTick()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true }))
      await nextTick()

      expect(wrapper.find('#tab-body').attributes('aria-selected')).toBe('true')
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="toggle-response-search-btn"]').attributes('aria-pressed')).toBe('true')

      const searchInput = wrapper.find('[data-test="response-search-input"]')
      expect(searchInput.exists()).toBe(true)
      expect(document.activeElement).toBe(searchInput.element)

      // Search for "ok" (case-insensitive by default -> matches "ok" and "OK")
      await searchInput.setValue('ok')
      await nextTick()

      const countEl = wrapper.find('[data-test="response-search-count"]')
      expect(countEl.text()).toBe('1/2')

      let marks = wrapper.findAll('mark[data-search-match="true"]')
      expect(marks.length).toBe(2)
      expect(marks[0].attributes('data-active-match')).toBe('true')
      expect(marks[1].attributes('data-active-match')).toBeUndefined()
      expect(scrollIntoViewMock).toHaveBeenCalled()

      // Navigate Next via Enter key
      scrollIntoViewMock.mockClear()
      await searchInput.trigger('keydown', { key: 'Enter' })
      await nextTick()
      expect(countEl.text()).toBe('2/2')
      marks = wrapper.findAll('mark[data-search-match="true"]')
      expect(marks[0].attributes('data-active-match')).toBeUndefined()
      expect(marks[1].attributes('data-active-match')).toBe('true')
      expect(scrollIntoViewMock).toHaveBeenCalled()

      // Navigate Next button wraps around to 1/2
      await wrapper.find('[data-test="response-search-next-btn"]').trigger('click')
      await nextTick()
      expect(countEl.text()).toBe('1/2')

      // Navigate Prev button wraps back to 2/2, then Shift+Enter goes back to 1/2
      await wrapper.find('[data-test="response-search-prev-btn"]').trigger('click')
      await nextTick()
      expect(countEl.text()).toBe('2/2')

      await searchInput.trigger('keydown', { key: 'Enter', shiftKey: true })
      await nextTick()
      expect(countEl.text()).toBe('1/2')

      // Enable Case Sensitive (Aa) -> only "ok" matches (1/1)
      const caseBtn = wrapper.find('[data-test="response-search-case-btn"]')
      await caseBtn.trigger('click')
      await nextTick()
      expect(caseBtn.attributes('aria-pressed')).toBe('true')
      expect(countEl.text()).toBe('1/1')
      expect(wrapper.findAll('mark[data-search-match="true"]').length).toBe(1)

      // Switch to Raw mode -> still highlights in Raw mode
      const rawRadio = wrapper.findAll('[data-test="response-body-subtoolbar"] button[role="radio"]')[1]
      await rawRadio.trigger('click')
      await nextTick()
      expect(countEl.text()).toBe('1/1')
      const rawMarks = wrapper.findAll('mark[data-search-match="true"]')
      expect(rawMarks.length).toBe(1)
      expect(rawMarks[0].text()).toBe('ok')

      // Close search via Close button -> hides search bar and removes all highlights
      await wrapper.find('[data-test="response-search-close-btn"]').trigger('click')
      await nextTick()
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(false)
      expect(wrapper.findAll('mark[data-search-match="true"]').length).toBe(0)

      // Reopen via Ctrl+F on #panel-body and close via Escape key
      await wrapper.find('#panel-body').trigger('keydown', { key: 'f', ctrlKey: true })
      await nextTick()
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(true)
      await wrapper.find('[data-test="response-search-input"]').trigger('keydown', { key: 'Escape' })
      await nextTick()
      expect(wrapper.find('[data-test="response-search-bar"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('highlights cross-span matches, HTML entities, and Unicode characters without breaking JSON/XML syntax HTML', () => {
    expect(decodeHtmlEntities('&lt;tag attr=&quot;a &amp; &#39;b&#39;&quot;&gt;')).toBe('<tag attr="a & \'b\'">')

    const jsonHtml = formatJsonHtml('{"status":"ok","expr":"a < b & c > d"}').html
    const crossJson = highlightHtmlWithSearch(jsonJsonOrHtml(jsonHtml), '"status": "ok"', false, 0)
    expect(crossJson.matchCount).toBe(1)
    expect(crossJson.html).toContain('data-active-match="true"')
    expect(crossJson.html).toContain('<span class="text-syntax-key">')

    const entitySearch = highlightHtmlWithSearch(jsonHtml, 'a < b & c > d', false, 0)
    expect(entitySearch.matchCount).toBe(1)
    expect(entitySearch.html).toContain('a &lt; b &amp; c &gt; d</mark>')

    const xmlHtml = formatXmlHtml('<root><item id="1"><name>İzmir &amp; Co</name></item></root>').html
    const crossXml = highlightHtmlWithSearch(xmlHtml, '<item id="1">', false, 0)
    expect(crossXml.matchCount).toBe(1)
    expect(crossXml.html).toContain('text-sky-300')
    expect(crossXml.html).toContain('text-amber-300')

    const unicodeXml = highlightHtmlWithSearch(xmlHtml, 'Co', false, 0)
    expect(unicodeXml.matchCount).toBe(1)
    expect(unicodeXml.html).toContain('>Co</mark>')
  })

  it('splitHtmlLinesSafe splits HTML safely across spans, marks, void tags, empty strings, and lone <', () => {
    expect(splitHtmlLinesSafe('')).toEqual([''])

    expect(splitHtmlLinesSafe('<span class="k">line1\nline2</span>')).toEqual([
      '<span class="k">line1</span>',
      '<span class="k">line2</span>'
    ])

    expect(
      splitHtmlLinesSafe('<span class="outer"><mark data-active-match="true">a\nb</mark>\nc</span>')
    ).toEqual([
      '<span class="outer"><mark data-active-match="true">a</mark></span>',
      '<span class="outer"><mark data-active-match="true">b</mark></span>',
      '<span class="outer">c</span>'
    ])

    expect(splitHtmlLinesSafe('<span>a<br><hr/><img src="x"><wbr><input type="text"><col>\nb</span>')).toEqual([
      '<span>a<br><hr/><img src="x"><wbr><input type="text"><col></span>',
      '<span>b</span>'
    ])

    expect(splitHtmlLinesSafe('<span>a < b\nc</span>')).toEqual([
      '<span>a < b</span>',
      '<span>c</span>'
    ])

    expect(splitHtmlLinesSafe('<span class="k">line1\r\nline2\rline3</span>')).toEqual([
      '<span class="k">line1</span>',
      '<span class="k">line2</span>',
      '<span class="k">line3</span>'
    ])

    expect(splitHtmlLinesSafe('<div><span>unclosed')).toEqual([
      '<div><span>unclosed</span></div>'
    ])
  })

  it('avoids invalid gridTemplateRows and does not render extra line rows before Pretty mode renders', async () => {
    const viewer = mount(JsonViewer, {
      props: {
        response: sampleJsonResponse as any,
        mode: 'raw',
        wordWrap: true
      }
    })
    await nextTick()

    const wrapped = viewer.find('[data-test="json-viewer-pretty-wrapped"]')
    expect(wrapped.exists()).toBe(true)
    expect(wrapped.attributes('style')).not.toContain('repeat(0, auto)')
    expect(wrapped.findAll('[data-json-line]').length).toBe(0)
  })

  it('keeps search highlights and triggers scrollToActiveMatch when toggling wordWrap ON/OFF', async () => {
    const store = useResponseStore()
    store.response = {
      ...sampleJsonResponse,
      body: '{"alpha":"match_me","beta":"match_me"}'
    } as any

    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollIntoViewMock = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    const wrapper = mount(ResponseViewer, { attachTo: document.body })
    try {
      await nextTick()
      await wrapper.find('[data-test="toggle-response-search-btn"]').trigger('click')
      await nextTick()

      const searchInput = wrapper.find('[data-test="response-search-input"]')
      await searchInput.setValue('match_me')
      await nextTick()

      expect(wrapper.find('[data-test="response-search-count"]').text()).toBe('1/2')
      expect(wrapper.findAll('[data-test="json-viewer-pretty-wrapped"] mark[data-search-match="true"]').length).toBe(2)

      scrollIntoViewMock.mockClear()
      await wrapper.find('[data-test="toggle-response-wrap-btn"]').trigger('click')
      await nextTick()

      expect(wrapper.find('[data-test="response-search-count"]').text()).toBe('1/2')
      expect(wrapper.find('[data-test="json-viewer-gutter"]').exists()).toBe(true)
      expect(wrapper.findAll('mark[data-search-match="true"]').length).toBe(2)
      expect(scrollIntoViewMock).toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  it('renders execution-logs-table with table-fixed, colgroup, and wrapping http-log-detail-box', async () => {
    const wrapper = mount(ResponseViewer, {
      props: {
        overrideData: {
          executionLogs: [
            {
              id: 'log-1',
              timestamp: '2026-11-26T10:00:00.000Z',
              phase: 'http',
              level: 'info',
              message: 'GET https://example.com/' + 'a'.repeat(200),
              detail: {
                method: 'GET',
                url: 'https://example.com/' + 'b'.repeat(200),
                requestHeaders: [{ key: 'X-Long', value: 'c'.repeat(200) }],
                statusCode: 200,
                statusText: 'OK',
                timeMs: 42
              }
            }
          ]
        }
      }
    })
    await nextTick()

    await wrapper.find('[data-test="response-tab-logs"]').trigger('click')
    await nextTick()

    const table = wrapper.find('[data-test="execution-logs-table"]')
    expect(table.exists()).toBe(true)
    expect(table.classes()).toContain('table-fixed')
    expect(table.classes()).toContain('min-w-[480px]')
    expect(table.element.parentElement?.className).toContain('overflow-x-auto')

    const timestampCell = table.find('tbody tr td')
    expect(timestampCell.classes()).toContain('truncate')

    const cols = table.findAll('colgroup col')
    expect(cols.length).toBe(4)
    expect(cols[0].classes()).toContain('w-28')
    expect(cols[1].classes()).toContain('w-32')
    expect(cols[2].classes()).toContain('w-20')

    await wrapper.find('[data-test="toggle-http-log-detail-btn"]').trigger('click')
    await nextTick()

    const detailBox = wrapper.find('[data-test="http-log-detail-box"]')
    expect(detailBox.exists()).toBe(true)
    expect(detailBox.classes()).toContain('break-words')
    expect(detailBox.classes()).toContain('[overflow-wrap:anywhere]')
  })
})

function jsonJsonOrHtml(s: string): string {
  return s
}
