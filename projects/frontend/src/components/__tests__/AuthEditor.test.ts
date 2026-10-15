import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AuthEditor from '../AuthEditor.vue'
import type { AuthConfig, TreeNode } from '@/stores/collectionStore'

describe('AuthEditor.vue', () => {
  it('renders type selector with 5 options', () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'inherit' }
      }
    })

    const select = wrapper.find('select#auth-type-select')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option')
    expect(options.length).toBe(5)
    expect(options.map(o => o.attributes('value'))).toEqual([
      'inherit',
      'none',
      'bearer',
      'basic',
      'apiKey'
    ])
  })

  it('displays empty ancestor notice when inherit is selected and no ancestors have auth', () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'inherit' },
        pathNodes: []
      }
    })

    expect(wrapper.text()).toContain('No authentication inherited from parent.')
  })

  it('displays ancestor info when inherit is selected and parent folder has bearer auth', () => {
    const pathNodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Api Folder',
        type: 'folder',
        path: '/f1',
        auth: { type: 'bearer', bearer: { token: 'secret' } },
        created_at: ''
      }
    ]
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'inherit' },
        pathNodes
      }
    })

    expect(wrapper.text()).toContain('Inherited from:')
    expect(wrapper.text()).toContain('Api Folder (Folder 1)')
    expect(wrapper.text()).toContain('bearer')
  })

  it('renders token input when bearer mode is selected and emits update on input', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'bearer',
          bearer: { token: 'initial-token' }
        }
      }
    })

    const input = wrapper.find('input#bearer-token-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('initial-token')

    await input.setValue('updated-token')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastUpdate = emitted![emitted!.length - 1][0] as AuthConfig
    expect(lastUpdate.type).toBe('bearer')
    expect(lastUpdate.bearer?.token).toBe('updated-token')
  })

  it('renders username and password inputs for basic auth and emits update', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'basic',
          basic: { username: 'alice', password: 'secretpassword' }
        }
      }
    })

    const userInput = wrapper.find('input#basic-username-input')
    const passInput = wrapper.find('input#basic-password-input')
    expect(userInput.exists()).toBe(true)
    expect(passInput.exists()).toBe(true)

    await userInput.setValue('bob')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastUpdate = emitted![emitted!.length - 1][0] as AuthConfig
    expect(lastUpdate.type).toBe('basic')
    expect(lastUpdate.basic?.username).toBe('bob')
    expect(lastUpdate.basic?.password).toBe('secretpassword')
  })

  it('renders key, value, and addTo selector for apiKey mode and emits update', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'apiKey',
          apiKey: { key: 'X-App-Key', value: 'secret123', addTo: 'header' }
        }
      }
    })

    const keyInput = wrapper.find('input#api-key-name-input')
    const valInput = wrapper.find('input#api-key-val-input')
    const addSelect = wrapper.find('select#api-key-add-to-select')

    expect(keyInput.exists()).toBe(true)
    expect(valInput.exists()).toBe(true)
    expect(addSelect.exists()).toBe(true)

    await addSelect.setValue('query')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastUpdate = emitted![emitted!.length - 1][0] as AuthConfig
    expect(lastUpdate.type).toBe('apiKey')
    expect(lastUpdate.apiKey?.addTo).toBe('query')
  })

  it('switches mode and initializes sub-objects when changing select value', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'none' }
      }
    })

    const select = wrapper.find('select#auth-type-select')
    await select.setValue('bearer')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastUpdate = emitted![emitted!.length - 1][0] as AuthConfig
    expect(lastUpdate.type).toBe('bearer')
    expect(lastUpdate.bearer).toBeDefined()
    expect(lastUpdate.bearer?.token).toBe('')
  })

  it('updates password when typing into basic password input', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'basic', basic: { username: 'alice', password: 'old' } }
      }
    })
    const passInput = wrapper.find('input#basic-password-input')
    await passInput.setValue('new-pass')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0] as AuthConfig
    expect(last.basic?.username).toBe('alice')
    expect(last.basic?.password).toBe('new-pass')
  })

  it('updates key and value when typing into apiKey inputs', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'apiKey', apiKey: { key: 'k1', value: 'v1', addTo: 'header' } }
      }
    })
    const keyInput = wrapper.find('input#api-key-name-input')
    const valInput = wrapper.find('input#api-key-val-input')
    await keyInput.setValue('k2')
    let emitted = wrapper.emitted('update:modelValue')!
    await wrapper.setProps({ modelValue: emitted[emitted.length - 1][0] as AuthConfig })
    await valInput.setValue('v2')

    emitted = wrapper.emitted('update:modelValue')!
    const last = emitted[emitted.length - 1][0] as AuthConfig
    expect(last.apiKey?.key).toBe('k2')
    expect(last.apiKey?.value).toBe('v2')
  })

  it('displays warning when basic username contains a colon', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: { type: 'basic', basic: { username: 'domain:user', password: 'pwd' } }
      }
    })
    expect(wrapper.text()).toContain('RFC 7617')
  })

  it('displays correct label text when isFolder is true in none mode', () => {
    const wrapper = mount(AuthEditor, {
      props: { modelValue: { type: 'none' }, isFolder: true }
    })
    expect(wrapper.text()).toContain('folder')

    const reqWrapper = mount(AuthEditor, {
      props: { modelValue: { type: 'none' }, isFolder: false }
    })
    expect(reqWrapper.text()).toContain('request')
  })

  it('sanitizes stale credentials when switching modes', async () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'bearer',
          bearer: { token: 'super-secret' }
        }
      }
    })

    const select = wrapper.find('select#auth-type-select')
    await select.setValue('none')

    const emitted = wrapper.emitted('update:modelValue')
    const last = emitted![emitted!.length - 1][0] as AuthConfig
    expect(last.type).toBe('none')
    expect(last.bearer).toBeUndefined()
  })

  it('applies dark mode appearance-none and bg-surface-overlay classes to auth selects', () => {
    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'apiKey',
          apiKey: { key: 'X-Key', value: '123', addTo: 'header' }
        }
      }
    })

    const typeSelect = wrapper.find('select#auth-type-select')
    const addToSelect = wrapper.find('select#api-key-add-to-select')

    expect(typeSelect.classes()).toContain('appearance-none')
    expect(typeSelect.classes()).toContain('bg-surface-overlay')
    expect(addToSelect.classes()).toContain('appearance-none')
    expect(addToSelect.classes()).toContain('bg-surface-overlay')
  })

  it('keeps visibility toggled on (type="text") while typing consecutive characters and only resets when switching active request or folder', async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const { nextTick } = await import('vue')

    setActivePinia(createPinia())
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'

    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'bearer',
          bearer: { token: 'm' }
        }
      }
    })

    const input = wrapper.find('input#bearer-token-input')
    expect(input.attributes('type')).toBe('password')
    expect(input.classes()).toContain('text-text-primary')

    // Click eye button to show token
    const toggleBtn = wrapper.find('button[aria-label="Toggle token visibility"]')
    await toggleBtn.trigger('click')
    expect(input.attributes('type')).toBe('text')

    // Simulate typing character by character with parent v-model updates
    for (const val of ['my', 'my-', 'my-secret', 'my-secret-123']) {
      await input.setValue(val)
      const emitted = wrapper.emitted('update:modelValue')!
      await wrapper.setProps({ modelValue: emitted[emitted.length - 1][0] as AuthConfig })
      await nextTick()
      expect(input.attributes('type')).toBe('text')
    }

    // Switching to another folder resets visibility back to password
    colStore.activeFolderId = 'folder-2'
    await nextTick()
    expect(input.attributes('type')).toBe('password')
  })

  it('highlights {{variable}} across Bearer Token, Basic Username/Password, and API Key Value without remounting input and opens VariableHoverPopover with 4-tier hierarchy', async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const { computed, nextTick } = await import('vue')
    const { vi } = await import('vitest')

    vi.useFakeTimers()
    setActivePinia(createPinia())

    const colStore = useCollectionStore()
    colStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        variables: [{ key: 'coll_token', value: 'from-coll', enabled: true }]
      } as any
    ]
    colStore.activeCollectionId = 'Test-Collection'

    const envStore = useEnvironmentStore()
    envStore.environments = [
      {
        id: 'env-dev',
        name: 'Dev',
        variables: [{ key: 'env_user', value: 'dev-alice', enabled: true }]
      } as any
    ]
    envStore.activeEnvId = 'env-dev'

    const hierarchyFolders = [
      {
        id: 'parent-f',
        name: 'Parent Folder',
        variables: [{ key: 'folder_pass', value: 'p-secret', enabled: true }]
      },
      {
        id: 'current-f',
        name: 'Current Folder',
        variables: [{ key: 'bearer_token', value: 'jwt-123', enabled: true }]
      }
    ]

    const effectiveVars = computed(() => new Map<string, string>([
      ['coll_token', 'from-coll'],
      ['env_user', 'dev-alice'],
      ['folder_pass', 'p-secret'],
      ['bearer_token', 'jwt-123']
    ]))

    const wrapper = mount(AuthEditor, {
      props: {
        modelValue: {
          type: 'bearer',
          bearer: { token: 'static-secret' }
        }
      },
      global: {
        provide: {
          effectiveVariables: effectiveVars,
          variableHierarchyFolders: computed(() => hierarchyFolders)
        }
      },
      attachTo: document.body
    })

    try {
      const bearerInput = wrapper.find('input#bearer-token-input')
      const originalBearerEl = bearerInput.element
      // Static secret with showBearerToken=null -> type="password" and overlay hidden
      expect(bearerInput.attributes('type')).toBe('password')
      expect(bearerInput.classes()).toContain('text-text-primary')

      // Typing '{{' progressively switches to type="text" immediately without remounting input
      await wrapper.setProps({
        modelValue: {
          type: 'bearer',
          bearer: { token: '{{' }
        }
      })
      await nextTick()
      expect(wrapper.find('input#bearer-token-input').element).toBe(originalBearerEl)
      expect(bearerInput.attributes('type')).toBe('text')

      // Update to full variable syntax
      await wrapper.setProps({
        modelValue: {
          type: 'bearer',
          bearer: { token: '{{bearer_token}} {{missing_token}}' }
        }
      })
      await nextTick()

      expect(wrapper.find('input#bearer-token-input').element).toBe(originalBearerEl)
      expect(bearerInput.attributes('type')).toBe('text')
      expect(wrapper.find('span.text-variable-valid').text()).toBe('{{bearer_token}}')
      expect(wrapper.find('span.italic.text-variable-missing').text()).toBe('{{missing_token}}')

      // Clicking eye toggle button can hide and re-show a value containing {{...}}
      const toggleBtn = wrapper.find('button[aria-label="Toggle token visibility"]')
      expect(toggleBtn.attributes('title')).toBe('Hide token')
      await toggleBtn.trigger('click')
      expect(bearerInput.attributes('type')).toBe('password')
      expect(toggleBtn.attributes('title')).toBe('Show token')
      await toggleBtn.trigger('click')
      expect(bearerInput.attributes('type')).toBe('text')
      expect(toggleBtn.attributes('title')).toBe('Hide token')

      // Hover over {{bearer_token}} to open VariableHoverPopover with 4-tier hierarchy
      const validSpan = wrapper.find('span.text-variable-valid')
      await validSpan.trigger('mousemove')
      await vi.advanceTimersByTimeAsync(200)
      await nextTick()

      const popover = document.body.querySelector('[data-test="variable-hover-popover"]')
      expect(popover).not.toBeNull()
      expect(popover?.textContent).toContain('Folder: Current Folder (Dùng chung)')
      expect(popover?.textContent).toContain('Folder: Parent Folder (Dùng chung)')

      // Switch to Basic Auth and verify Username & Password variable highlighting
      await wrapper.setProps({
        modelValue: {
          type: 'basic',
          basic: { username: '{{env_user}}', password: '{{folder_pass}}' }
        }
      })
      await nextTick()
      expect(wrapper.find('input#basic-password-input').attributes('type')).toBe('text')
      const basicValidSpans = wrapper.findAll('span.text-variable-valid')
      expect(basicValidSpans.map(s => s.text())).toEqual(['{{env_user}}', '{{folder_pass}}'])

      // Switch to API Key and verify Key input stays plain text-text-primary while Value highlights variables
      await wrapper.setProps({
        modelValue: {
          type: 'apiKey',
          apiKey: { key: 'X-API-Key', value: '{{coll_token}}', addTo: 'header' }
        }
      })
      await nextTick()
      const apiKeyNameInput = wrapper.find('input#api-key-name-input')
      expect(apiKeyNameInput.classes()).toContain('text-text-primary')
      expect(apiKeyNameInput.classes()).not.toContain('text-transparent')
      expect(wrapper.find('input#api-key-val-input').attributes('type')).toBe('text')
      expect(wrapper.find('span.text-variable-valid').text()).toBe('{{coll_token}}')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })
})


