import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, config } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CollectionEnvModal from '../CollectionEnvModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'

config.global.stubs = {
  teleport: true
}

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  UpdateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

describe('CollectionEnvModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders modal when modelValue is true and displays collection name', () => {
    const store = useCollectionStore()
    store.collections = [
      {
        id: 'col-1',
        name: 'My API Collection',
        is_default: false,
        is_active: true,
        variables: [
          { key: 'collHost', value: 'api.mycorp.com', enabled: true }
        ]
      } as any
    ]

    const wrapper = mount(CollectionEnvModal, {
      props: {
        modelValue: true,
        collectionId: 'col-1'
      }
    })

    expect(wrapper.text()).toContain('Biến môi trường Collection (Collection Env)')
    expect(wrapper.text()).toContain('My API Collection')
  })

  it('reactively populates variables when targetCollection becomes available', async () => {
    const store = useCollectionStore()
    store.collections = []

    const wrapper = mount(CollectionEnvModal, {
      props: {
        modelValue: true,
        collectionId: 'col-async'
      }
    })

    // Collections finish loading after modal is mounted
    store.collections = [
      {
        id: 'col-async',
        name: 'Async Collection',
        is_default: false,
        is_active: true,
        variables: [
          { key: 'asyncKey', value: 'asyncVal', enabled: true }
        ]
      } as any
    ]
    await wrapper.vm.$nextTick()

    const kvp = wrapper.findComponent({ name: 'KvpEditor' })
    expect(kvp.exists()).toBe(true)
    expect(kvp.props('modelValue')).toEqual([
      { key: 'asyncKey', value: 'asyncVal', enabled: true }
    ])
  })

  it('calls updateCollectionVariables and closes modal on save', async () => {
    const store = useCollectionStore()
    const updateSpy = vi.spyOn(store, 'updateCollectionVariables').mockResolvedValue(true)
    const uiStore = useUiStore()
    const toastSpy = vi.spyOn(uiStore, 'showToast')

    store.collections = [
      {
        id: 'col-1',
        name: 'My API Collection',
        is_default: false,
        is_active: true,
        variables: [
          { key: 'port', value: '8080', enabled: true }
        ]
      } as any
    ]

    const wrapper = mount(CollectionEnvModal, {
      props: {
        modelValue: true,
        collectionId: 'col-1'
      }
    })

    const saveBtn = wrapper.find('[data-test="save-collection-env-btn"]')
    expect(saveBtn.exists()).toBe(true)

    await saveBtn.trigger('click')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith('col-1', [
      { key: 'port', value: '8080', enabled: true }
    ])
    expect(toastSpy).toHaveBeenCalledWith('Đã lưu biến collection')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('closes on Escape key and Cancel button', async () => {
    const wrapper = mount(CollectionEnvModal, {
      props: {
        modelValue: true,
        collectionId: 'col-1'
      }
    })

    // Cancel button click
    const cancelBtn = wrapper.findAll('button').find(b => b.text().includes('Hủy'))
    expect(cancelBtn?.exists()).toBe(true)
    await cancelBtn?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])

    // Global Escape key
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('supports configuring collection global and environment-scoped auth in Auth tab', async () => {
    const store = useCollectionStore()
    const updateSpy = vi.spyOn(store, 'updateCollectionVariables').mockResolvedValue(true)
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-prod', name: 'Production', variables: [], created_at: '', updated_at: '' } as any
    ]

    store.collections = [
      {
        id: 'col-auth',
        name: 'Auth Collection',
        is_default: false,
        is_active: true,
        variables: []
      } as any
    ]

    const wrapper = mount(CollectionEnvModal, {
      props: {
        modelValue: true,
        collectionId: 'col-auth'
      }
    })

    const authTabBtn = wrapper.find('[data-test="collection-modal-tab-auth"]')
    expect(authTabBtn.exists()).toBe(true)
    await authTabBtn.trigger('click')

    // Select Bearer Token for Global Auth
    const authTypeSelect = wrapper.find('#auth-type-select')
    await authTypeSelect.setValue('bearer')
    const tokenInput = wrapper.find('#bearer-token-input')
    await tokenInput.setValue('global-coll-token')

    // Switch scope to Production environment
    const scopeSelect = wrapper.find('[data-test="auth-env-scope-select"]')
    expect(scopeSelect.exists()).toBe(true)
    await scopeSelect.setValue('env-prod')

    await wrapper.find('#auth-type-select').setValue('bearer')
    await wrapper.find('#bearer-token-input').setValue('prod-coll-token')

    const saveBtn = wrapper.find('[data-test="save-collection-env-btn"]')
    await saveBtn.trigger('click')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith(
      'col-auth',
      [],
      expect.objectContaining({
        type: 'bearer',
        bearer: { token: 'global-coll-token' }
      }),
      expect.objectContaining({
        'env-prod': expect.objectContaining({
          type: 'bearer',
          bearer: { token: 'prod-coll-token' }
        })
      })
    )
  })
})
