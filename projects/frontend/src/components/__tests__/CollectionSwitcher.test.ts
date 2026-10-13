import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, config } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

config.global.stubs = {
  teleport: true
}
import CollectionSwitcher from '../CollectionSwitcher.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { model } from '../../../wailsjs/go/models'

// Mock wails calls
vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  CreateRequest: vi.fn(),
  CreateFolder: vi.fn(),
  RenameRequest: vi.fn(),
  RenameFolder: vi.fn(),
  DeleteFolder: vi.fn(),
  DeleteRequest: vi.fn(),
  DuplicateRequest: vi.fn(),
  MoveRequest: vi.fn(),
  SelectPostmanFile: vi.fn(),
  ImportPostman: vi.fn(),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DuplicateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  GetRequest: vi.fn(),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SaveEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  SendRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  AbortRequest: vi.fn().mockResolvedValue({})
}))

const mockCollections: model.Collection[] = [
  new model.Collection({
    slug: 'default',
    name: 'Default Collection',
    is_default: true,
    is_active: true
  }),
  new model.Collection({
    slug: 'proj-ecom-123',
    name: 'Project E-Commerce',
    is_default: false,
    is_active: false
  }),
  new model.Collection({
    slug: 'payment-svc-456',
    name: 'Payment Service',
    is_default: false,
    is_active: false
  })
]

