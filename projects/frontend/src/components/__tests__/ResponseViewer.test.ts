import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ResponseViewer from '../ResponseViewer.vue'
import { useResponseStore } from '@/stores/responseStore'
import { useUiStore } from '@/stores/uiStore'
import { formatJsonHtml, highlightHtmlWithSearch, decodeHtmlEntities } from '@/utils/jsonHighlight'
import { formatXmlHtml } from '@/utils/xmlUtils'
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime'

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  ClipboardSetText: vi.fn().mockResolvedValue(true)
}))

describe('ResponseViewer.vue', () => {
  beforeEach(() => {
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

  it('renders line number gutter with h-fit min-h-full and min-w-[48px] w-fit in JsonViewer Pretty mode', async () => {
    const store = useResponseStore()
    store.response = sampleJsonResponse as any

    const wrapper = mount(ResponseViewer)
    await nextTick()

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
})

function jsonJsonOrHtml(s: string): string {
  return s
}
