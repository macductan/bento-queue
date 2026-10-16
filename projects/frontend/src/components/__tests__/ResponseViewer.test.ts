import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ResponseViewer from '../ResponseViewer.vue'
import { useResponseStore } from '@/stores/responseStore'
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime'

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  ClipboardSetText: vi.fn().mockResolvedValue(true)
}))

describe('ResponseViewer.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