describe('CollectionSwitcher.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders active collection name on the trigger button', () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const wrapper = mount(CollectionSwitcher)
    const trigger = wrapper.find('button[aria-label="Chọn collection"]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.text()).toContain('Default Collection')
  })

  it('renders "Đang tải..." when loading collections initially', () => {
    const store = useCollectionStore()
    store.collections = []
    store.collectionsLoading = true

    const wrapper = mount(CollectionSwitcher)
    const trigger = wrapper.find('button[aria-label="Chọn collection"]')
    expect(trigger.text()).toContain('Đang tải...')
  })

  it('toggles dropdown when trigger button is clicked', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const wrapper = mount(CollectionSwitcher)
    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)

    // Open
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')
    expect(wrapper.find('div[role="menu"]').exists()).toBe(true)

    // Close
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')
    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)
  })

  it('closes dropdown on Escape key', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')
    expect(wrapper.find('div[role="menu"]').exists()).toBe(true)

    // Press Escape
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)
  })

  it('displays collections list with default badge and active checkmark', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    expect(items.length).toBe(3)
    expect(items[0].text()).toContain('Default Collection')
    expect(items[0].text()).toContain('Default')
    expect(items[1].text()).toContain('Project E-Commerce')
    expect(items[2].text()).toContain('Payment Service')
  })

  it('calls switchCollection and closes dropdown on selecting another collection', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const switchSpy = vi.spyOn(store, 'switchCollection').mockResolvedValue(true)

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    // Click 'Project E-Commerce'
    await items[1].trigger('click')

    expect(switchSpy).toHaveBeenCalledWith('proj-ecom-123')
    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)
  })

  it('does NOT close dropdown if switchCollection returns false (e.g. cancelled unsaved prompt)', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    // Simulate user cancelling prompt
    const switchSpy = vi.spyOn(store, 'switchCollection').mockResolvedValue(false)

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    await items[1].trigger('click')

    expect(switchSpy).toHaveBeenCalledWith('proj-ecom-123')
    // Dropdown must remain open!
    expect(wrapper.find('div[role="menu"]').exists()).toBe(true)
  })

  it('disables delete button for default collection', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm')
    const deleteSpy = vi.spyOn(store, 'deleteCollection')

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    const defaultItem = items[0]
    const deleteBtn = defaultItem.find('button[aria-label="Xóa collection"]')

    expect(deleteBtn.attributes('disabled')).toBeDefined()
    expect(deleteBtn.attributes('title')).toBe('Không thể xóa collection mặc định')
    expect(deleteBtn.classes()).toContain('opacity-30')
    expect(deleteBtn.classes()).toContain('cursor-not-allowed')

    // Try clicking
    await deleteBtn.trigger('click')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('confirms and deletes a non-default collection', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValue(true)
    const deleteSpy = vi.spyOn(store, 'deleteCollection').mockResolvedValue(true)

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    const nonDefaultItem = items[1]
    const deleteBtn = nonDefaultItem.find('button[aria-label="Xóa collection"]')

    expect(deleteBtn.attributes('disabled')).toBeUndefined()
    await deleteBtn.trigger('click')

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Project E-Commerce'))
    expect(deleteSpy).toHaveBeenCalledWith('proj-ecom-123')
  })

  it('does not delete non-default collection when confirmation is rejected', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValue(false)
    const deleteSpy = vi.spyOn(store, 'deleteCollection')

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    const nonDefaultItem = items[1]
    const deleteBtn = nonDefaultItem.find('button[aria-label="Xóa collection"]')

    await deleteBtn.trigger('click')
    expect(confirmSpy).toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('duplicates collection on clicking duplicate button', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const duplicateSpy = vi.spyOn(store, 'duplicateCollection').mockResolvedValue(true)

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    const duplicateBtn = items[1].find('button[aria-label="Nhân bản collection"]')

    await duplicateBtn.trigger('click')
    expect(duplicateSpy).toHaveBeenCalledWith('proj-ecom-123')
  })

  it('opens rename modal and renames collection', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const renameSpy = vi.spyOn(store, 'renameCollection').mockResolvedValue(true)

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const items = wrapper.findAll('div[role="menuitem"]')
    const renameBtn = items[1].find('button[aria-label="Đổi tên collection"]')

    await renameBtn.trigger('click')

    // CollectionModal should be open with initial name
    const modalInput = wrapper.find('#collection-name-input')
    expect(modalInput.exists()).toBe(true)
    expect((modalInput.element as HTMLInputElement).value).toBe('Project E-Commerce')

    // Submit new name
    await modalInput.setValue('Project E-Commerce Pro')
    const modalForm = wrapper.find('form')
    await modalForm.trigger('submit.prevent')

    expect(renameSpy).toHaveBeenCalledWith('proj-ecom-123', 'Project E-Commerce Pro')
  })

  it('opens create modal and creates collection', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const createSpy = vi.spyOn(store, 'createCollection').mockResolvedValue(true)

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    // Find "+ Tạo collection mới" button
    const createBtn = wrapper.findAll('button').find(b => b.text().includes('Tạo collection mới'))
    expect(createBtn).toBeDefined()
    await createBtn!.trigger('click')

    // CollectionModal should be open
    const modalInput = wrapper.find('#collection-name-input')
    expect(modalInput.exists()).toBe(true)
    expect((modalInput.element as HTMLInputElement).value).toBe('')

    // Submit valid name
    await modalInput.setValue('New Brand Collection')
    const modalForm = wrapper.find('form')
    await modalForm.trigger('submit.prevent')

    expect(createSpy).toHaveBeenCalledWith('New Brand Collection')
  })

  it('opens settings modal and closes dropdown when "Quản lý collections..." is clicked', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    const settingsBtn = wrapper.findAll('button').find(b => b.text().includes('Quản lý collections...'))
    expect(settingsBtn).toBeDefined()
    await settingsBtn!.trigger('click')

    expect(uiStore.settingsModalOpen).toBe(true)
    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)
  })

  it('closes dropdown without calling switchCollection when selecting currently active collection', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const switchSpy = vi.spyOn(store, 'switchCollection')

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')
    expect(wrapper.find('div[role="menu"]').exists()).toBe(true)

    const items = wrapper.findAll('div[role="menuitem"]')
    // Click 'Default Collection' which is already active
    await items[0].trigger('click')

    expect(switchSpy).not.toHaveBeenCalled()
    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)
  })

  it('closes dropdown when clicking outside the component', async () => {
    const store = useCollectionStore()
    store.collections = [...mockCollections]
    store.activeCollectionSlug = 'default'

    const wrapper = mount(CollectionSwitcher, {
      attachTo: document.body
    })

    // Open dropdown
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')
    expect(wrapper.find('div[role="menu"]').exists()).toBe(true)

    // Click outside
    const outsideEl = document.createElement('div')
    document.body.appendChild(outsideEl)
    outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('div[role="menu"]').exists()).toBe(false)
    outsideEl.remove()
    wrapper.unmount()
  })

  it('renders empty state when collections array is empty', async () => {
    const store = useCollectionStore()
    store.collections = []
    store.collectionsLoading = false

    const wrapper = mount(CollectionSwitcher)
    await wrapper.find('button[aria-label="Chọn collection"]').trigger('click')

    expect(wrapper.find('div[role="menu"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Không có collection nào')
  })
})
