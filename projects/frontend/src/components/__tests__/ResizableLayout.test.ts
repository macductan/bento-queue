import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import App from '@/App.vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import ContentArea from '@/components/ContentArea.vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useResponseStore } from '@/stores/responseStore'
import { useMockServerStore } from '@/stores/mockServerStore'

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

      const headerWrapper = mount(AppHeader, {
        global: {
          stubs: {
            CollectionSwitcher: true,
            EnvSelector: true,
            ImportErrorModal: true,
            SettingsModal: true
          }
        }
      })

      // Git button exists in header and displays emerald badge when git_remote_url is configured
      const gitBtn = headerWrapper.find('[data-test="git-config-btn"]')
      expect(gitBtn.exists()).toBe(true)
      expect(headerWrapper.find('[data-test="git-status-badge-configured"]').exists()).toBe(true)

      // When gitConflictError is set, displays red conflict badge instead
      collectionStore.gitConflictError = { message: 'Conflict', files: ['req.json'] }
      await nextTick()
      expect(headerWrapper.find('[data-test="git-status-badge-conflict"]').exists()).toBe(true)

      await gitBtn.trigger('click')
      expect(uiStore.gitSyncModalOpen).toBe(true)

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

    it('renders AppHeader left cluster with CollectionSwitcher and right cluster with Git Sync pill, Mock Server pill, and Import Postman ^I button (CAP-2)', async () => {
      const collectionStore = useCollectionStore()
      const mockStore = useMockServerStore()

      collectionStore.collections = [
        { id: 'default', name: 'Default Collection', is_default: true } as any,
        { id: 'custom-1', name: 'Custom API', is_default: false } as any
      ]
      collectionStore.activeCollectionId = 'default'

      const headerWrapper = mount(AppHeader, {
        global: {
          stubs: {
            EnvSelector: true,
            ImportErrorModal: true,
            SettingsModal: true,
            CollectionModal: true,
            CollectionEnvModal: true
          }
        }
      })

      // Left cluster contains Logo, vertical divider bg-zinc-800, and CollectionSwitcher with Default badge
      const leftCluster = headerWrapper.find('header > div:first-child')
      expect(leftCluster.find('div.h-5.w-px.bg-zinc-800').exists()).toBe(true)
      expect(leftCluster.find('[data-test="collection-switcher-btn"]').exists()).toBe(true)
      expect(leftCluster.find('[data-test="collection-default-badge"]').exists()).toBe(true)
      expect(leftCluster.find('[data-test="collection-default-badge"]').text()).toBe('Default')

      // Git Sync Pill: unconfigured state
      const gitBtn = headerWrapper.find('[data-test="git-config-btn"]')
      expect(gitBtn.exists()).toBe(true)
      expect(gitBtn.text()).toContain('Git Sync')
      expect(headerWrapper.find('[data-test="git-status-badge-configured"]').exists()).toBe(false)
      expect(headerWrapper.find('[data-test="git-status-badge-conflict"]').exists()).toBe(false)

      // Git Sync Pill: configured without branch -> fallback 'main'
      collectionStore.collections[0]!.git_remote_url = 'https://github.com/org/repo.git'
      await nextTick()
      expect(headerWrapper.find('[data-test="git-status-badge-configured"]').exists()).toBe(true)
      expect(gitBtn.text()).toContain('Git: main')

      // Git Sync Pill: configured with branch 'develop'
      collectionStore.gitSyncStatus = {
        has_git_repo: true,
        remote_url: 'https://github.com/org/repo.git',
        branch: 'develop',
        has_changes: false,
        has_conflicts: false
      } as any
      await nextTick()
      expect(gitBtn.text()).toContain('Git: develop')

      // Git Sync Pill: conflict state with 2 files
      collectionStore.gitConflictError = { message: 'Conflict', files: ['a.json', 'b.json'] }
      await nextTick()
      expect(headerWrapper.find('[data-test="git-status-badge-conflict"]').exists()).toBe(true)
      expect(gitBtn.text()).toContain('Xung đột Git (2)')
      expect(gitBtn.classes()).toContain('text-amber-300')

      // Git Sync Pill: conflict state with empty files array -> fallback 1
      collectionStore.gitConflictError = { message: 'Conflict', files: [] }
      await nextTick()
      expect(gitBtn.text()).toContain('Xung đột Git (1)')

      // Git Sync Pill: conflict via gitSyncStatus when gitConflictError is null (conflict_files & conflicts fallback)
      collectionStore.gitConflictError = null
      collectionStore.gitSyncStatus = {
        has_git_repo: true,
        remote_url: 'https://github.com/org/repo.git',
        branch: 'develop',
        has_changes: true,
        has_conflicts: true,
        conflict_files: ['req1.json', 'req2.json', 'req3.json']
      } as any
      await nextTick()
      expect(headerWrapper.find('[data-test="git-status-badge-conflict"]').exists()).toBe(true)
      expect(gitBtn.text()).toContain('Xung đột Git (3)')

      // When conflict_files is [] but conflicts is non-empty, uses conflicts.length
      collectionStore.gitSyncStatus = {
        has_git_repo: true,
        remote_url: 'https://github.com/org/repo.git',
        branch: 'develop',
        has_changes: true,
        has_conflicts: true,
        conflict_files: [],
        conflicts: [{ file_path: 'req1.json' }, { file_path: 'req2.json' }]
      } as any
      await nextTick()
      expect(gitBtn.text()).toContain('Xung đột Git (2)')

      // Mock Server Pill: stopped vs running
      const mockBtn = headerWrapper.find('[data-test="open-mock-server-btn"]')
      expect(mockBtn.exists()).toBe(true)
      expect(mockBtn.text()).toContain('Mock Server')
      expect(headerWrapper.find('[data-test="mock-server-running-indicator"]').exists()).toBe(false)

      mockStore.running = true
      mockStore.port = 4010
      await nextTick()
      expect(headerWrapper.find('[data-test="mock-server-running-indicator"]').exists()).toBe(true)
      expect(mockBtn.text()).toContain('Mock :4010')
      expect(mockBtn.classes()).toContain('text-emerald-300')

      // Non-default port 5050 and invalid port 0 fallback to 4010
      mockStore.port = 5050
      await nextTick()
      expect(mockBtn.text()).toContain('Mock :5050')

      mockStore.port = 0
      await nextTick()
      expect(mockBtn.text()).toContain('Mock :4010')

      // Import Postman button: amber upload icon + 'Import Postman' + <kbd>^I</kbd>
      const importBtn = headerWrapper.find('[data-test="import-collection-btn"]')
      expect(importBtn.exists()).toBe(true)
      expect(importBtn.find('svg.text-amber-400').exists()).toBe(true)
      expect(importBtn.text()).toContain('Import Postman')
      expect(importBtn.find('kbd').text()).toBe('^I')

      headerWrapper.unmount()
    })
  })

  describe('ContentArea.vue Horizontal Splitter', () => {
    const mountContentArea = (containerHeight = 600, topOffset = 0, explicitlyOpened = true) => {
      const uiStore = useUiStore()
      if (explicitlyOpened) {
        uiStore.responsePaneExplicitlyOpened = true
        uiStore.responsePaneCollapsed = false
      }
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
      expect(splitter.classes()).toContain('h-1')
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

    it('collapses response pane by default when no response exists and expands on dock bar click', async () => {
      const collectionStore = useCollectionStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      // mount without explicitlyOpened
      const wrapper = mountContentArea(600, 0, false)
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="response-pane"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="response-dock-bar"]').exists()).toBe(true)

      const requestPane = wrapper.find('[data-test="request-pane"]')
      expect(requestPane.classes()).toContain('flex-1')

      // Click dock bar to uncollapse
      await wrapper.find('[data-test="response-dock-bar"]').trigger('click')
      expect(uiStore.responsePaneExplicitlyOpened).toBe(true)
      expect(uiStore.responsePaneCollapsed).toBe(false)
      expect(wrapper.find('[data-test="response-dock-bar"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="response-pane"]').exists()).toBe(true)

      // Collapse via store action
      uiStore.setResponsePaneCollapsed(true)
      await nextTick()
      expect(uiStore.responsePaneCollapsed).toBe(true)
      expect(wrapper.find('[data-test="response-dock-bar"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(false)

      wrapper.unmount()
    })

    it('automatically uncollapses response pane when a new response arrives', async () => {
      const collectionStore = useCollectionStore()
      const responseStore = useResponseStore()
      const uiStore = useUiStore()
      collectionStore.activeRequestId = 'req-1'

      // mount without explicitlyOpened, collapsed by default
      const wrapper = mountContentArea(600, 0, false)
      expect(wrapper.find('[data-test="response-dock-bar"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(false)

      // Simulate response arriving
      responseStore.response = {
        status_code: 200,
        status_text: 'OK',
        headers: {},
        body: '{"message":"hello"}',
        size_bytes: 19,
        duration_ms: 45
      } as any
      await nextTick()

      expect(uiStore.responsePaneCollapsed).toBe(false)
      expect(wrapper.find('[data-test="response-dock-bar"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="content-splitter"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="response-pane"]').exists()).toBe(true)

      wrapper.unmount()
    })
  })
})
