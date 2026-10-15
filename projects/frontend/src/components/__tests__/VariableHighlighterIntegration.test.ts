import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UrlBar from '../UrlBar.vue'
import RequestEditor from '../RequestEditor.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useRequestStore } from '@/stores/requestStore'
import { useCollectionStore } from '@/stores/collectionStore'
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

  it('populates ancestor folders in VariableHoverPopover via variableHierarchyFolders provided by RequestEditor', async () => {
    vi.useFakeTimers()
    try {
      const collectionStore = useCollectionStore()
      const envStore = useEnvironmentStore()
      const reqStore = useRequestStore()

      collectionStore.collections = [
        {
          id: 'coll-1',
          name: 'Test-Collection',
          variables: [{ key: 'base_url', value: 'https://collection.api', enabled: true }]
        } as any
      ]
      collectionStore.activeCollectionId = 'coll-1'

      envStore.environments = [
        {
          id: 'env-1',
          name: 'Dev',
          variables: [{ key: 'base_url', value: 'https://dev.api', enabled: true }],
          created_at: '',
          updated_at: ''
        } as any
      ]
      envStore.activeEnvId = 'env-1'

      collectionStore.tree = [
        {
          id: 'folder-parent',
          name: 'Parent Folder',
          type: 'folder',
          path: 'Parent Folder',
          created_at: '',
          variables: [{ key: 'base_url', value: 'https://parent.api', enabled: true }],
          children: [
            {
              id: 'folder-child',
              name: 'Child Folder',
              type: 'folder',
              path: 'Parent Folder/Child Folder',
              created_at: '',
              folder_envs: {
                'env-1': [{ key: 'base_url', value: 'https://child-dev.api', enabled: true }]
              },
              children: [
                {
                  id: 'req-1',
                  name: 'Get Items',
                  type: 'request',
                  path: 'Parent Folder/Child Folder/Get Items.json',
                  created_at: ''
                }
              ]
            }
          ]
        }
      ] as any

      reqStore.current = {
        id: 'req-1',
        name: 'Get Items',
        method: 'GET',
        url: '{{base_url}}/items',
        headers: [],
        params: [],
        body: { type: 'none', content: '' },
        auth: { type: 'inherit' },
        created_at: '',
        updated_at: ''
      }
      reqStore.original = { ...reqStore.current }

      const wrapper = mount(RequestEditor, {
        attachTo: document.body,
        global: {
          stubs: {
            RequestTabs: true,
            KvpEditor: true,
            BodyEditor: true,
            WarningBanner: true,
            DefaultHeadersTable: true,
            AuthEditor: true
          }
        }
      })
      await nextTick()

      const varSpan = wrapper.find('[data-var-name="base_url"]')
      expect(varSpan.exists()).toBe(true)

      const spanEl = varSpan.element as HTMLElement
      vi.spyOn(spanEl, 'getBoundingClientRect').mockReturnValue({
        left: 20,
        top: 20,
        right: 120,
        bottom: 42,
        width: 100,
        height: 22,
        x: 20,
        y: 20,
        toJSON: () => ({})
      })

      const textarea = wrapper.find('textarea')
      const rect = spanEl.getBoundingClientRect()
      await textarea.trigger('mousemove', {
        clientX: rect.left + 5,
        clientY: rect.top + 5
      })

      vi.advanceTimersByTime(160)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]')
      expect(popover).not.toBeNull()
      expect(popover?.textContent).toContain('Folder: Child Folder (Dev)')

      const selectEl = popover?.querySelector('[data-test="variable-scope-select"]') as HTMLSelectElement
      const optionTexts = Array.from(selectEl.options).map(o => o.text)
      expect(optionTexts).toEqual([
        'Folder: Child Folder (Dev)',
        'Folder: Child Folder (Dùng chung)',
        'Folder: Parent Folder (Dev)',
        'Folder: Parent Folder (Dùng chung)',
        'Global Env (Dev)',
        'Collection Env (Dùng chung)'
      ])

      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

