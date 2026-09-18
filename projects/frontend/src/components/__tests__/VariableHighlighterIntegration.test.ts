import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import UrlBar from '../UrlBar.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useRequestStore } from '@/stores/requestStore'
import { nextTick } from 'vue'

describe('VariableHighlighter Integration with UrlBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders text-variable-valid inside UrlBar when a valid variable is typed', async () => {
    const reqStore = useRequestStore()
    reqStore.current = {
      id: '1',
      name: 'Test Request',
      method: 'GET',
      url: 'https://api.example.com/',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '',
      updated_at: ''
    }

    const envStore = useEnvironmentStore()
    envStore.environments = [
      { 
        id: 'env1', 
        name: 'Test Env', 
        variables: [{ key: 'host', value: 'localhost', enabled: true }],
        created_at: '',
        updated_at: ''
      } as any
    ]
    envStore.activeEnvId = 'env1'

    const wrapper = mount(UrlBar)
    await nextTick()

    const input = wrapper.find('textarea')
    await input.setValue('https://api.example.com/{{host}}')

    const validSpan = wrapper.find('span.text-variable-valid')
    expect(validSpan.exists()).toBe(true)
    expect(validSpan.text()).toBe('{{host}}')
  })

  it('renders text-variable-missing inside UrlBar when an invalid variable is typed', async () => {
    const reqStore = useRequestStore()
    reqStore.current = {
      id: '1',
      name: 'Test Request',
      method: 'GET',
      url: 'https://api.example.com/',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '',
      updated_at: ''
    }

    const envStore = useEnvironmentStore()
    envStore.environments = []
    envStore.activeEnvId = null

    const wrapper = mount(UrlBar)
    await nextTick()

    const input = wrapper.find('textarea')
    await input.setValue('https://api.example.com/{{unknown}}')

    const missingSpan = wrapper.find('span.text-variable-missing')
    expect(missingSpan.exists()).toBe(true)
    expect(missingSpan.text()).toBe('{{unknown}}')
  })
})
