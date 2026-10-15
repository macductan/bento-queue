import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TreeNodeRow from '../TreeNodeRow.vue'
import TreeContextMenu from '../TreeContextMenu.vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateFolder: vi.fn().mockResolvedValue({ success: true, data: {} }),
  UpdateFolder: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteFolder: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameFolder: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  GetRequest: vi.fn().mockResolvedValue({ success: true, data: null }),
  UpdateCollection: vi.fn().mockResolvedValue({ success: true, data: {} })
}))

describe('TreeNodeRow.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toggles folder only without selecting folder or clearing activeRequestId on left click (CAP-2)', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.activeRequestId = 'req-1'
    store.activeFolderId = null

    const toggleSpy = vi.spyOn(store, 'toggleFolder')
    const selectFolderSpy = vi.spyOn(store, 'selectFolder')
    const setActiveFolderSpy = vi.spyOn(store, 'setActiveFolderId')

    const folderNode: TreeNode = {
      id: 'folder-auth',
      name: 'Auth',
      type: 'folder',
      path: '/folder-auth',
      children: [],
      created_at: '2026-10-13'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    expect(row.exists()).toBe(true)

    // First click expands folder while keeping activeRequestId = 'req-1'
    await row.trigger('click')

    expect(toggleSpy).toHaveBeenCalledTimes(1)
    expect(toggleSpy).toHaveBeenCalledWith('folder-auth')
    expect(store.expandedFolders.has('folder-auth')).toBe(true)
    expect(selectFolderSpy).not.toHaveBeenCalled()
    expect(setActiveFolderSpy).not.toHaveBeenCalled()
    expect(store.activeRequestId).toBe('req-1')
    expect(store.activeFolderId).toBeNull()

    // Second click collapses folder
    await row.trigger('click')
    expect(toggleSpy).toHaveBeenCalledTimes(2)
    expect(store.expandedFolders.has('folder-auth')).toBe(false)
    expect(selectFolderSpy).not.toHaveBeenCalled()
    expect(setActiveFolderSpy).not.toHaveBeenCalled()

    // Clicking when activeRequestId === null also only toggles folder
    store.activeRequestId = null
    await row.trigger('click')
    expect(toggleSpy).toHaveBeenCalledTimes(3)
    expect(store.expandedFolders.has('folder-auth')).toBe(true)
    expect(store.activeFolderId).toBeNull()
    expect(store.activeRequestId).toBeNull()

    // Clicking "..." options button opens context menu without triggering toggleFolder
    const optionsBtn = wrapper.find('button[aria-label="Tùy chọn"]')
    expect(optionsBtn.exists()).toBe(true)
    await optionsBtn.trigger('click')
    expect(toggleSpy).toHaveBeenCalledTimes(3)
    expect(uiStore.contextMenu?.nodeId).toBe('folder-auth')
    expect(uiStore.contextMenu?.nodeType).toBe('folder')
  })

  it('toggles folder only without activating folder when pressing Enter on focused folder row (CAP-2)', async () => {
    const store = useCollectionStore()
    store.activeRequestId = 'req-1'
    store.activeFolderId = null

    const toggleSpy = vi.spyOn(store, 'toggleFolder')
    const selectFolderSpy = vi.spyOn(store, 'selectFolder')
    const setActiveFolderSpy = vi.spyOn(store, 'setActiveFolderId')

    const folderNode: TreeNode = {
      id: 'folder-auth',
      name: 'Auth',
      type: 'folder',
      path: '/folder-auth',
      children: [],
      created_at: '2026-10-13'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    await row.trigger('keydown', { key: 'Enter' })

    expect(toggleSpy).toHaveBeenCalledTimes(1)
    expect(toggleSpy).toHaveBeenCalledWith('folder-auth')
    expect(store.expandedFolders.has('folder-auth')).toBe(true)
    expect(selectFolderSpy).not.toHaveBeenCalled()
    expect(setActiveFolderSpy).not.toHaveBeenCalled()
    expect(store.activeFolderId).toBeNull()
    expect(store.activeRequestId).toBe('req-1')

    // Second Enter collapses expanded folder
    await row.trigger('keydown', { key: 'Enter' })
    expect(toggleSpy).toHaveBeenCalledTimes(2)
    expect(store.expandedFolders.has('folder-auth')).toBe(false)
    expect(store.activeFolderId).toBeNull()
    expect(store.activeRequestId).toBe('req-1')
  })

  it('opens Folder Settings via TreeContextMenu "Cài đặt thư mục" and activates folder row (CAP-2)', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    store.activeRequestId = 'req-1'
    store.activeFolderId = null

    const setActiveFolderSpy = vi.spyOn(store, 'setActiveFolderId')

    const folderNode: TreeNode = {
      id: 'folder-auth',
      name: 'Auth',
      type: 'folder',
      path: '/folder-auth',
      children: [],
      created_at: '2026-10-13'
    }

    const rowWrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })
    const menuWrapper = mount(TreeContextMenu)

    try {
      // Open context menu on folder-auth
      const row = rowWrapper.find('[data-tree-row="true"]')
      await row.trigger('contextmenu', { clientX: 100, clientY: 120 })
      await menuWrapper.vm.$nextTick()

      expect(uiStore.contextMenu).toEqual({
        x: 100,
        y: 120,
        nodeId: 'folder-auth',
        nodeType: 'folder'
      })

      const settingsBtn = menuWrapper.findAll('button').find(b => b.text().trim() === 'Cài đặt thư mục')
      expect(settingsBtn).toBeDefined()
      await settingsBtn!.trigger('click')
      await flushPromises()
      await rowWrapper.vm.$nextTick()

      expect(setActiveFolderSpy).toHaveBeenCalledWith('folder-auth')
      expect(store.activeFolderId).toBe('folder-auth')
      expect(store.activeRequestId).toBeNull()
      expect(uiStore.contextMenu).toBeNull()
      expect(row.attributes('data-active')).toBe('true')
      expect(row.classes()).toContain('border-brand-primary')
    } finally {
      menuWrapper.unmount()
      rowWrapper.unmount()
    }
  })

  it('renders active visual indicator when folder is active and activeRequestId is null (CAP-2)', async () => {
    const store = useCollectionStore()
    const folderNode: TreeNode = {
      id: 'folder-auth',
      name: 'Auth',
      type: 'folder',
      path: '/folder-auth',
      children: [],
      created_at: '2026-10-13'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    expect(row.attributes('data-active')).toBeUndefined()
    expect(row.classes()).not.toContain('border-brand-primary')

    // Mark as active folder with no active request
    store.activeFolderId = 'folder-auth'
    store.activeRequestId = null
    await wrapper.vm.$nextTick()

    expect(row.attributes('data-active')).toBe('true')
    expect(row.classes()).toContain('border-brand-primary')
    expect(row.classes()).toContain('bg-surface-hover')

    // If activeRequestId is non-null, folder row should NOT be active
    store.activeRequestId = 'req-other'
    await wrapper.vm.$nextTick()

    expect(row.attributes('data-active')).toBeUndefined()
    expect(row.classes()).not.toContain('border-brand-primary')
  })

  it('selects request on left click and applies active visual indicator when active', async () => {
    const store = useCollectionStore()
    const selectSpy = vi.spyOn(store, 'selectRequest').mockResolvedValue()

    const requestNode: TreeNode = {
      id: 'req-login',
      name: 'Login',
      type: 'request',
      method: 'POST',
      path: '/req-login',
      created_at: '2026-10-13'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: requestNode,
        depth: 1
      }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    await row.trigger('click')

    expect(selectSpy).toHaveBeenCalledWith('req-login')

    // Mark as active request
    store.activeRequestId = 'req-login'
    await wrapper.vm.$nextTick()

    expect(row.attributes('data-active')).toBe('true')
    expect(row.classes()).toContain('border-brand-primary')
  })

  it('displays tree-row-unsaved-dot with aria-label when active request is dirty', async () => {
    const store = useCollectionStore()
    const { useRequestStore } = await import('@/stores/requestStore')
    const reqStore = useRequestStore()

    const requestNode: TreeNode = {
      id: 'req-dirty',
      name: 'Dirty Request',
      type: 'request',
      method: 'GET',
      path: '/req-dirty',
      created_at: '2026-10-14'
    }

    store.activeRequestId = 'req-dirty'
    reqStore.original = {
      id: 'req-dirty',
      name: 'Dirty Request',
      method: 'GET',
      url: 'https://api.example.com/v1',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '',
      updated_at: ''
    }
    reqStore.current = {
      ...reqStore.original,
      url: 'https://api.example.com/v2'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: requestNode,
        depth: 0
      }
    })

    const dot = wrapper.find('[data-test="tree-row-unsaved-dot"]')
    expect(dot.exists()).toBe(true)
    expect(dot.classes()).toContain('bg-unsaved-dot')
    expect(dot.attributes('aria-label')).toBe('Chưa lưu')
  })

  it('truncates >255-character input in saveEdit before calling store.renameRequest and store.renameFolder', async () => {
    const store = useCollectionStore()
    const renameReqSpy = vi.spyOn(store, 'renameRequest').mockResolvedValue()
    const renameFolderSpy = vi.spyOn(store, 'renameFolder').mockResolvedValue()

    const long300 = 'R'.repeat(300)
    const expected255 = 'R'.repeat(255)

    const requestNode: TreeNode = {
      id: 'req-long',
      name: 'Short',
      type: 'request',
      method: 'GET',
      path: '/req-long',
      created_at: '2026-10-14'
    }

    const reqWrapper = mount(TreeNodeRow, {
      props: { node: requestNode, depth: 0 }
    })

    await reqWrapper.find('[data-tree-row="true"]').trigger('dblclick')
    const reqInput = reqWrapper.find('input[type="text"]')
    expect(reqInput.exists()).toBe(true)
    await reqInput.setValue(`   ${long300}   `)
    await reqInput.trigger('keydown.enter')

    expect(renameReqSpy).toHaveBeenCalledWith('req-long', expected255)

    const folderNode: TreeNode = {
      id: 'folder-long',
      name: 'Short Folder',
      type: 'folder',
      path: '/folder-long',
      children: [],
      created_at: '2026-10-14'
    }

    const folderWrapper = mount(TreeNodeRow, {
      props: { node: folderNode, depth: 0 }
    })

    await folderWrapper.find('[data-tree-row="true"]').trigger('dblclick')
    const folderInput = folderWrapper.find('input[type="text"]')
    expect(folderInput.exists()).toBe(true)
    await folderInput.setValue(long300)
    await folderInput.trigger('keydown.enter')

    expect(renameFolderSpy).toHaveBeenCalledWith('folder-long', expected255)
  })
})
