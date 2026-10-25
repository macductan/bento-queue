import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppSidebar from '../AppSidebar.vue'
import { useCollectionStore } from '@/stores/collectionStore'
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
})
