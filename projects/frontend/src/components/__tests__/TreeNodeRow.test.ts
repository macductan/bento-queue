import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TreeNodeRow from '../TreeNodeRow.vue'
import TreeContextMenu from '../TreeContextMenu.vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useFlowStore, type FlowTreeNode } from '@/stores/flowStore'
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
    useUiStore().setLocale('vi')
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

  it('supports flow and flow_folder nodes in TreeNodeRow: icon, unsaved dot, click selection, folder toggle, inline rename, delete, Ctrl+D duplicate, sort, and drag-and-drop reorder', async () => {
    const flowStore = useFlowStore()
    const uiStore = useUiStore()
    uiStore.workspaceMode = 'flows'

    const selectFlowSpy = vi.spyOn(flowStore, 'selectFlow').mockResolvedValue(true)
    const toggleFlowFolderSpy = vi.spyOn(flowStore, 'toggleFlowFolder')
    const renameFlowSpy = vi.spyOn(flowStore, 'renameFlow').mockResolvedValue(true)
    const renameFlowFolderSpy = vi.spyOn(flowStore, 'renameFlowFolder').mockResolvedValue(true)
    const deleteFlowSpy = vi.spyOn(flowStore, 'deleteFlow').mockResolvedValue(true)
    const duplicateFlowSpy = vi.spyOn(flowStore, 'duplicateFlow').mockResolvedValue(null)
    const sortFlowNodesSpy = vi.spyOn(flowStore, 'sortFlowNodes').mockResolvedValue(true)
    const reorderFlowPosSpy = vi.spyOn(flowStore, 'reorderNodePosition').mockResolvedValue(true)
    vi.spyOn(flowStore, 'canReorderNode').mockReturnValue(true)

    const flowNode: FlowTreeNode = {
      id: 'flow-1',
      name: 'Checkout Flow',
      type: 'flow',
      path: 'flows/checkout.json',
      created_at: ''
    }
    const flowFolderNode: FlowTreeNode = {
      id: 'ff-1',
      name: 'Order Flows',
      type: 'flow_folder',
      path: 'flows/ff-1',
      children: [flowNode],
      created_at: ''
    }
    flowStore.flowTree = [flowFolderNode]
    flowStore.activeFlowId = 'flow-1'
    flowStore.currentFlow = {
      id: 'flow-1',
      name: 'In-Memory Checkout Flow',
      description: '',
      variables: [],
      nodes: [],
      created_at: '',
      updated_at: ''
    } as any
    flowStore.savedSnapshot = '{"id":"flow-1","name":"Checkout Flow"}'

    const flowWrapper = mount(TreeNodeRow, {
      props: { node: flowNode, depth: 1 }
    })

    // Flow node icon and unsaved dot
    expect(flowWrapper.find('[data-test="flow-node-icon"]').exists()).toBe(true)
    expect(flowWrapper.find('[data-test="tree-row-unsaved-dot"]').exists()).toBe(true)
    expect(flowWrapper.text()).toContain('In-Memory Checkout Flow')

    // Click flow node -> selectFlow
    const flowRow = flowWrapper.find('[data-tree-row="true"]')
    await flowRow.trigger('click')
    expect(selectFlowSpy).toHaveBeenCalledWith('flow-1')

    // Inline rename uses effectiveRawName and calls flowStore.renameFlow
    await flowRow.trigger('keydown', { key: 'F2' })
    await flushPromises()
    const input = flowWrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('In-Memory Checkout Flow')
    await input.setValue('Renamed Flow')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(renameFlowSpy).toHaveBeenCalledWith('flow-1', 'Renamed Flow')

    // Ctrl+D duplicate
    await flowRow.trigger('keydown', { key: 'd', ctrlKey: true })
    expect(duplicateFlowSpy).toHaveBeenCalledWith('flow-1')

    // Delete key prompts with effectiveRawName and calls flowStore.deleteFlow
    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValueOnce(true)
    await flowRow.trigger('keydown', { key: 'Delete' })
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('In-Memory Checkout Flow'))
    expect(deleteFlowSpy).toHaveBeenCalledWith('flow-1')

    // Mount flow_folder node
    const folderWrapper = mount(TreeNodeRow, {
      props: { node: flowFolderNode, depth: 0 }
    })
    const folderRow = folderWrapper.find('[data-tree-row="true"]')
    await folderRow.trigger('click')
    expect(toggleFlowFolderSpy).toHaveBeenCalledWith('ff-1')

    // Folder sort button
    await folderWrapper.find('[data-test="folder-sort-btn"]').trigger('click')
    expect(sortFlowNodesSpy).toHaveBeenCalledWith('ff-1')

    // Folder inline rename
    await folderRow.trigger('keydown', { key: 'F2' })
    await flushPromises()
    const folderInput = folderWrapper.find('input')
    await folderInput.setValue('Renamed Flow Folder')
    await folderInput.trigger('keydown.enter')
    await flushPromises()
    expect(renameFlowFolderSpy).toHaveBeenCalledWith('ff-1', 'Renamed Flow Folder')

    // Drag-and-drop reorder in flow mode
    flowStore.setDraggingNode({ id: 'flow-1', type: 'flow' })
    folderRow.element.getBoundingClientRect = () => ({
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
    await folderRow.trigger('dragover', { clientY: 190 })
    await folderRow.trigger('drop')
    expect(reorderFlowPosSpy).toHaveBeenCalledWith('flow-1', 'flow', 'ff-1', 'after')
  })

  it('supports flow and flow_folder in TreeContextMenu: dirty indicator, parent/descendant filtering, and flowStore actions', async () => {
    const flowStore = useFlowStore()
    const uiStore = useUiStore()
    uiStore.workspaceMode = 'flows'

    const createFlowSpy = vi.spyOn(flowStore, 'createFlow').mockResolvedValue(null)
    const createFlowFolderSpy = vi.spyOn(flowStore, 'createFlowFolder').mockResolvedValue(null)
    const sortFlowNodesSpy = vi.spyOn(flowStore, 'sortFlowNodes').mockResolvedValue(true)
    const duplicateFlowSpy = vi.spyOn(flowStore, 'duplicateFlow').mockResolvedValue(null)
    const moveFlowNodeSpy = vi.spyOn(flowStore, 'moveFlowNode').mockResolvedValue(true)
    const deleteFlowSpy = vi.spyOn(flowStore, 'deleteFlow').mockResolvedValue(true)
    const deleteFlowFolderSpy = vi.spyOn(flowStore, 'deleteFlowFolder').mockResolvedValue(true)

    const childFolder: FlowTreeNode = {
      id: 'ff-sub',
      name: 'Sub Flow Folder',
      type: 'flow_folder',
      path: 'flows/ff-main/ff-sub',
      children: [],
      created_at: ''
    }
    const flowInsideMain: FlowTreeNode = {
      id: 'flow-1',
      name: 'Main Flow',
      type: 'flow',
      path: 'flows/ff-main/flow-1.json',
      created_at: ''
    }
    const mainFolder: FlowTreeNode = {
      id: 'ff-main',
      name: 'Main Flow Folder',
      type: 'flow_folder',
      path: 'flows/ff-main',
      children: [childFolder, flowInsideMain],
      created_at: ''
    }
    const otherFolder: FlowTreeNode = {
      id: 'ff-other',
      name: 'Other Flow Folder',
      type: 'flow_folder',
      path: 'flows/ff-other',
      children: [],
      created_at: ''
    }

    flowStore.flowTree = [mainFolder, otherFolder]
    flowStore.activeFlowId = 'flow-1'
    flowStore.currentFlow = {
      id: 'flow-1',
      name: 'Modified Main Flow',
      description: '',
      variables: [],
      nodes: [],
      created_at: '',
      updated_at: ''
    } as any
    flowStore.savedSnapshot = '{"id":"flow-1","name":"Main Flow"}'

    const wrapper = mount(TreeContextMenu)

    // 1. Open context menu on dirty flow-1 (parent is ff-main)
    uiStore.openContextMenu(100, 100, 'flow-1', 'flow')
    await flushPromises()
    expect(wrapper.find('[data-test="context-menu-unsaved-indicator"]').exists()).toBe(true)

    // Move submenu for flow-1 should exclude current parent 'Main Flow Folder', but include 'Gốc flows', 'Sub Flow Folder', and 'Other Flow Folder'
    const flowMoveSubmenu = wrapper.findAll('.relative').find(el => el.text().includes('Di chuyển tới'))!
    const flowMoveTexts = flowMoveSubmenu.findAll('button').map(b => b.text())
    expect(flowMoveTexts).toContain('Gốc flows')
    expect(flowMoveTexts).toContain('Other Flow Folder')
    expect(flowMoveTexts).not.toContain('Main Flow Folder')

    // Click 'Other Flow Folder' -> moveFlowNode
    await flowMoveSubmenu.findAll('button').find(b => b.text().includes('Other Flow Folder'))!.trigger('click')
    expect(moveFlowNodeSpy).toHaveBeenCalledWith('flow-1', 'flow', 'ff-other')

    // Duplicate flow-1
    uiStore.openContextMenu(100, 100, 'flow-1', 'flow')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Sao chép')!.trigger('click')
    expect(duplicateFlowSpy).toHaveBeenCalledWith('flow-1')

    // Delete flow-1
    vi.spyOn(uiStore, 'requestConfirm').mockResolvedValueOnce(true)
    uiStore.openContextMenu(100, 100, 'flow-1', 'flow')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Xóa')!.trigger('click')
    await flushPromises()
    expect(deleteFlowSpy).toHaveBeenCalledWith('flow-1')

    // 2. Open context menu on root flow_folder ff-main (parent is '')
    uiStore.openContextMenu(100, 100, 'ff-main', 'flow_folder')
    await flushPromises()

    // Move submenu for root folder ff-main excludes 'Gốc flows' (already at root), self ('Main Flow Folder'), and descendant ('Sub Flow Folder')
    const folderMoveSubmenu = wrapper.findAll('.relative').find(el => el.text().includes('Di chuyển tới'))!
    const folderMoveTexts = folderMoveSubmenu.findAll('button').map(b => b.text())
    expect(folderMoveTexts).not.toContain('Gốc flows')
    expect(folderMoveTexts).not.toContain('Main Flow Folder')
    expect(folderMoveTexts).not.toContain('Sub Flow Folder')
    expect(folderMoveTexts).toContain('Other Flow Folder')

    // Create flow / create folder / sort / delete folder
    await wrapper.findAll('button').find(b => b.text() === 'Thêm flow')!.trigger('click')
    expect(createFlowSpy).toHaveBeenCalledWith('ff-main')

    uiStore.openContextMenu(100, 100, 'ff-main', 'flow_folder')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Thêm thư mục')!.trigger('click')
    expect(createFlowFolderSpy).toHaveBeenCalledWith('ff-main')

    uiStore.openContextMenu(100, 100, 'ff-main', 'flow_folder')
    await flushPromises()
    await wrapper.find('[data-test="context-menu-sort-btn"]').trigger('click')
    expect(sortFlowNodesSpy).toHaveBeenCalledWith('ff-main')

    vi.spyOn(uiStore, 'requestConfirm').mockResolvedValueOnce(true)
    uiStore.openContextMenu(100, 100, 'ff-main', 'flow_folder')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Xóa')!.trigger('click')
    await flushPromises()
    expect(deleteFlowFolderSpy).toHaveBeenCalledWith('ff-main')
  })

  it('renders quick folder-settings-btn on folder row in APIs mode, calls store.openFolderSettings without toggling folder, and hides it in flows mode or while editing (CAP-3)', async () => {
    const store = useCollectionStore()
    const uiStore = useUiStore()
    uiStore.workspaceMode = 'apis'

    const openSettingsSpy = vi.spyOn(store, 'openFolderSettings')
    const toggleFolderSpy = vi.spyOn(store, 'toggleFolder')

    const folderNode: TreeNode = {
      id: 'folder-payments',
      name: 'Payments',
      type: 'folder',
      path: '/folder-payments',
      children: [],
      created_at: '2026-10-26'
    }

    const wrapper = mount(TreeNodeRow, {
      props: {
        node: folderNode,
        depth: 0
      }
    })

    const settingsBtn = wrapper.find('[data-test="folder-settings-btn"]')
    const sortBtn = wrapper.find('[data-test="folder-sort-btn"]')
    const menuBtn = wrapper.find('[data-test="tree-node-menu-btn"]')
    expect(settingsBtn.exists()).toBe(true)
    expect(settingsBtn.attributes('title')).toBe('Cài đặt Thư mục (Auth, Headers, Vars, Scripts)')
    expect(sortBtn.exists()).toBe(true)
    expect(menuBtn.exists()).toBe(true)

    await settingsBtn.trigger('click')
    await flushPromises()

    expect(openSettingsSpy).toHaveBeenCalledWith('folder-payments')
    expect(store.activeFolderId).toBe('folder-payments')
    expect(toggleFolderSpy).not.toHaveBeenCalled()

    // Double-clicking action buttons does not bubble to the row and does not enter inline rename
    await settingsBtn.trigger('dblclick')
    await sortBtn.trigger('dblclick')
    await menuBtn.trigger('dblclick')
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)

    // openFolderSettings guards against empty/whitespace IDs
    const setActiveFolderSpy = vi.spyOn(store, 'setActiveFolderId')
    setActiveFolderSpy.mockClear()
    await store.openFolderSettings('   ')
    expect(setActiveFolderSpy).not.toHaveBeenCalled()

    // Entering inline edit mode hides folder-settings-btn
    await wrapper.find('[data-tree-row="true"]').trigger('dblclick')
    expect(wrapper.find('[data-test="folder-settings-btn"]').exists()).toBe(false)

    // In Flows mode (flow_folder), folder-settings-btn and ctx-folder-settings are hidden
    uiStore.workspaceMode = 'flows'
    const flowFolderWrapper = mount(TreeNodeRow, {
      props: {
        node: {
          id: 'ff-1',
          name: 'Flow Group',
          type: 'flow_folder',
          path: 'flows/ff-1',
          children: [],
          created_at: ''
        },
        depth: 0
      }
    })
    expect(flowFolderWrapper.find('[data-test="folder-settings-btn"]').exists()).toBe(false)

    const ctxWrapper = mount(TreeContextMenu)
    uiStore.openContextMenu(50, 50, 'ff-1', 'flow_folder')
    await flushPromises()
    expect(ctxWrapper.find('[data-test="ctx-folder-settings"]').exists()).toBe(false)

    // Root context menu in APIs mode also hides ctx-folder-settings
    uiStore.workspaceMode = 'apis'
    uiStore.openContextMenu(50, 50, '', 'folder')
    await flushPromises()
    expect(ctxWrapper.find('[data-test="ctx-folder-settings"]').exists()).toBe(false)

    // Folder context menu in APIs mode shows ctx-folder-settings with text-indigo-400 icon
    uiStore.openContextMenu(50, 50, 'folder-payments', 'folder')
    await flushPromises()
    const ctxSettingsBtn = ctxWrapper.find('[data-test="ctx-folder-settings"]')
    expect(ctxSettingsBtn.exists()).toBe(true)
    expect(ctxSettingsBtn.find('svg').classes()).toContain('text-indigo-400')
    await ctxSettingsBtn.trigger('click')
    await flushPromises()
    expect(openSettingsSpy).toHaveBeenCalledWith('folder-payments')
  })

  it('renders HTTP method badge with both text-method-* and method-badge-* classes and fallback for custom methods (CAP-1 & CAP-3)', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
    for (const method of methods) {
      const mLower = method.toLowerCase()
      const wrapper = mount(TreeNodeRow, {
        props: {
          node: {
            id: `req-${mLower}`,
            name: `${method} Request`,
            type: 'request',
            method,
            path: `/req-${mLower}`,
            created_at: ''
          },
          depth: 0
        }
      })
      const badge = wrapper.find('[data-test="tree-row-method-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toBe(method)
      expect(badge.classes()).toContain(`text-method-${mLower}`)
      expect(badge.classes()).toContain(`method-badge-${mLower}`)
    }

    // Custom method fallback
    const customWrapper = mount(TreeNodeRow, {
      props: {
        node: {
          id: 'req-custom',
          name: 'Custom Request',
          type: 'request',
          method: 'PURGE',
          path: '/req-custom',
          created_at: ''
        },
        depth: 0
      }
    })
    const customBadge = customWrapper.find('[data-test="tree-row-method-badge"]')
    expect(customBadge.exists()).toBe(true)
    expect(customBadge.classes()).toContain('text-text-secondary')
    expect(customBadge.classes()).toContain('method-badge-options')
  })
})


