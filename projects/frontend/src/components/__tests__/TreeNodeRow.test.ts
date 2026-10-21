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
  MoveFolder: vi.fn().mockResolvedValue({ success: true, data: {} }),
  MoveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
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

  it('handles draggable attribute and inline rename state properly (CAP-4)', async () => {
    const requestNode: TreeNode = {
      id: 'req-drag',
      name: 'Draggable Request',
      type: 'request',
      method: 'GET',
      path: '/req-drag',
      created_at: '2026-10-19'
    }

    const wrapper = mount(TreeNodeRow, {
      props: { node: requestNode, depth: 0 }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    expect(row.attributes('draggable')).toBe('true')

    await row.trigger('dblclick')
    expect(row.attributes('draggable')).toBe('false')
  })

  it('handles dragstart and dragend events on TreeNodeRow (CAP-4)', async () => {
    const store = useCollectionStore()
    const requestNode: TreeNode = {
      id: 'req-drag-1',
      name: 'Req Drag',
      type: 'request',
      method: 'POST',
      path: '/req-drag-1',
      created_at: '2026-10-19'
    }

    const wrapper = mount(TreeNodeRow, {
      props: { node: requestNode, depth: 0 }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
      getData: vi.fn()
    }

    await row.trigger('dragstart', { dataTransfer })

    expect(store.draggingNode).toEqual({ id: 'req-drag-1', type: 'request' })
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-hecto-tree-node', JSON.stringify({ id: 'req-drag-1', type: 'request' }))
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'req-drag-1')
    expect(row.attributes('data-dragging')).toBe('true')

    await row.trigger('dragend')
    expect(store.draggingNode).toBeNull()
    expect(row.attributes('data-dragging')).toBeUndefined()
  })

  it('highlights valid folder drop target on dragover and executes move on drop (CAP-4)', async () => {
    const store = useCollectionStore()
    const moveReqSpy = vi.spyOn(store, 'moveRequest').mockResolvedValue()

    store.tree = [
      {
        id: 'f-target',
        name: 'Target Folder',
        type: 'folder',
        path: '/f-target',
        children: [],
        created_at: '2026-10-19'
      },
      {
        id: 'req-source',
        name: 'Source Req',
        type: 'request',
        method: 'GET',
        path: '/req-source',
        created_at: '2026-10-19'
      }
    ]

    const wrapper = mount(TreeNodeRow, {
      props: { node: store.tree[0], depth: 0 }
    })

    store.setDraggingNode({ id: 'req-source', type: 'request' })

    const row = wrapper.find('[data-tree-row="true"]')
    const dataTransfer = { dropEffect: '' }

    await row.trigger('dragover', { dataTransfer })
    expect(row.attributes('data-drop-target')).toBe('valid')
    expect(dataTransfer.dropEffect).toBe('move')

    await row.trigger('drop')
    expect(moveReqSpy).toHaveBeenCalledWith('req-source', 'f-target')
    expect(row.attributes('data-drop-target')).toBeUndefined()
  })

  it('rejects dropping folder into itself or descendant folder (CAP-1, CAP-4)', async () => {
    const store = useCollectionStore()
    const moveFolderSpy = vi.spyOn(store, 'moveFolder').mockResolvedValue()

    const childFolder: TreeNode = {
      id: 'f-child',
      name: 'Child Folder',
      type: 'folder',
      path: '/f-parent/f-child',
      children: [],
      created_at: '2026-10-19'
    }

    const parentFolder: TreeNode = {
      id: 'f-parent',
      name: 'Parent Folder',
      type: 'folder',
      path: '/f-parent',
      children: [childFolder],
      created_at: '2026-10-19'
    }

    store.tree = [parentFolder]

    // 1. Dragging parent over itself
    const parentWrapper = mount(TreeNodeRow, {
      props: { node: parentFolder, depth: 0 }
    })
    store.setDraggingNode({ id: 'f-parent', type: 'folder' })

    const parentRow = parentWrapper.find('[data-tree-row="true"]')
    const dataTransfer = { dropEffect: '' }
    await parentRow.trigger('dragover', { dataTransfer })

    expect(parentRow.attributes('data-drop-target')).toBe('invalid')
    expect(dataTransfer.dropEffect).toBe('none')

    await parentRow.trigger('drop')
    expect(moveFolderSpy).not.toHaveBeenCalled()

    // 2. Dragging parent over its child
    const childWrapper = mount(TreeNodeRow, {
      props: { node: childFolder, depth: 1 }
    })
    const childRow = childWrapper.find('[data-tree-row="true"]')
    await childRow.trigger('dragover', { dataTransfer })

    expect(childRow.attributes('data-drop-target')).toBe('invalid')
    expect(dataTransfer.dropEffect).toBe('none')

    await childRow.trigger('drop')
    expect(moveFolderSpy).not.toHaveBeenCalled()
  })

  it('allows dropping a folder onto a valid target folder and calls moveFolder (CAP-4)', async () => {
    const store = useCollectionStore()
    const moveFolderSpy = vi.spyOn(store, 'moveFolder').mockResolvedValue()

    const sourceFolder: TreeNode = {
      id: 'f-source',
      name: 'Source Folder',
      type: 'folder',
      path: '/f-source',
      children: [],
      created_at: ''
    }
    const targetFolder: TreeNode = {
      id: 'f-target',
      name: 'Target Folder',
      type: 'folder',
      path: '/f-target',
      children: [],
      created_at: ''
    }

    store.tree = [sourceFolder, targetFolder]
    store.setDraggingNode({ id: 'f-source', type: 'folder' })

    const targetWrapper = mount(TreeNodeRow, {
      props: { node: targetFolder, depth: 0 }
    })
    const targetRow = targetWrapper.find('[data-tree-row="true"]')

    const dataTransfer = { dropEffect: '' }
    await targetRow.trigger('dragover', { dataTransfer })
    expect(targetRow.attributes('data-drop-target')).toBe('valid')
    expect(dataTransfer.dropEffect).toBe('move')

    await targetRow.trigger('drop')
    expect(moveFolderSpy).toHaveBeenCalledWith('f-source', 'f-target')
    expect(store.draggingNode).toBeNull()
  })

  it('renders "Di chuyển tới ▸" submenu in TreeContextMenu for folder, excluding self and descendants (CAP-3)', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    const moveFolderSpy = vi.spyOn(store, 'moveFolder').mockResolvedValue()

    const fChild: TreeNode = {
      id: 'f-sub',
      name: 'Subfolder',
      type: 'folder',
      path: '/f-main/f-sub',
      children: [],
      created_at: ''
    }
    const fMain: TreeNode = {
      id: 'f-main',
      name: 'Main Folder',
      type: 'folder',
      path: '/f-main',
      children: [fChild],
      created_at: ''
    }
    const fOther: TreeNode = {
      id: 'f-other',
      name: 'Other Folder',
      type: 'folder',
      path: '/f-other',
      children: [],
      created_at: ''
    }

    store.tree = [fMain, fOther]
    uiStore.openContextMenu(100, 100, 'f-main', 'folder')

    const wrapper = mount(TreeContextMenu)
    await flushPromises()

    // Find "Di chuyển tới" button
    const moveSubmenu = wrapper.findAll('.relative').find(el => el.text().includes('Di chuyển tới'))
    expect(moveSubmenu).toBeDefined()

    // Submenu options should include "Gốc collection" and "Other Folder", but NOT "Main Folder" or "Subfolder"
    const buttons = moveSubmenu!.findAll('button')
    const buttonTexts = buttons.map(b => b.text())

    expect(buttonTexts).toContain('Gốc collection')
    expect(buttonTexts).toContain('Other Folder')
    expect(buttonTexts).not.toContain('Main Folder')
    expect(buttonTexts).not.toContain('Subfolder')

    // Click "Gốc collection"
    const rootBtn = buttons.find(b => b.text().includes('Gốc collection'))
    await rootBtn!.trigger('click')
    expect(moveFolderSpy).toHaveBeenCalledWith('f-main', '')

    // Re-open and click "Other Folder"
    uiStore.openContextMenu(100, 100, 'f-main', 'folder')
    await flushPromises()
    const otherBtn = wrapper.findAll('button').find(b => b.text().includes('Other Folder'))
    await otherBtn!.trigger('click')
    expect(moveFolderSpy).toHaveBeenCalledWith('f-main', 'f-other')
  })

  it('clicking folder sort button calls sortNodes with folder id', async () => {
    const store = useCollectionStore()
    const sortNodesSpy = vi.spyOn(store, 'sortNodes').mockResolvedValue(true)

    const folderNode: TreeNode = {
      id: 'f-users',
      name: 'Users',
      type: 'folder',
      path: '/f-users',
      children: [],
      created_at: ''
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })

    const sortBtn = wrapper.find('[data-test="folder-sort-btn"]')
    expect(sortBtn.exists()).toBe(true)
    await sortBtn.trigger('click')
    expect(sortNodesSpy).toHaveBeenCalledWith('f-users')
  })

  it('calculates drop position accurately and triggers reorderNodePosition on drop', async () => {
    const store = useCollectionStore()
    const reorderSpy = vi.spyOn(store, 'reorderNodePosition').mockResolvedValue(true)
    vi.spyOn(store, 'canReorderNode').mockReturnValue(true)

    const folderNode: TreeNode = {
      id: 'f-target',
      name: 'Target Folder',
      type: 'folder',
      path: '/f-target',
      children: [],
      created_at: ''
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })

    store.setDraggingNode({ id: 'req-drag', type: 'request' })

    const row = wrapper.find('[data-tree-row="true"]')
    // Mock getBoundingClientRect
    row.element.getBoundingClientRect = () => ({
      top: 100,
      bottom: 200,
      height: 100,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 100,
      toJSON: () => {}
    })

    // Drag over top 20% -> 'before'
    await row.trigger('dragover', { clientY: 110 })
    expect(wrapper.find('[data-test="tree-drop-indicator-before"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tree-drop-indicator-after"]').exists()).toBe(false)

    // Drag over middle 50% -> 'inside'
    await row.trigger('dragover', { clientY: 150 })
    expect(wrapper.find('[data-test="tree-drop-indicator-before"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="tree-drop-indicator-after"]').exists()).toBe(false)
    expect(row.classes()).toContain('border-brand-primary')

    // Drag over bottom 20% -> 'after'
    await row.trigger('dragover', { clientY: 190 })
    expect(wrapper.find('[data-test="tree-drop-indicator-after"]').exists()).toBe(true)

    // Drop on 'after'
    await row.trigger('drop')
    expect(reorderSpy).toHaveBeenCalledWith('req-drag', 'request', 'f-target', 'after')
  })

  it('context menu has Sắp xếp A-Z option which calls sortNodes', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    const sortNodesSpy = vi.spyOn(store, 'sortNodes').mockResolvedValue(true)

    uiStore.openContextMenu(100, 100, 'f-target', 'folder')
    const wrapper = mount(TreeContextMenu)
    await flushPromises()

    const sortBtn = wrapper.find('[data-test="context-menu-sort-btn"]')
    expect(sortBtn.exists()).toBe(true)
    await sortBtn.trigger('click')
    expect(sortNodesSpy).toHaveBeenCalledWith('f-target')
    expect(uiStore.contextMenu).toBeNull()
  })

  it('renders data-node-id and reflects highlighted state when highlighted in uiStore', async () => {
    const uiStore = useUiStore()
    const node: TreeNode = {
      id: 'req-target',
      name: 'Target Request',
      type: 'request',
      method: 'GET',
      path: '/req-target',
      created_at: '2026-10-13'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node,
        depth: 0
      }
    })

    const row = wrapper.find('[data-tree-row="true"]')
    expect(row.attributes('data-node-id')).toBe('req-target')
    expect(row.attributes('data-highlighted')).toBeUndefined()
    expect(row.classes()).not.toContain('animate-pulse')

    // Trigger highlight
    uiStore.highlightTreeNode('req-target')
    await flushPromises()

    expect(row.attributes('data-highlighted')).toBe('true')
    expect(row.classes()).toContain('animate-pulse')
    expect(row.classes()).toContain('bg-brand-primary/30')
    expect(wrapper.find('[data-test="tree-row-highlight-bar"]').exists()).toBe(true)
  })
})
