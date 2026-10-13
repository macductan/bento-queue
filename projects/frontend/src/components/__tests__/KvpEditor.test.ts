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

  it('should render VariableHighlighter for both Key and Value columns', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

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

    // VariableHighlighter in Key column should highlight {{my_key}} as resolved (green/sky)
    const validSpan = wrapper.find('span.text-variable-valid')
    expect(validSpan.exists()).toBe(true)
    expect(validSpan.text()).toBe('{{my_key}}')

    // VariableHighlighter in Value column should highlight {{my_val}} as missing (italic red)
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
})
