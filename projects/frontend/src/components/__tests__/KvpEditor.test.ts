import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import KvpEditor from '../KvpEditor.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useRequestStore, type Request } from '@/stores/requestStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { nextTick } from 'vue'

describe('KvpEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com',
    headers: [],
    params: [
      { key: '{{my_key}}', value: '{{my_val}}', enabled: true }
    ],
    body: { type: 'none', content: '' },
    created_at: '',
    updated_at: '',
    ...overrides
  })

  it('should render Key input with text-text-primary without VariableHighlighter while Value column highlights resolved and missing variables', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      params: [
        { key: 'Authorization', value: 'Bearer {{my_key}} {{my_val}}', enabled: true }
      ]
    })

    const envStore = useEnvironmentStore()
    envStore.environments = [
      {
        id: 'env-1',
        name: 'Dev',
        variables: [{ key: 'my_key', value: 'search', enabled: true }],
        created_at: '',
        updated_at: ''
      } as any
    ]
    envStore.activeEnvId = 'env-1'

    const wrapper = mount(KvpEditor, {
      props: {
        field: 'params'
      }
    })
    await nextTick()

    const keyInput = wrapper.find('input[placeholder="Key"]')
    expect(keyInput.exists()).toBe(true)
    expect(keyInput.classes()).toContain('text-text-primary')
    expect(keyInput.classes()).not.toContain('text-transparent')
    expect(keyInput.classes()).not.toContain('transparent-selection')
    expect((keyInput.element as HTMLInputElement).value).toBe('Authorization')

    // VariableHighlighter in Value column should highlight {{my_key}} as resolved and {{my_val}} as missing
    const validSpan = wrapper.find('span.text-variable-valid')
    expect(validSpan.exists()).toBe(true)
    expect(validSpan.text()).toBe('{{my_key}}')

    const missingSpan = wrapper.find('span.italic.text-variable-missing')
    expect(missingSpan.exists()).toBe(true)
    expect(missingSpan.text()).toBe('{{my_val}}')
  })

  it('should toggle enabled state when checkbox is clicked', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(KvpEditor, {
      props: {
        field: 'params'
      }
    })
    await nextTick()

    const checkbox = wrapper.find('button[role="checkbox"]')
    expect(checkbox.attributes('aria-checked')).toBe('true')

    await checkbox.trigger('click')
    expect(reqStore.current.params[0].enabled).toBe(false)
  })

  it('should remove row when delete button is clicked', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(KvpEditor, {
      props: {
        field: 'params'
      }
    })
    await nextTick()

    const deleteBtn = wrapper.find('button[aria-label="Xóa dòng"]')
    expect(deleteBtn.exists()).toBe(true)

    await deleteBtn.trigger('click')
    expect(reqStore.current.params.length).toBe(0)
  })

  it('should preserve DOM input identity and update value in real time during IME composition in phantom row', async () => {
    const model: { key: string; value: string; enabled: boolean }[] = []
    const wrapper = mount(KvpEditor, {
      props: {
        modelValue: model
      }
    })
    await nextTick()

    const firstKeyInput = wrapper.find('input[placeholder="Key"]')
    const originalDomEl = firstKeyInput.element

    // Start IME composition on phantom row
    await firstKeyInput.trigger('compositionstart')
    await nextTick()
    expect(model.length).toBe(1)

    // Type Vietnamese characters while composing
    ;(firstKeyInput.element as HTMLInputElement).value = 'tiếng'
    await firstKeyInput.trigger('input')
    await nextTick()

    // Ensure the exact same DOM input element is reused at index 0
    const inputsAfter = wrapper.findAll('input[placeholder="Key"]')
    expect(inputsAfter.length).toBe(2)
    expect(inputsAfter[0].element).toBe(originalDomEl)
    expect(model[0].key).toBe('tiếng')
  })

  it('should preserve textarea element identity during IME composition in Value column of phantom row', async () => {
    const model: { key: string; value: string; enabled: boolean }[] = []
    const wrapper = mount(KvpEditor, {
      props: {
        modelValue: model
      }
    })
    await nextTick()

    const firstValTextarea = wrapper.find('textarea[placeholder="Value"]')
    const originalTextareaEl = firstValTextarea.element

    await firstValTextarea.trigger('compositionstart')
    await nextTick()
    expect(model.length).toBe(1)

    ;(firstValTextarea.element as HTMLTextAreaElement).value = 'việt nam'
    await firstValTextarea.trigger('input')
    await nextTick()

    const textareasAfter = wrapper.findAll('textarea[placeholder="Value"]')
    expect(textareasAfter.length).toBe(2)
    expect(textareasAfter[0].element).toBe(originalTextareaEl)
    expect(model[0].value).toBe('việt nam')
  })

  it('synchronizes whitespace-pre-wrap and break-all on Value textarea to prevent caret offset', async () => {
    const wrapper = mount(KvpEditor, {
      props: {
        modelValue: [
          { key: 'wsdl_url', value: 'https://edev-ws.sanmar.com:8080/SanMarWebService/SanMarWebServicePort?wsdl', enabled: true }
        ]
      }
    })
    await nextTick()

    const textarea = wrapper.find('textarea[placeholder="Value"]')
    expect(textarea.exists()).toBe(true)
    expect(textarea.classes()).toContain('whitespace-pre-wrap')
    expect(textarea.classes()).toContain('break-all')
    expect(textarea.classes()).toContain('mono-sm')
  })
})


