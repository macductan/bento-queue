import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import App from '@/App.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import ContentArea from '@/components/ContentArea.vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  GetRequest: vi.fn().mockResolvedValue({ success: true, data: null }),
  SaveRequest: vi.fn().mockResolvedValue({ success: true })
}))

describe('ResizableLayout - Vertical & Horizontal Splitters', () => {
  const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width
    })
  }

  beforeEach(() => {
    localStorage.clear()
    document.body.style.userSelect = ''
    setViewportWidth(1200)
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.style.userSelect = ''
  })

  describe('AppSidebar & App.vue Vertical Splitter', () => {
    const mountApp = () => {
      return mount(App, {
        global: {
          stubs: {
            AppHeader: true,
            CollectionSwitcher: true,
            TreeNodeRow: true,
            ContentArea: true,
            ToastNotification: true,
            ConfirmDialog: true,
            TreeContextMenu: true,
            UnsavedChangesDialog: true,
            EnvModal: true
          }
        }
      })
    }

    it('applies dynamic width and minWidth from uiStore.sidebarWidth to AppSidebar', async () => {
      const uiStore = useUiStore()
      const wrapper = mount(AppSidebar, {
        global: {
          stubs: {
            CollectionSwitcher: true,
            TreeNodeRow: true
          }
        }
      })

      const nav = wrapper.find('nav')
      expect(nav.classes()).toContain('shrink-0')
      expect(nav.attributes('style')).toContain('width: 260px')
      expect(nav.attributes('style')).toContain('min-width: 260px')

      uiStore.setSidebarWidth(340, 1200)
      await nextTick()
      expect(nav.attributes('style')).toContain('width: 340px')
      expect(nav.attributes('style')).toContain('min-width: 340px')

      wrapper.unmount()
    })

    it('drags vertical splitter to resize sidebar, clamps bounds, locks userSelect, and persists to localStorage', async () => {
      const uiStore = useUiStore()
      const wrapper = mountApp()

      const splitter = wrapper.find('[data-test="sidebar-splitter"]')
      expect(splitter.exists()).toBe(true)
      expect(splitter.classes()).toContain('w-1.5')
      expect(splitter.classes()).toContain('cursor-col-resize')

      await splitter.trigger('mousedown', { clientX: 260, button: 0 })
      expect(document.body.style.userSelect).toBe('none')
      expect(splitter.classes()).toContain('bg-brand-primary')

      // Drag to 340px
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 340 }))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(340)
      expect(localStorage.getItem('hecto_sidebar_width')).toBe('340')

      // Drag below minimum (100px -> clamped to 180px)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(180)
      expect(localStorage.getItem('hecto_sidebar_width')).toBe('180')

      // Drag above maximum in 1200px viewport (800px -> clamped to 520px)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(520)
      expect(localStorage.getItem('hecto_sidebar_width')).toBe('520')

      // Drag in 800px viewport (500px -> clamped to 400px = 50% of 800px)
      setViewportWidth(800)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(400)
      expect(localStorage.getItem('hecto_sidebar_width')).toBe('400')

      // Release mouse
      window.dispatchEvent(new MouseEvent('mouseup'))
      await nextTick()
      expect(document.body.style.userSelect).toBe('')

      // Subsequent mousemove after mouseup does not resize
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 220 }))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(400)

      wrapper.unmount()
    })

    it('ignores non-primary mouse button clicks on vertical splitter', async () => {
      const uiStore = useUiStore()
      const wrapper = mountApp()

      const splitter = wrapper.find('[data-test="sidebar-splitter"]')
      await splitter.trigger('mousedown', { clientX: 260, button: 2 })
      expect(document.body.style.userSelect).toBe('')
      expect(splitter.classes()).not.toContain('bg-brand-primary')

      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 360 }))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(260)

      wrapper.unmount()
    })

    it('clamps initial sidebarWidth to window.innerWidth on mount and calls envStore.syncActiveEnvFromCollection after initial loads', async () => {
      localStorage.setItem('hecto_sidebar_width', '500')
      setViewportWidth(800)
      setActivePinia(createPinia())

      const uiStore = useUiStore()
      const envStore = useEnvironmentStore()
      const syncSpy = vi.spyOn(envStore, 'syncActiveEnvFromCollection')

      expect(uiStore.sidebarWidth).toBe(500)

      const wrapper = mountApp()
      await flushPromises()

      expect(uiStore.sidebarWidth).toBe(400)
      expect(syncSpy).toHaveBeenCalled()

      wrapper.unmount()
    })

    it('resets sidebarWidth to 260 on double-click', async () => {
      const uiStore = useUiStore()
      uiStore.setSidebarWidth(340, 1200)
      const wrapper = mountApp()

      const splitter = wrapper.find('[data-test="sidebar-splitter"]')
      await splitter.trigger('dblclick')

      expect(uiStore.sidebarWidth).toBe(260)
      expect(localStorage.getItem('hecto_sidebar_width')).toBe('260')

      wrapper.unmount()
    })

    it('re-clamps sidebarWidth on window resize and cleans up listeners/userSelect on unmount', async () => {
      const uiStore = useUiStore()
      uiStore.setSidebarWidth(500, 1200)
      const wrapper = mountApp()

      // Window shrinks to 700px -> max is 350px
      setViewportWidth(700)
      window.dispatchEvent(new Event('resize'))
      await nextTick()
      expect(uiStore.sidebarWidth).toBe(350)

      // Start dragging then unmount mid-drag
      const splitter = wrapper.find('[data-test="sidebar-splitter"]')
      await splitter.trigger('mousedown', { clientX: 350, button: 0 })
      expect(document.body.style.userSelect).toBe('none')

      wrapper.unmount()
      expect(document.body.style.userSelect).toBe('')

      // Moving mouse after unmount should not affect store
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }))
      expect(uiStore.sidebarWidth).toBe(350)
    })

    it('consolidates sidebar actions into Git button (with status badge) and + dropdown menu (Enhancement 4)', async () => {
      const uiStore = useUiStore()
      const collectionStore = useCollectionStore()
      collectionStore.collections = [
        { id: 'default', name: 'Default', is_default: true, git_remote_url: 'https://github.com/org/repo.git' } as any
      ]
      collectionStore.activeCollectionId = 'default'

      const wrapper = mount(AppSidebar, {
        global: {
          stubs: {
            CollectionSwitcher: true,
            TreeNodeRow: true
          }
        }
      })

      // Old standalone pull/push buttons are removed
      expect(wrapper.find('[data-test="git-pull-btn"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="git-push-btn"]').exists()).toBe(false)

      // Git button exists and displays emerald badge when git_remote_url is configured
      const gitBtn = wrapper.find('[data-test="git-config-btn"]')
      expect(gitBtn.exists()).toBe(true)
      expect(wrapper.find('[data-test="git-status-badge-configured"]').exists()).toBe(true)

      // When gitConflictError is set, displays red conflict badge instead
      collectionStore.gitConflictError = { message: 'Conflict', files: ['req.json'] }
      await nextTick()
      expect(wrapper.find('[data-test="git-status-badge-conflict"]').exists()).toBe(true)

      await gitBtn.trigger('click')
      expect(uiStore.gitSyncModalOpen).toBe(true)

      // '+' dropdown button toggles New Request / New Folder menu
      const createReqSpy = vi.spyOn(collectionStore, 'createRequest').mockResolvedValue(undefined as any)
      const createFolderSpy = vi.spyOn(collectionStore, 'createFolder').mockResolvedValue(undefined as any)

      const addBtn = wrapper.find('[data-test="sidebar-add-btn"]')
      expect(addBtn.exists()).toBe(true)
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(false)

      await addBtn.trigger('click')
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="add-request-item"]').text()).toContain('New Request')
      expect(wrapper.find('[data-test="add-folder-item"]').text()).toContain('New Folder')

      // Clicking New Request triggers createRequest and closes dropdown
      await wrapper.find('[data-test="add-request-item"]').trigger('click')
      expect(createReqSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(false)

      // Reopen and click New Folder triggers createFolder and closes dropdown
      await addBtn.trigger('click')
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(true)
      await wrapper.find('[data-test="add-folder-item"]').trigger('click')
      expect(createFolderSpy).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(false)

      // Reopen and press Escape closes dropdown
      await addBtn.trigger('click')
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(true)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(false)

      // Reopen and clickaway closes dropdown
      await addBtn.trigger('click')
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(true)
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await nextTick()
      expect(wrapper.find('[data-test="sidebar-add-dropdown"]').exists()).toBe(false)

      wrapper.unmount()
    })
  })

  describe('ContentArea.vue Horizontal Splitter', () => {
    const mountContentArea = (containerHeight = 600, topOffset = 0) => {
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

      const mainEl = wrapper.find('main').element as HTMLElement
      vi.spyOn(mainEl, 'getBoundingClientRect').mockReturnValue({
        top: topOffset,
        left: 0,
        bottom: topOffset + containerHeight,
        right: 800,
        width: 800,
        height: containerHeight,
        x: 0,
        y: topOffset,
        toJSON: () => ({})
      })

      return wrapper
    }

    it('hides horizontal splitter and ResponseViewer when no request is active', async () => {
      const collectionStore = useCollectionStore()
      collectionStore.activeRequestId = null
      collectionStore.activeFolderId = null

      const wrapper = mountContentArea()
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="response-pane"]').exists()).toBe(false)

      const requestPane = wrapper.find('[data-test="request-pane"]')
      expect(requestPane.classes()).toContain('flex-1')
      expect(requestPane.attributes('style')).toBeUndefined()

      // Switch to FolderEditor -> still no splitter or ResponseViewer
      collectionStore.activeFolderId = 'folder-1'
      await nextTick()
      expect(wrapper.find('[data-test="stub-folder-editor"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="response-pane"]').exists()).toBe(false)

      wrapper.unmount()
    })

    it('renders horizontal splitter and drags to resize requestPaneRatio with 120px minimum pane height', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      const wrapper = mountContentArea(600)
      const splitter = wrapper.find('[data-test="content-splitter"]')
      const requestPane = wrapper.find('[data-test="request-pane"]')
      const responsePane = wrapper.find('[data-test="response-pane"]')

      expect(splitter.exists()).toBe(true)
      expect(splitter.classes()).toContain('h-1.5')
      expect(splitter.classes()).toContain('cursor-row-resize')
      expect(responsePane.exists()).toBe(true)
      expect(requestPane.classes()).not.toContain('shrink-0')
      expect(requestPane.attributes('style')).toContain('height: 50%')
      expect(requestPane.attributes('style')).toContain('min-height: 120px')

      // Start dragging
      await splitter.trigger('mousedown', { clientY: 300, button: 0 })
      expect(document.body.style.userSelect).toBe('none')
      expect(splitter.classes()).toContain('bg-brand-primary')

      // Drag to 210px in 600px container -> 35%
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 210 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(35)
      expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('35')
      expect(requestPane.attributes('style')).toContain('height: 35%')

      // Drag near top edge (30px in 600px container) -> clamped at 20% (120px / 600px)
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 30 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(20)
      expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('20')

      // Drag near bottom edge (570px in 600px container) -> clamped at 80% (480px / 600px)
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 570 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(80)
      expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('80')

      // Release mouse
      window.dispatchEvent(new MouseEvent('mouseup'))
      await nextTick()
      expect(document.body.style.userSelect).toBe('')

      // Subsequent mousemove after mouseup does not resize
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 300 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(80)

      wrapper.unmount()
    })

    it('ignores non-primary mouse button clicks on horizontal splitter', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      const wrapper = mountContentArea(600)
      const splitter = wrapper.find('[data-test="content-splitter"]')
      await splitter.trigger('mousedown', { clientY: 300, button: 2 })
      expect(document.body.style.userSelect).toBe('')
      expect(splitter.classes()).not.toContain('bg-brand-primary')

      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 180 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(50)

      wrapper.unmount()
    })

    it('calculates horizontal splitter ratio accurately with non-zero container top offset and re-clamps on window resize', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      const wrapper = mountContentArea(600, 48)
      const splitter = wrapper.find('[data-test="content-splitter"]')

      await splitter.trigger('mousedown', { clientY: 348, button: 0 })
      // clientY = 258 with top = 48 -> relativeY = 210 -> 210 / 600 = 35%
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 258 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(35)

      window.dispatchEvent(new MouseEvent('mouseup'))

      // Set ratio to 85% (from a large container), then trigger window resize with 600px container -> clamps to 80%
      uiStore.setRequestPaneRatio(85, 1000)
      expect(uiStore.requestPaneRatio).toBe(85)
      window.dispatchEvent(new Event('resize'))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(80)

      wrapper.unmount()
    })

    it('cleans up drag state and listeners when activeRequestId becomes null mid-drag without unmounting', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      const wrapper = mountContentArea(600)
      const splitter = wrapper.find('[data-test="content-splitter"]')
      await splitter.trigger('mousedown', { clientY: 300, button: 0 })
      expect(document.body.style.userSelect).toBe('none')

      collectionStore.activeRequestId = null
      await nextTick()
      expect(document.body.style.userSelect).toBe('')

      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 210 }))
      await nextTick()
      expect(uiStore.requestPaneRatio).toBe(50)

      wrapper.unmount()
    })

    it('resets requestPaneRatio to 50 on double-click', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'
      uiStore.setRequestPaneRatio(35, 600)

      const wrapper = mountContentArea(600)
      const splitter = wrapper.find('[data-test="content-splitter"]')
      await splitter.trigger('dblclick')

      expect(uiStore.requestPaneRatio).toBe(50)
      expect(localStorage.getItem('hecto_request_pane_ratio')).toBe('50')

      wrapper.unmount()
    })

    it('cleans up drag state and listeners when unmounted mid-drag', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      const wrapper = mountContentArea(600)
      const splitter = wrapper.find('[data-test="content-splitter"]')
      await splitter.trigger('mousedown', { clientY: 300, button: 0 })
      expect(document.body.style.userSelect).toBe('none')

      wrapper.unmount()
      expect(document.body.style.userSelect).toBe('')

      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 180 }))
      expect(uiStore.requestPaneRatio).toBe(50)
    })
  })
})
