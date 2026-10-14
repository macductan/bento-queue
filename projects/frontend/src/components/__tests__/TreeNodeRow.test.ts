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
