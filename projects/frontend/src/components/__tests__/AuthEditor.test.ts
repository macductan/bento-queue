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
})
