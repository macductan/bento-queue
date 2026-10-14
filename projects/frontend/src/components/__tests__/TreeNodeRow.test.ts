import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TreeNodeRow from '../TreeNodeRow.vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'

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

  it('toggles folder and selects folder on left click (CAP-1)', async () => {
    const store = useCollectionStore()
    const toggleSpy = vi.spyOn(store, 'toggleFolder')
    const selectSpy = vi.spyOn(store, 'selectFolder').mockResolvedValue()

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

    await row.trigger('click')

    expect(toggleSpy).toHaveBeenCalledWith('folder-auth')
    expect(selectSpy).toHaveBeenCalledWith('folder-auth')
  })

  it('renders active visual indicator when folder is active (CAP-1)', async () => {
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

    // Mark as active folder
    store.activeFolderId = 'folder-auth'
    await wrapper.vm.$nextTick()

    expect(row.attributes('data-active')).toBe('true')
    expect(row.classes()).toContain('border-brand-primary')
    expect(row.classes()).toContain('bg-surface-hover')
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
})
