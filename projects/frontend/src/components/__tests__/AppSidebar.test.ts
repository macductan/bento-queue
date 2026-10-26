import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppSidebar from '../AppSidebar.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useFlowStore } from '@/stores/flowStore'
import { useUiStore } from '@/stores/uiStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  CreateRequest: vi.fn(),
  CreateFolder: vi.fn(),
  SaveRequest: vi.fn(),
  MoveFolder: vi.fn(),
  MoveRequest: vi.fn()
}))

describe('AppSidebar.vue - Tree Filter & Collection Navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const setupTree = () => {
    const store = useCollectionStore()
    store.collections = [
      { id: 'col-1', name: 'My API Collection', is_default: true } as any
    ]
    store.activeCollectionId = 'col-1'
    store.tree = [
      {
        id: 'f-auth',
        name: 'Auth',
        type: 'folder',
        path: 'auth',
        created_at: '',
        children: [
          {
            id: 'req-login',
            name: 'Login User',
            type: 'request',
            method: 'POST',
            path: 'auth/login',
            url: 'https://api.example.com/v1/auth/tokens',
            body: {
              type: 'json',
              content: '{"grant_type": "password"}'
            },
            created_at: ''
          },
          {
            id: 'req-logout',
            name: 'Logout User',
            type: 'request',
            method: 'POST',
            path: 'auth/logout',
            url: 'https://api.example.com/v1/auth/revoke',
            created_at: ''
          }
        ]
      },
      {
        id: 'f-items',
        name: 'Items & Products',
        type: 'folder',
        path: 'items',
        created_at: '',
        children: [
          {
            id: 'f-nested-inventory',
            name: 'Inventory Subfolder',
            type: 'folder',
            path: 'items/inventory',
            created_at: '',
            children: [
              {
                id: 'req-stock',
                name: 'Check Stock Level',
                type: 'request',
                method: 'GET',
                path: 'items/inventory/stock',
                url: 'https://api.example.com/warehouse/stock',
                body: {
                  type: 'raw',
                  content: 'warehouse_id=WH_NORTH_99'
                },
                created_at: ''
              }
            ]
          }
        ]
      },
      {
        id: 'req-root',
        name: 'Root Status Check',
        type: 'request',
        method: 'GET',
        path: 'status',
        url: 'https://api.example.com/status',
        created_at: ''
      }
    ]
    return store
  }

  it('renders tree filter input and actions header', () => {
    setupTree()
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    expect(wrapper.find('[data-test="tree-filter-input"]').exists()).toBe(true)
    expect(wrapper.attributes('aria-label')).toContain('My API Collection')
    expect(wrapper.find('[data-test="tree-collapse-all-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tree-sort-alphabet-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="sidebar-add-btn"]').exists()).toBe(true)
  })

  it('supports collapse all and sort alphabet buttons', async () => {
    const store = setupTree()
    store.expandedFolders.add('f-auth')
    const sortNodesSpy = vi.spyOn(store, 'sortNodes').mockResolvedValue(true)
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    // Click sort alphabet
    await wrapper.find('[data-test="tree-sort-alphabet-btn"]').trigger('click')
    expect(sortNodesSpy).toHaveBeenCalledWith('')

    // Click collapse all
    await wrapper.find('[data-test="tree-collapse-all-btn"]').trigger('click')
    expect(store.expandedFolders.size).toBe(0)
  })

  it('filters requests by name and auto-expands ancestor folders', async () => {
    const store = setupTree()
    expect(store.expandedFolders.has('f-auth')).toBe(false)

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: {
            props: ['node'],
            template: '<div class="stub-tree-node" :data-node-id="node.id">{{ node.name }}</div>'
          }
        }
      }
    })

    const input = wrapper.find('[data-test="tree-filter-input"]')
    await input.setValue('Login')
    await nextTick()

    expect(store.expandedFolders.has('f-auth')).toBe(true)
    const renderedNodes = wrapper.findAll('.stub-tree-node')
    expect(renderedNodes.length).toBe(1)
    expect(renderedNodes[0].attributes('data-node-id')).toBe('f-auth')
  })

  it('filters requests by URL and auto-expands ancestor folders', async () => {
    const store = setupTree()
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: {
            props: ['node'],
            template: '<div class="stub-tree-node" :data-node-id="node.id">{{ node.name }}</div>'
          }
        }
      }
    })

    const input = wrapper.find('[data-test="tree-filter-input"]')
    await input.setValue('v1/auth/revoke')
    await nextTick()

    expect(store.expandedFolders.has('f-auth')).toBe(true)
    const renderedNodes = wrapper.findAll('.stub-tree-node')
    expect(renderedNodes.length).toBe(1)
    expect(renderedNodes[0].attributes('data-node-id')).toBe('f-auth')
  })

  it('filters requests by body content and auto-expands nested ancestor folders', async () => {
    const store = setupTree()
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: {
            props: ['node'],
            template: '<div class="stub-tree-node" :data-node-id="node.id">{{ node.name }}</div>'
          }
        }
      }
    })

    const input = wrapper.find('[data-test="tree-filter-input"]')
    await input.setValue('WH_NORTH_99')
    await nextTick()

    expect(store.expandedFolders.has('f-items')).toBe(true)
    expect(store.expandedFolders.has('f-nested-inventory')).toBe(true)
    const renderedNodes = wrapper.findAll('.stub-tree-node')
    expect(renderedNodes.length).toBe(1)
    expect(renderedNodes[0].attributes('data-node-id')).toBe('f-items')
  })

  it('shows empty filter state and restores tree when cleared via clear button or Escape', async () => {
    const store = setupTree()
    store.expandedFolders.add('f-items') // Initial expansion

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: {
            props: ['node'],
            template: '<div class="stub-tree-node" :data-node-id="node.id">{{ node.name }}</div>'
          }
        }
      }
    })

    const input = wrapper.find('[data-test="tree-filter-input"]')
    await input.setValue('nonexistent_keyword')
    await nextTick()

    expect(wrapper.find('[data-test="tree-filter-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="clear-filter-btn"]').exists()).toBe(true)

    // Clear via empty state clear button
    await wrapper.find('[data-test="clear-filter-empty-btn"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-test="tree-filter-empty"]').exists()).toBe(false)
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(store.expandedFolders.has('f-items')).toBe(true)

    // Filter again and clear with Escape
    await input.setValue('login')
    await nextTick()
    expect(wrapper.findAll('.stub-tree-node').length).toBe(1)

    await input.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('.stub-tree-node').length).toBe(3)
  })

  it('activates root drop zone on dragover and moves node to root on drop (CAP-4)', async () => {
    const store = setupTree()
    const moveReqSpy = vi.spyOn(store, 'moveRequest').mockResolvedValue()
    const moveFolderSpy = vi.spyOn(store, 'moveFolder').mockResolvedValue()

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: {
            props: ['node'],
            template: '<div class="stub-tree-node" :data-node-id="node.id">{{ node.name }}</div>'
          }
        }
      }
    })

    const rootDropZone = wrapper.find('[data-test="tree-root-drop-zone"]')
    expect(rootDropZone.exists()).toBe(true)

    // 1. Dragging a node already at root (req-root) -> should not activate root drop zone
    store.setDraggingNode({ id: 'req-root', type: 'request' })
    const dt = { dropEffect: '' }
    await rootDropZone.trigger('dragover', { dataTransfer: dt })
    expect(rootDropZone.attributes('data-root-drop-active')).toBeUndefined()

    // 2. Dragging a request from inside a folder (req-login inside f-auth) -> should activate root drop zone
    store.setDraggingNode({ id: 'req-login', type: 'request' })
    await rootDropZone.trigger('dragover', { dataTransfer: dt })
    expect(rootDropZone.attributes('data-root-drop-active')).toBe('true')
    expect(dt.dropEffect).toBe('move')

    // Drag leave clears active state
    await rootDropZone.trigger('dragleave')
    expect(rootDropZone.attributes('data-root-drop-active')).toBeUndefined()

    // Drag over again and drop
    await rootDropZone.trigger('dragover', { dataTransfer: dt })
    await rootDropZone.trigger('drop')
    expect(moveReqSpy).toHaveBeenCalledWith('req-login', '')
    expect(rootDropZone.attributes('data-root-drop-active')).toBeUndefined()

    // 3. Dragging a nested folder (f-nested-inventory inside f-items) and dropping to root
    store.setDraggingNode({ id: 'f-nested-inventory', type: 'folder' })
    await rootDropZone.trigger('dragover', { dataTransfer: dt })
    expect(rootDropZone.attributes('data-root-drop-active')).toBe('true')
    await rootDropZone.trigger('drop')
    expect(moveFolderSpy).toHaveBeenCalledWith('f-nested-inventory', '')

    // 4. Drag cancellation (store.setDraggingNode(null)) clears root drop zone active state
    store.setDraggingNode({ id: 'f-nested-inventory', type: 'folder' })
    await rootDropZone.trigger('dragover', { dataTransfer: dt })
    expect(rootDropZone.attributes('data-root-drop-active')).toBe('true')
    store.setDraggingNode(null)
    await nextTick()
    expect(rootDropZone.attributes('data-root-drop-active')).toBeUndefined()
  })

  it('clears filter query when uiStore.clearTreeFilter is called', async () => {
    setupTree()
    const uiStore = useUiStore()
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    const input = wrapper.find<HTMLInputElement>('[data-test="tree-filter-input"]')
    await input.setValue('inventory')
    expect(input.element.value).toBe('inventory')

    // Call clearTreeFilter from uiStore
    uiStore.clearTreeFilter()
    await nextTick()
    expect(input.element.value).toBe('')
  })

  it('renders sidebar-reload-btn, displays external-change-badge when store.hasExternalChanges is true, and invokes smartReload on click', async () => {
    const store = setupTree()
    const smartReloadSpy = vi.spyOn(store, 'smartReload').mockResolvedValue()

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    const reloadBtn = wrapper.find('[data-test="sidebar-reload-btn"]')
    expect(reloadBtn.exists()).toBe(true)
    expect(reloadBtn.attributes('title')).toBe('Tải lại dữ liệu từ đĩa (Ctrl+R)')
    expect(wrapper.find('[data-test="external-change-badge"]').exists()).toBe(false)

    store.hasExternalChanges = true
    await nextTick()

    expect(reloadBtn.attributes('title')).toBe('Phát hiện thay đổi từ bên ngoài — Nhấn để tải lại (Ctrl+R)')
    expect(wrapper.find('[data-test="external-change-badge"]').exists()).toBe(true)

    await reloadBtn.trigger('click')
    expect(smartReloadSpy).toHaveBeenCalledTimes(1)
  })

  it('switches between [ APIs | Flows ] modes, renders Flow tree, filters Flow nodes, and handles add/collapse/sort actions', async () => {
    setupTree()
    const flowStore = useFlowStore()
    const uiStore = useUiStore()

    flowStore.flowTree = [
      {
        id: 'ff-orders',
        name: 'Order Flows',
        type: 'flow_folder',
        path: 'flows/orders',
        created_at: '',
        children: [
          {
            id: 'flow-checkout',
            name: 'Checkout Pipeline',
            type: 'flow',
            path: 'flows/orders/checkout.json',
            description: 'Validates payment gateway',
            step_count: 3,
            created_at: ''
          }
        ]
      },
      {
        id: 'flow-health',
        name: 'Health Check Flow',
        type: 'flow',
        path: 'flows/health.json',
        step_count: 1,
        created_at: ''
      }
    ]

    const createFlowSpy = vi.spyOn(flowStore, 'createFlow').mockResolvedValue(null)
    const createFlowFolderSpy = vi.spyOn(flowStore, 'createFlowFolder').mockResolvedValue(null)
    const sortFlowNodesSpy = vi.spyOn(flowStore, 'sortFlowNodes').mockResolvedValue(true)

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: {
            props: ['node'],
            template: '<div class="stub-tree-node" :data-node-id="node.id">{{ node.name }}</div>'
          }
        }
      }
    })

    const apisBtn = wrapper.find('[data-test="workspace-mode-apis"]')
    const flowsBtn = wrapper.find('[data-test="workspace-mode-flows"]')
    expect(apisBtn.exists()).toBe(true)
    expect(flowsBtn.exists()).toBe(true)
    expect(uiStore.workspaceMode).toBe('apis')

    // Switch to Flows mode
    await flowsBtn.trigger('click')
    await nextTick()
    expect(uiStore.workspaceMode).toBe('flows')

    const filterInput = wrapper.find('[data-test="tree-filter-input"]')
    expect(filterInput.attributes('placeholder')).toBe('Tìm kiếm flow...')

    // Renders root flow nodes
    const renderedFlowNodes = wrapper.findAll('.stub-tree-node')
    expect(renderedFlowNodes.map(n => n.attributes('data-node-id'))).toEqual(['ff-orders', 'flow-health'])

    // Filter by child flow name -> auto-expands ff-orders
    await filterInput.setValue('Checkout')
    await nextTick()
    expect(flowStore.expandedFlowFolders.has('ff-orders')).toBe(true)
    expect(wrapper.findAll('.stub-tree-node').map(n => n.attributes('data-node-id'))).toEqual(['ff-orders'])

    // Clear filter -> restores expandedFlowFolders
    await wrapper.find('[data-test="clear-filter-btn"]').trigger('click')
    await nextTick()
    expect(flowStore.expandedFlowFolders.has('ff-orders')).toBe(false)

    // Collapse all in Flows mode
    flowStore.expandedFlowFolders.add('ff-orders')
    await wrapper.find('[data-test="tree-collapse-all-btn"]').trigger('click')
    expect(flowStore.expandedFlowFolders.size).toBe(0)

    // Sort A-Z in Flows mode
    await wrapper.find('[data-test="tree-sort-alphabet-btn"]').trigger('click')
    expect(sortFlowNodesSpy).toHaveBeenCalledWith('')

    // Add dropdown in Flows mode shows add-flow-item & add-flow-folder-item
    await wrapper.find('[data-test="sidebar-add-btn"]').trigger('click')
    const addFlowBtn = wrapper.find('[data-test="add-flow-item"]')
    const addFlowFolderBtn = wrapper.find('[data-test="add-flow-folder-item"]')
    expect(addFlowBtn.exists()).toBe(true)
    expect(addFlowFolderBtn.exists()).toBe(true)

    await addFlowBtn.trigger('click')
    expect(createFlowSpy).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-test="sidebar-add-btn"]').trigger('click')
    await wrapper.find('[data-test="add-flow-folder-item"]').trigger('click')
    expect(createFlowFolderSpy).toHaveBeenCalledTimes(1)

    // Switch back to APIs mode
    await apisBtn.trigger('click')
    await nextTick()
    expect(uiStore.workspaceMode).toBe('apis')
  })

  it('handles root drop zone dragover and drop in Flows mode by calling flowStore.moveFlowNode', async () => {
    const flowStore = useFlowStore()
    const uiStore = useUiStore()
    uiStore.workspaceMode = 'flows'
    const moveFlowNodeSpy = vi.spyOn(flowStore, 'moveFlowNode').mockResolvedValue(true)

    flowStore.flowTree = [
      {
        id: 'ff-orders',
        name: 'Orders Flows',
        type: 'flow_folder',
        path: 'flows/orders',
        created_at: '',
        children: [
          {
            id: 'flow-nested',
            name: 'Nested Flow',
            type: 'flow',
            path: 'flows/orders/nested.json',
            created_at: ''
          }
        ]
      }
    ]

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: {
          TreeNodeRow: true
        }
      }
    })

    flowStore.setDraggingNode({ id: 'flow-nested', type: 'flow' })
    const dropZone = wrapper.find('[data-test="tree-root-drop-zone"]')
    const dataTransfer = { dropEffect: '' }

    await dropZone.trigger('dragover', { dataTransfer })
    expect(dropZone.attributes('data-root-drop-active')).toBe('true')
    expect(dataTransfer.dropEffect).toBe('move')

    await dropZone.trigger('drop')
    expect(moveFlowNodeSpy).toHaveBeenCalledWith('flow-nested', 'flow', '')
    expect(flowStore.draggingNode).toBeNull()
  })

  it('renders mode switcher icons (indigo lightning for APIs, pink columns for Flows), 2-row search/toolbar layout with "+ Tạo mới" pill, and closes dropdown when switching mode (CAP-3)', async () => {
    setupTree()
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    const apisBtn = wrapper.find('[data-test="workspace-mode-apis"]')
    const flowsBtn = wrapper.find('[data-test="workspace-mode-flows"]')
    expect(apisBtn.find('svg').exists()).toBe(true)
    expect(apisBtn.find('svg').classes()).toContain('text-indigo-400')
    expect(flowsBtn.find('svg').exists()).toBe(true)
    expect(flowsBtn.find('svg').classes()).toContain('text-pink-400')

    // Search row and toolbar row are separated
    const searchRow = wrapper.find('[data-test="sidebar-search-row"]')
    const toolbarRow = wrapper.find('[data-test="sidebar-toolbar-row"]')
    expect(searchRow.exists()).toBe(true)
    expect(toolbarRow.exists()).toBe(true)
    expect(searchRow.find('[data-test="tree-filter-input"]').exists()).toBe(true)
    expect(toolbarRow.find('[data-test="sidebar-reload-btn"]').exists()).toBe(true)
    expect(toolbarRow.find('[data-test="tree-collapse-all-btn"]').exists()).toBe(true)
    expect(toolbarRow.find('[data-test="tree-sort-alphabet-btn"]').exists()).toBe(true)

    const addBtn = toolbarRow.find('[data-test="sidebar-add-btn"]')
    expect(addBtn.exists()).toBe(true)
    expect(addBtn.text()).toContain('+ Tạo mới')

    // Open "+ Tạo mới" dropdown, then switch mode -> dropdown closes
    await addBtn.trigger('click')
    expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(true)
    await flowsBtn.trigger('click')
    await nextTick()
    expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(false)
  })

  it('displays external-change-banner when store.hasExternalChanges is true and calls smartReload on clicking external-change-reload-btn (CAP-3)', async () => {
    const store = setupTree()
    const smartReloadSpy = vi.spyOn(store, 'smartReload').mockImplementation(async () => {
      store.hasExternalChanges = false
    })

    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    expect(wrapper.find('[data-test="external-change-banner"]').exists()).toBe(false)

    store.hasExternalChanges = true
    await nextTick()

    const banner = wrapper.find('[data-test="external-change-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Phát hiện ổ đĩa thay đổi (Git/CLI)')

    const reloadBannerBtn = banner.find('[data-test="external-change-reload-btn"]')
    expect(reloadBannerBtn.exists()).toBe(true)
    expect(reloadBannerBtn.text()).toContain('Tải lại')

    // Clicking reload button invokes smartReload which clears hasExternalChanges and hides the banner
    await reloadBannerBtn.trigger('click')
    await nextTick()
    expect(smartReloadSpy).toHaveBeenCalledTimes(1)
    expect(store.hasExternalChanges).toBe(false)
    expect(wrapper.find('[data-test="external-change-banner"]').exists()).toBe(false)

    // Guard against concurrent reload while store.loading is true
    store.hasExternalChanges = true
    store.loading = true
    await nextTick()
    await wrapper.find('[data-test="external-change-reload-btn"]').trigger('click')
    expect(smartReloadSpy).toHaveBeenCalledTimes(1)
    store.loading = false
  })
})



