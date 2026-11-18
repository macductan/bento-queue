import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SettingsModal from '../SettingsModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { model } from '../../../wailsjs/go/models'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionRoot: vi.fn().mockResolvedValue('/home/dev/.cache/hecto-api/collections'),
  SelectDirectoryDialog: vi.fn().mockResolvedValue('/new/path/collections'),
  UpdateCollectionRoot: vi.fn().mockResolvedValue({ success: true, data: {} }),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DuplicateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

const mockCollections: model.Collection[] = [
  new model.Collection({
    id: 'default',
    name: 'Default Collection',
    is_default: true,
    is_active: true
  }),
  new model.Collection({
    id: 'proj-b',
    name: 'Project B',
    is_default: false,
    is_active: false
  })
]

describe('SettingsModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const uiStore = useUiStore()
    uiStore.setLocale('vi')
  })

  it('renders collections and disables delete on default collection', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionId = 'default'

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    expect(wrapper.text()).toContain('Quản lý Collection')
    expect(wrapper.text()).toContain('Default Collection')
    expect(wrapper.text()).toContain('Project B')

    const deleteButtons = wrapper.findAll('button[aria-label="Xóa collection"]')
    expect(deleteButtons.length).toBe(2)

    // First is default -> disabled
    expect(deleteButtons[0].attributes('disabled')).toBeDefined()
    expect(deleteButtons[0].attributes('title')).toBe('Không thể xóa collection mặc định')

    // Second is non-default -> not disabled
    expect(deleteButtons[1].attributes('disabled')).toBeUndefined()
  })

  it('calls collectionStore.loadCollections when changeLocation succeeds', async () => {
    const store = useCollectionStore()
    const refreshSpy = vi.spyOn(store, 'refresh').mockResolvedValue()
    const loadCollectionsSpy = vi.spyOn(store, 'loadCollections').mockResolvedValue()

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    const changeBtn = wrapper.findAll('button').find(b => b.text().includes('Đổi thư mục lưu trữ'))
    expect(changeBtn).toBeDefined()
    await changeBtn!.trigger('click')

    expect(refreshSpy).toHaveBeenCalled()
    expect(loadCollectionsSpy).toHaveBeenCalled()
  })

  it('confirms and deletes a non-default collection', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.collections = [...mockCollections]
    store.activeCollectionId = 'default'

    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValue(true)
    const deleteSpy = vi.spyOn(store, 'deleteCollection').mockResolvedValue(true)

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    const deleteButtons = wrapper.findAll('button[aria-label="Xóa collection"]')
    await deleteButtons[1].trigger('click')

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Project B'))
    expect(deleteSpy).toHaveBeenCalledWith('proj-b')
  })

  it('aborts deletion when user cancels confirmation', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.collections = [...mockCollections]
    store.activeCollectionId = 'default'

    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValue(false)
    const deleteSpy = vi.spyOn(store, 'deleteCollection')

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    const deleteButtons = wrapper.findAll('button[aria-label="Xóa collection"]')
    await deleteButtons[1].trigger('click')

    expect(confirmSpy).toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('reloads collections and root when modelValue changes from false to true', async () => {
    const store = useCollectionStore()
    const loadSpy = vi.spyOn(store, 'loadCollections').mockResolvedValue()

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: false
      }
    })

    expect(loadSpy).toHaveBeenCalledTimes(1) // from onMounted
    loadSpy.mockClear()

    await wrapper.setProps({ modelValue: true })
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('emits update:modelValue false when Escape is pressed', async () => {
    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    const modal = wrapper.find('.fixed.inset-0')
    await modal.trigger('keydown.esc')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  it('renders auto-save section and toggles autoSaveEnabled on click', async () => {
    const uiStore = useUiStore()
    expect(uiStore.autoSaveEnabled).toBe(true)

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    expect(wrapper.text()).toContain('Tự động lưu (Auto-save)')
    const toggleBtn = wrapper.find('[data-test="toggle-auto-save"]')
    expect(toggleBtn.exists()).toBe(true)
    expect(toggleBtn.attributes('aria-checked')).toBe('true')

    await toggleBtn.trigger('click')
    expect(uiStore.autoSaveEnabled).toBe(false)
    expect(toggleBtn.attributes('aria-checked')).toBe('false')

    await toggleBtn.trigger('click')
    expect(uiStore.autoSaveEnabled).toBe(true)
    expect(toggleBtn.attributes('aria-checked')).toBe('true')
  })

  it('renders collection variables button and opens CollectionEnvModal on click', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    const varBtns = wrapper.findAll('[data-test="collection-variables-btn"]')
    expect(varBtns.length).toBe(2)

    await varBtns[0].trigger('click')
    const envModal = wrapper.findComponent({ name: 'CollectionEnvModal' })
    expect(envModal.exists()).toBe(true)
    expect(envModal.props('modelValue')).toBe(true)
    expect(envModal.props('collectionId')).toBe('default')
  })

  it('allows user to switch language between English and Vietnamese', async () => {
    const uiStore = useUiStore()
    const collStore = useCollectionStore()
    const updateLocaleSpy = vi.spyOn(collStore, 'updateActiveCollectionLocale').mockResolvedValue(true)

    const wrapper = mount(SettingsModal, {
      props: {
        modelValue: true
      }
    })

    const enBtn = wrapper.find('[data-test="locale-option-en"]')
    const viBtn = wrapper.find('[data-test="locale-option-vi"]')

    expect(enBtn.exists()).toBe(true)
    expect(viBtn.exists()).toBe(true)

    // Switch to English
    await enBtn.trigger('click')
    await flushPromises()
    expect(uiStore.locale).toBe('en')
    expect(updateLocaleSpy).toHaveBeenCalledWith('en')
    expect(wrapper.text()).toContain('Collection Management')

    // Switch back to Vietnamese
    await viBtn.trigger('click')
    await flushPromises()
    expect(uiStore.locale).toBe('vi')
    expect(updateLocaleSpy).toHaveBeenCalledWith('vi')
    expect(wrapper.text()).toContain('Quản lý Collection')
  })
})
