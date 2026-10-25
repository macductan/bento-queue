import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import AppTabBar from '../AppTabBar.vue'
import ContentArea from '../ContentArea.vue'
import App from '@/App.vue'
import { useTabStore } from '@/stores/tabStore'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { createMockRequest } from '@/stores/__tests__/utils'
import { model } from '../../../wailsjs/go/models'

vi.mock('../../../wailsjs/go/main/App', () => ({
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  GetRequest: vi.fn(),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteFolder: vi.fn().mockResolvedValue({ success: true, data: null }),
  LoadFolder: vi.fn().mockResolvedValue({
    success: true,
    data: { id: 'folder-auth', name: 'Auth Module', variables: [], headers: [], auth: { type: 'inherit' } }
  }),
  UpdateFolder: vi.fn().mockResolvedValue({ success: true, data: {} })
}))

import { GetRequest, LoadFolder, UpdateFolder, DeleteFolder, GetCollectionTree } from '../../../wailsjs/go/main/App'

function resSuccess(data: any = {}): model.Result {
  return model.Result.createFrom({ success: true, data })
}

describe('AppTabBar.vue, ContentArea.vue & App.vue Ctrl+W (CAP-1)', () => {
  const sampleTree: TreeNode[] = [
    {
      id: 'req-1',
      name: 'GET Users',
      type: 'request',
      method: 'GET',
      path: '/Test-Collection/req-1.json',
      created_at: '2026-10-14'
    },
    {
      id: 'req-2',
      name: 'POST Login',
      type: 'request',
      method: 'POST',
      path: '/Test-Collection/req-2.json',
      created_at: '2026-10-14'
    },
    {
      id: 'folder-auth',
      name: 'Auth Module',
      type: 'folder',
      path: '/Test-Collection/Auth Module',
      created_at: '2026-10-14',
      children: []
    }
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const colStore = useCollectionStore()
    colStore.activeCollectionId = 'Test-Collection'
    colStore.tree = JSON.parse(JSON.stringify(sampleTree))

    vi.mocked(GetRequest).mockImplementation(async (id: string) => {
      const node = colStore.findNode(colStore.tree, id)
      return resSuccess(
        createMockRequest({
          id,
          name: node?.name || id,
          method: node?.method || 'GET',
          url: `https://api.example.com/${id}`
        })
      )
    })
  })

  it('renders Request tabs with method badge and Folder tabs with folder icon, unsaved dot when dirty, and switches tab on click or keyboard Enter/Space', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const reqStore = useRequestStore()

    await colStore.selectRequest('req-1')
    await colStore.selectRequest('req-2')
    await colStore.setActiveFolderId('folder-auth')

    const wrapper = mount(AppTabBar)
    const tabItems = wrapper.findAll('[data-test="app-tab-item"]')
    expect(tabItems).toHaveLength(3)

    // Tab 0: GET Users
    expect(tabItems[0].find('[data-test="tab-method-badge"]').text()).toBe('GET')
    expect(tabItems[0].find('[data-test="tab-method-badge"]').classes()).toContain('text-method-get')
    expect(tabItems[0].find('[data-test="tab-name"]').text()).toBe('GET Users')
    expect(tabItems[0].attributes('data-active')).toBeUndefined()

    // Tab 1: POST Login
    expect(tabItems[1].find('[data-test="tab-method-badge"]').text()).toBe('POST')
    expect(tabItems[1].find('[data-test="tab-method-badge"]').classes()).toContain('text-method-post')
    expect(tabItems[1].find('[data-test="tab-name"]').text()).toBe('POST Login')

    // Tab 2: Folder Auth Module (active)
    expect(tabItems[2].find('[data-test="tab-folder-icon"]').exists()).toBe(true)
    expect(tabItems[2].find('[data-test="tab-method-badge"]').exists()).toBe(false)
    expect(tabItems[2].find('[data-test="tab-name"]').text()).toBe('Auth Module')
    expect(tabItems[2].attributes('data-active')).toBe('true')

    // Keyboard Enter on Tab 1 -> activates req-2
    await tabItems[1].trigger('keydown.enter')
    await flushPromises()
    expect(tabStore.activeTabId).toBe('request:req-2')
    expect(colStore.activeRequestId).toBe('req-2')

    // Keyboard Space on Tab 2 -> activates folder-auth
    await tabItems[2].trigger('keydown.space')
    await flushPromises()
    expect(tabStore.activeTabId).toBe('folder:folder-auth')
    expect(colStore.activeFolderId).toBe('folder-auth')

    // Left-click Tab 0 -> activates req-1
    await tabItems[0].trigger('click')
    await flushPromises()
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(colStore.activeRequestId).toBe('req-1')
    expect(tabItems[0].attributes('data-active')).toBe('true')

    // Make req-1 dirty -> shows [data-test="tab-unsaved-dot"] with bg-unsaved-dot
    expect(tabItems[0].find('[data-test="tab-unsaved-dot"]').exists()).toBe(false)
    reqStore.current!.url = 'https://api.example.com/modified'
    await nextTick()

    const dot = tabItems[0].find('[data-test="tab-unsaved-dot"]')
    expect(dot.exists()).toBe(true)
    expect(dot.classes()).toContain('bg-unsaved-dot')

    wrapper.unmount()
  })

  it('closes only 1 tab on full middle-click sequence (mousedown button=1 followed by auxclick button=1) and via close button (✕)', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()

    await colStore.selectRequest('req-1')
    await colStore.selectRequest('req-2')
    await colStore.setActiveFolderId('folder-auth')

    const wrapper = mount(AppTabBar)
    let tabItems = wrapper.findAll('[data-test="app-tab-item"]')
    expect(tabItems).toHaveLength(3)

    // 1. Real browser middle-click sequence: mousedown(button=1) -> auxclick(button=1) on Tab 1 (request:req-2)
    await tabItems[1].trigger('mousedown', { button: 1 })
    await flushPromises()
    // mousedown alone only prevents default auto-scroll; tab is still open until auxclick
    expect(tabStore.tabs).toHaveLength(3)

    await tabItems[1].trigger('auxclick', { button: 1 })
    await flushPromises()
    tabItems = wrapper.findAll('[data-test="app-tab-item"]')
    // Must close ONLY 1 tab (request:req-2), leaving 2 tabs open!
    expect(tabItems).toHaveLength(2)
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1', 'folder:folder-auth'])

    // 2. Click close button (✕) on active tab (folder:folder-auth)
    const closeBtn = tabItems[1].find('[data-test="tab-close-btn"]')
    await closeBtn.trigger('click')
    await flushPromises()

    tabItems = wrapper.findAll('[data-test="app-tab-item"]')
    expect(tabItems).toHaveLength(1)
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(colStore.activeRequestId).toBe('req-1')

    // 3. auxclick (button: 1) on remaining tab closes it and hides AppTabBar
    await tabItems[0].trigger('auxclick', { button: 1 })
    await flushPromises()
    expect(tabStore.tabs).toHaveLength(0)
    expect(wrapper.find('[data-test="app-tab-bar"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('preserves responseStore across tab switches inside ContentArea.vue without clearing restored response', async () => {
    const colStore = useCollectionStore()
    const resStore = useResponseStore()

    const wrapper = mount(ContentArea, {
      global: {
        stubs: {
          RequestEditor: { template: '<div data-test="stub-request-editor" />' },
          FolderEditor: { template: '<div data-test="stub-folder-editor" />' },
          EmptyStateRequest: { template: '<div data-test="stub-empty-state" />' },
          ResponseViewer: { template: '<div data-test="stub-response-viewer" />' }
        }
      }
    })

    await colStore.selectRequest('req-1')
    await flushPromises()
    resStore.response = { status_code: 200, status_text: '200 OK' } as any

    // Switch to folder-auth in ContentArea
    await colStore.setActiveFolderId('folder-auth')
    await flushPromises()
    expect(wrapper.find('[data-test="stub-folder-editor"]').exists()).toBe(true)

    // Switch to req-2 in ContentArea -> response is null
    await colStore.selectRequest('req-2')
    await flushPromises()
    expect(resStore.response).toBeNull()

    // Switch back to req-1 by clicking its tab in AppTabBar inside ContentArea
    const tabItems = wrapper.findAll('[data-test="app-tab-item"]')
    await tabItems[0].trigger('click')
    await flushPromises()
    await nextTick()

    expect(colStore.activeRequestId).toBe('req-1')
    expect(resStore.response?.status_code).toBe(200)

    wrapper.unmount()
  })

  it('syncs FolderEditor dirty state to AppTabBar, flushes on switch, and does NOT call UpdateFolder when deleting a dirty active folder', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()

    await colStore.setActiveFolderId('folder-auth')

    const wrapper = mount(ContentArea, {
      global: {
        stubs: {
          RequestEditor: { template: '<div data-test="stub-request-editor" />' },
          EmptyStateRequest: { template: '<div data-test="stub-empty-state" />' },
          ResponseViewer: { template: '<div data-test="stub-response-viewer" />' },
          KvpEditor: true,
          AuthEditor: true
        }
      }
    })
    await flushPromises()
    await nextTick()

    expect(LoadFolder).toHaveBeenCalledWith('folder-auth')
    expect(tabStore.activeTab?.isDirty).toBe(false)

    // Modify FolderEditor state to make it dirty
    const folderEditor = wrapper.findComponent({ name: 'FolderEditor' })
    const vm = folderEditor.vm as any
    vm.headers.push({ key: 'X-Tenant', value: 'hecto', enabled: true })
    await nextTick()

    expect(vm.isDirty).toBe(true)
    expect(tabStore.activeTab?.isDirty).toBe(true)
    expect(wrapper.find('[data-test="tab-unsaved-dot"]').exists()).toBe(true)

    // Switch to req-1 -> automatically flushes FolderEditor via UpdateFolder
    await colStore.selectRequest('req-1')
    await flushPromises()

    expect(UpdateFolder).toHaveBeenCalledTimes(1)
    expect(tabStore.tabs.find(t => t.id === 'folder:folder-auth')?.isDirty).toBe(false)

    // Switch back to folder-auth, make it dirty again, then delete folder-auth -> must NOT call UpdateFolder
    vi.mocked(UpdateFolder).mockClear()
    await colStore.setActiveFolderId('folder-auth')
    await flushPromises()
    await nextTick()

    const folderEditor2 = wrapper.findComponent({ name: 'FolderEditor' })
    ;(folderEditor2.vm as any).headers.push({ key: 'X-Deleted', value: 'should-not-save', enabled: true })
    await nextTick()
    expect(tabStore.activeTab?.isDirty).toBe(true)

    vi.mocked(DeleteFolder).mockResolvedValueOnce(resSuccess(null))
    vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(sampleTree.slice(0, 2)))

    await colStore.deleteFolder('folder-auth')
    await flushPromises()
    await nextTick()

    expect(UpdateFolder).not.toHaveBeenCalled()
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')

    wrapper.unmount()
  })

  it('handles Ctrl+W and Cmd+W in App.vue with e.preventDefault() to close only the active tab', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()

    const wrapper = mount(App, {
      global: {
        stubs: {
          AppHeader: true,
          AppSidebar: true,
          ContentArea: true,
          ToastNotification: true,
          ConfirmDialog: true,
          TreeContextMenu: true,
          UnsavedChangesDialog: true,
          EnvModal: true
        }
      }
    })
    await flushPromises()

    await colStore.selectRequest('req-1')
    await colStore.selectRequest('req-2')
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1', 'request:req-2'])
    expect(tabStore.activeTabId).toBe('request:req-2')

    // Dispatch Ctrl+W
    const ctrlWEvent = new KeyboardEvent('keydown', {
      key: 'w',
      ctrlKey: true,
      cancelable: true
    })
    const preventSpy = vi.spyOn(ctrlWEvent, 'preventDefault')
    window.dispatchEvent(ctrlWEvent)
    await flushPromises()

    expect(preventSpy).toHaveBeenCalled()
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')

    // Dispatch Cmd+W (metaKey) to close remaining tab
    const cmdWEvent = new KeyboardEvent('keydown', {
      key: 'w',
      metaKey: true,
      cancelable: true
    })
    const preventCmdSpy = vi.spyOn(cmdWEvent, 'preventDefault')
    window.dispatchEvent(cmdWEvent)
    await flushPromises()

    expect(preventCmdSpy).toHaveBeenCalled()
    expect(tabStore.tabs).toHaveLength(0)
    expect(tabStore.activeTabId).toBeNull()

    wrapper.unmount()
  })

  it('handles Ctrl+R, Cmd+R, and F5 in App.vue by calling collectionStore.smartReload() instead of reloading the window', async () => {
    const colStore = useCollectionStore()
    const smartReloadSpy = vi.spyOn(colStore, 'smartReload').mockResolvedValue()

    const wrapper = mount(App, {
      global: {
        stubs: {
          AppHeader: true,
          AppSidebar: true,
          ContentArea: true,
          ToastNotification: true,
          ConfirmDialog: true,
          TreeContextMenu: true,
          UnsavedChangesDialog: true,
          EnvModal: true
        }
      }
    })
    await flushPromises()

    for (const init of [
      { key: 'r', ctrlKey: true, cancelable: true },
      { key: 'R', metaKey: true, cancelable: true },
      { key: 'F5', cancelable: true }
    ]) {
      const ev = new KeyboardEvent('keydown', init)
      const preventSpy = vi.spyOn(ev, 'preventDefault')
      window.dispatchEvent(ev)
      expect(preventSpy).toHaveBeenCalled()
    }

    expect(smartReloadSpy).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('scrolls tabs horizontally when mouse wheel events occur', async () => {
    const tabStore = useTabStore()
    tabStore.tabs = [
      { id: 'request:req-1', entityId: 'req-1', type: 'request', name: 'Req 1', method: 'GET', isDirty: false },
      { id: 'request:req-2', entityId: 'req-2', type: 'request', name: 'Req 2', method: 'GET', isDirty: false },
      { id: 'request:req-3', entityId: 'req-3', type: 'request', name: 'Req 3', method: 'GET', isDirty: false }
    ]
    tabStore.activeTabId = 'request:req-1'

    const wrapper = mount(AppTabBar, { attachTo: document.body })
    await nextTick()

    const tabBar = wrapper.find('[data-test="app-tab-bar"]')
    expect(tabBar.exists()).toBe(true)
    const el = tabBar.element as HTMLElement

    // Mock scrollLeft, scrollWidth, clientWidth
    let scrollLeft = 0
    Object.defineProperty(el, 'scrollLeft', {
      get: () => scrollLeft,
      set: (val: number) => { scrollLeft = val },
      configurable: true
    })
    Object.defineProperty(el, 'scrollWidth', { value: 1000, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true })

    // Wheel event with deltaY and pixel mode (deltaMode = 0)
    await tabBar.trigger('wheel', { deltaY: 60, deltaX: 0, deltaMode: 0 })
    expect(el.scrollLeft).toBe(60)

    // Wheel event with deltaMode = 1 (lines, e.g. 2 lines * 24px)
    await tabBar.trigger('wheel', { deltaY: 2, deltaX: 0, deltaMode: 1 })
    expect(el.scrollLeft).toBe(60 + 48)

    wrapper.unmount()
  })

  it('renders dim tab-path above tab name and method badge indicating request location', async () => {
    const colStore = useCollectionStore()
    colStore.collections = [
      { id: 'Test-Collection', name: 'My API', path: '/Test-Collection' } as any
    ]
    colStore.tree = [
      {
        id: 'f-sub',
        name: 'Users Submodule',
        type: 'folder',
        path: '/Test-Collection/Users Submodule',
        created_at: '2026-10-14',
        children: [
          {
            id: 'req-nested',
            name: 'Get User Profile',
            type: 'request',
            method: 'GET',
            path: '/Test-Collection/Users Submodule/req-nested.json',
            created_at: '2026-10-14'
          }
        ]
      },
      {
        id: 'req-root',
        name: 'Root Healthcheck',
        type: 'request',
        method: 'HEAD',
        path: '/Test-Collection/req-root.json',
        created_at: '2026-10-14'
      }
    ]

    await colStore.selectRequest('req-nested')
    await colStore.selectRequest('req-root')

    const wrapper = mount(AppTabBar)
    const tabItems = wrapper.findAll('[data-test="app-tab-item"]')
    expect(tabItems).toHaveLength(2)

    // Tab 0: nested in folder -> shows folder path 'Users Submodule'
    const nestedTab = tabItems[0]
    const nestedPath = nestedTab.find('[data-test="tab-path"]')
    expect(nestedPath.exists()).toBe(true)
    expect(nestedPath.text()).toBe('Users Submodule')
    expect(nestedPath.attributes('title')).toBe('My API / Users Submodule / Get User Profile')

    // Tab 1: at root of collection -> shows collection name 'My API'
    const rootTab = tabItems[1]
    const rootPath = rootTab.find('[data-test="tab-path"]')
    expect(rootPath.exists()).toBe(true)
    expect(rootPath.text()).toBe('My API')
    expect(rootPath.attributes('title')).toBe('My API / Root Healthcheck')

    wrapper.unmount()
  })
})
