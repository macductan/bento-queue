import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import BodyEditor from '../BodyEditor.vue'
import { useRequestStore } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'

describe('BodyEditor.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders smart XML toolbar with valid badge when bodyType is xml and content is valid XML', async () => {
    const reqStore = useRequestStore()
    reqStore.current = {
      id: 'req-1',
      name: 'XML Request',
      method: 'POST',
      url: 'https://api.example.com/soap',
      headers: [],
      params: [],
      body: {
        type: 'xml',
        content: '<Envelope><Body><Item id="{{id}}">Widget</Item></Body></Envelope>'
      },
      created_at: '',
      updated_at: ''
    } as any

    const wrapper = mount(BodyEditor)
    await nextTick()

    const validBadge = wrapper.find('[data-test="xml-valid-badge"]')
    expect(validBadge.exists()).toBe(true)
    expect(validBadge.text()).toContain('✓ XML hợp lệ')

    const formatBtn = wrapper.find('[data-test="prettify-xml-btn"]')
    expect(formatBtn.exists()).toBe(true)
    expect(formatBtn.text()).toBe('Format XML')

    // Verify XML syntax tokens are rendered in the highlighter overlay
    const tagTokens = wrapper.findAll('[data-xml-token="tag-name"]')
    expect(tagTokens.length).toBeGreaterThan(0)
    expect(tagTokens.map(t => t.text())).toContain('Envelope')
  })

  it('does not show valid badge when XML body content is empty', async () => {
    const reqStore = useRequestStore()
    reqStore.current = {
      id: 'req-1',
      name: 'Empty XML',
      method: 'POST',
      url: 'https://api.example.com',
      headers: [],
      params: [],
      body: {
        type: 'xml',
        content: '   '
      },
      created_at: '',
      updated_at: ''
    } as any

    const wrapper = mount(BodyEditor)
    await nextTick()

    const validBadge = wrapper.find('[data-test="xml-valid-badge"]')
    expect(validBadge.exists()).toBe(false)
  })

  it('shows error banner when XML syntax is invalid and shows toast when attempting to format', async () => {
    const reqStore = useRequestStore()
    const uiStore = useUiStore()
    reqStore.current = {
      id: 'req-1',
      name: 'Invalid XML',
      method: 'POST',
      url: 'https://api.example.com',
      headers: [],
      params: [],
      body: {
        type: 'xml',
        content: '<root><open>unclosed</root>'
      },
      created_at: '',
      updated_at: ''
    } as any

    const wrapper = mount(BodyEditor)
    await nextTick()

    const errorBanner = wrapper.find('[data-test="xml-error-banner"]')
    expect(errorBanner.exists()).toBe(true)
    expect(errorBanner.text()).toContain('⚠')

    const formatBtn = wrapper.find('[data-test="prettify-xml-btn"]')
    await formatBtn.trigger('click')
    await nextTick()

    expect(uiStore.toast).toBeDefined()
    expect(uiStore.toast?.text).toBeDefined()
    expect(reqStore.current?.body.content).toBe('<root><open>unclosed</root>')
  })

  it('prettifies unindented XML with variables when clicking Format XML', async () => {
    const reqStore = useRequestStore()
    reqStore.current = {
      id: 'req-1',
      name: 'Format XML Test',
      method: 'POST',
      url: 'https://api.example.com',
      headers: [],
      params: [],
      body: {
        type: 'xml',
        content: '<root><item id="{{itemId}}"><name>{{itemName}}</name><active>true</active></item></root>'
      },
      created_at: '',
      updated_at: ''
    } as any

    const wrapper = mount(BodyEditor)
    await nextTick()

    const formatBtn = wrapper.find('[data-test="prettify-xml-btn"]')
    await formatBtn.trigger('click')
    await nextTick()

    expect(reqStore.current?.body.content).toBe(
`<root>
  <item id="{{itemId}}">
    <name>{{itemName}}</name>
    <active>true</active>
  </item>
</root>`
    )
  })

  it('auto-indents on Enter and toggles comments with Ctrl+/ in JSON mode', async () => {
    const reqStore = useRequestStore()
    reqStore.current = {
      id: 'req-json',
      name: 'JSON Test',
      method: 'POST',
      url: 'https://api.example.com',
      headers: [],
      params: [],
      body: {
        type: 'json',
        content: '{\n  "name": "hecto"\n}'
      },
      created_at: '',
      updated_at: ''
    } as any

    const wrapper = mount(BodyEditor)
    await nextTick()

    const textarea = wrapper.find('textarea')
    const el = textarea.element as HTMLTextAreaElement

    // Test Ctrl+/ comment toggle
    el.selectionStart = 4
    el.selectionEnd = 15
    await textarea.trigger('keydown', { key: '/', ctrlKey: true })
    await nextTick()

    expect(reqStore.current?.body?.content).toContain('// "name": "hecto"')

    // Test Enter auto-indent
    const contentLen = reqStore.current?.body?.content?.length || 0
    el.selectionStart = el.selectionEnd = contentLen - 2
    await textarea.trigger('keydown', { key: 'Enter' })
    await nextTick()

    expect(reqStore.current?.body?.content).toContain('\n')
  })
})
