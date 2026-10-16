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
  SaveRequest: vi.fn()
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
    expect(wrapper.find('[data-test="tree-expand-all-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="git-config-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="sidebar-add-btn"]').exists()).toBe(true)
  })

  it('supports collapse all and expand all buttons', async () => {
    const store = setupTree()
    const wrapper = mount(AppSidebar, {
      global: {
        stubs: { TreeNodeRow: true }
      }
    })

    // Click expand all
    await wrapper.find('[data-test="tree-expand-all-btn"]').trigger('click')
    expect(store.expandedFolders.has('f-auth')).toBe(true)
    expect(store.expandedFolders.has('f-items')).toBe(true)
    expect(store.expandedFolders.has('f-nested-inventory')).toBe(true)

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
})
