import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTabStore } from '../tabStore'
import { useCollectionStore, type TreeNode } from '../collectionStore'
import { useRequestStore } from '../requestStore'
import { useResponseStore } from '../responseStore'
import { useUiStore } from '../uiStore'
import { createMockRequest } from './utils'
import { model } from '../../../wailsjs/go/models'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  CreateRequest: vi.fn(),
  CreateFolder: vi.fn(),
  RenameRequest: vi.fn(),
  RenameFolder: vi.fn(),
  DeleteFolder: vi.fn(),
  DeleteRequest: vi.fn(),
  DuplicateRequest: vi.fn(),
  MoveRequest: vi.fn(),
  SelectPostmanFile: vi.fn(),
  ImportPostman: vi.fn(),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DuplicateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  UpdateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  GetRequest: vi.fn(),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SaveEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  SendRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  AbortRequest: vi.fn().mockResolvedValue({})
}))

import {
  GetRequest,
  SaveRequest,
  RenameRequest,
  RenameFolder,
  DeleteRequest,
  DeleteFolder,
  GetCollectionTree,
  SwitchCollection,
  DeleteCollection,
  SendRequest
} from '../../../wailsjs/go/main/App'

function resSuccess(data: any = {}): model.Result {
  return model.Result.createFrom({ success: true, data })
}

function resError(message: string, code = 'ERROR'): model.Result {
  return model.Result.createFrom({ success: false, error: { code, message } })
}

describe('tabStore - Multisession Tabs & Per-Tab Response State Persistence (CAP-1)', () => {
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
      children: [
        {
          id: 'folder-sub',
          name: 'OAuth Subfolder',
          type: 'folder',
          path: '/Test-Collection/Auth Module/OAuth Subfolder',
          created_at: '2026-10-14',
          children: [
            {
              id: 'req-child',
              name: 'Verify Token',
              type: 'request',
              method: 'POST',
              path: '/Test-Collection/Auth Module/OAuth Subfolder/req-child.json',
              created_at: '2026-10-14'
            }
          ]
        }
      ]
    }
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const colStore = useCollectionStore()
    colStore.activeCollectionId = 'Test-Collection'
    colStore.collections = [
      { id: 'Test-Collection', name: 'Test-Collection', is_default: false, is_active: true } as any
    ]
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

  it('opens multiple Request and Folder tabs without duplicates and activates existing tab when re-selected', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()

    await colStore.selectRequest('req-1')
    expect(tabStore.tabs).toHaveLength(1)
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(tabStore.activeTab).toEqual({
      id: 'request:req-1',
      entityId: 'req-1',
      type: 'request',
      name: 'GET Users',
      method: 'GET',
      isDirty: false
    })

    await colStore.selectRequest('req-2')
    expect(tabStore.tabs).toHaveLength(2)
    expect(tabStore.activeTabId).toBe('request:req-2')

    await colStore.setActiveFolderId('folder-auth')
    expect(tabStore.tabs).toHaveLength(3)
    expect(tabStore.tabs.map(t => t.id)).toEqual([
      'request:req-1',
      'request:req-2',
      'folder:folder-auth'
    ])
    expect(tabStore.activeTabId).toBe('folder:folder-auth')
    expect(colStore.activeFolderId).toBe('folder-auth')
    expect(colStore.activeRequestId).toBeNull()

    // Re-selecting req-1 from Sidebar activates existing tab instead of creating a 4th tab
    await colStore.selectRequest('req-1')
    expect(tabStore.tabs).toHaveLength(3)
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(colStore.activeRequestId).toBe('req-1')
    expect(colStore.activeFolderId).toBeNull()

    // Re-selecting folder-auth via setActiveFolderId activates existing folder tab
    await colStore.setActiveFolderId('folder-auth')
    expect(tabStore.tabs).toHaveLength(3)
    expect(tabStore.activeTabId).toBe('folder:folder-auth')
  })

  it('removes newly opened tab, restores previous activeRequestId and requestStore state, and shows toast if loadRequest fails on a tab that did not exist before', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const reqStore = useRequestStore()
    const uiStore = useUiStore()
    const toastSpy = vi.spyOn(uiStore, 'showToast')

    await colStore.selectRequest('req-1')
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')

    // Now simulate loadRequest failing for a new request 'req-broken'
    vi.mocked(GetRequest).mockResolvedValueOnce(resError('Lỗi đọc file request', 'IO_ERROR'))

    await colStore.selectRequest('req-broken')

    expect(toastSpy).toHaveBeenCalledWith('Lỗi đọc file request')
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(colStore.activeRequestId).toBe('req-1')
    expect(reqStore.current?.id).toBe('req-1')
  })

  it('preserves and restores responseStore state per Request tab without leaking across Request or Folder tabs', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const resStore = useResponseStore()

    // Open req-1 and populate responseStore
    await colStore.selectRequest('req-1')
    const mockRes1 = {
      status_code: 200,
      status_text: '200 OK',
      headers: { 'content-type': ['application/json'] },
      body: '{"users":[1,2]}',
      time_ms: 42,
      size_bytes: 15,
      timestamp: '2026-10-14T10:00:00Z',
      truncated: false,
      is_binary: false
    }
    resStore.response = mockRes1

    // Switch to folder-auth -> req-1 response is cached and responseStore display is reset
    await colStore.setActiveFolderId('folder-auth')
    expect(tabStore.responseCache['req-1']?.response).toEqual(mockRes1)
    expect(resStore.response).toBeNull()

    // Switch to req-2 (never executed) -> responseStore must be clean (null), no leak from req-1
    await colStore.selectRequest('req-2')
    expect(resStore.response).toBeNull()
    expect(resStore.error).toBeNull()
    expect(resStore.loading).toBe(false)
    expect(resStore.urlInvalid).toBe(false)

    // Switch back to req-1 via tabStore.activateTab -> restores 200 OK response
    await tabStore.activateTab('request:req-1')
    expect(resStore.response).toEqual(mockRes1)
    expect(resStore.response?.status_code).toBe(200)

    // Set an error state on req-2 and verify both req-1 and req-2 states are isolated
    await tabStore.activateTab('request:req-2')
    expect(resStore.response).toBeNull()
    resStore.error = { code: 'TIMEOUT', message: 'Request timed out' }

    await tabStore.activateTab('request:req-1')
    expect(resStore.response?.status_code).toBe(200)
    expect(resStore.error).toBeNull()

    await tabStore.activateTab('request:req-2')
    expect(resStore.response).toBeNull()
    expect(resStore.error).toEqual({ code: 'TIMEOUT', message: 'Request timed out' })
  })

  it('isolates in-flight responseStore.send() when user switches tabs before SendRequest resolves', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const resStore = useResponseStore()

    await colStore.selectRequest('req-1')

    let resolveReq1!: (val: any) => void
    vi.mocked(SendRequest).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveReq1 = resolve
        })
    )

    // Start sending req-1 (in-flight)
    const sendPromise = resStore.send()
    expect(resStore.loading).toBe(true)

    // Switch to Tab B (req-2) while req-1 is still in-flight
    await colStore.selectRequest('req-2')
    expect(colStore.activeRequestId).toBe('req-2')
    expect(resStore.loading).toBe(false)
    expect(resStore.response).toBeNull()
    expect(tabStore.responseCache['req-1']?.loading).toBe(true)

    // Now resolve SendRequest for req-1 while user is on req-2
    const completedRes1 = {
      status_code: 201,
      status_text: '201 Created',
      headers: {},
      body: '{"created":true}',
      time_ms: 85,
      size_bytes: 16,
      timestamp: '2026-10-14T10:05:00Z',
      truncated: false,
      is_binary: false
    }
    resolveReq1(resSuccess(completedRes1))
    await sendPromise

    // Tab B (req-2) must NOT have its responseStore overwritten by req-1's late response
    expect(colStore.activeRequestId).toBe('req-2')
    expect(resStore.response).toBeNull()
    expect(resStore.loading).toBe(false)

    // Meanwhile, responseCache['req-1'] has the completed response with loading: false
    expect(tabStore.responseCache['req-1']).toEqual({
      response: completedRes1,
      error: null,
      loading: false,
      urlInvalid: false
    })

    // Switching back to Tab A (req-1) restores the completed 201 response
    await tabStore.activateTab('request:req-1')
    expect(resStore.response).toEqual(completedRes1)
    expect(resStore.loading).toBe(false)
  })

  it('guards requestStore.loadRequest against out-of-order GetRequest resolutions during rapid tab switching', async () => {
    const colStore = useCollectionStore()
    const reqStore = useRequestStore()

    let resolveSlowReq1!: (val: any) => void
    vi.mocked(GetRequest)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSlowReq1 = resolve
          })
      )
      .mockImplementationOnce(async () =>
        resSuccess(
          createMockRequest({
            id: 'req-2',
            name: 'POST Login',
            method: 'POST',
            url: 'https://api.example.com/req-2'
          })
        )
      )

    const p1 = colStore.selectRequest('req-1')
    const p2 = colStore.selectRequest('req-2')
    await p2

    expect(colStore.activeRequestId).toBe('req-2')
    expect(reqStore.current?.id).toBe('req-2')

    // Now the stale GetRequest('req-1') resolves late -> must be ignored
    resolveSlowReq1(
      resSuccess(
        createMockRequest({
          id: 'req-1',
          name: 'GET Users',
          method: 'GET',
          url: 'https://api.example.com/req-1'
        })
      )
    )
    await p1

    expect(colStore.activeRequestId).toBe('req-2')
    expect(reqStore.current?.id).toBe('req-2')
  })

  it('closes active tab, flushes if dirty, deletes responseCache, activates adjacent tab at Math.min(idx, tabs.length - 1), and resets to empty state when all closed', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const reqStore = useRequestStore()
    const resStore = useResponseStore()

    await colStore.selectRequest('req-1')
    resStore.response = { status_code: 200 } as any

    await colStore.selectRequest('req-2')
    resStore.response = { status_code: 201 } as any

    await colStore.setActiveFolderId('folder-auth')

    // Tabs: [T0: request:req-1, T1: request:req-2, T2: folder:folder-auth]
    // Activate T1 (request:req-2) and make it dirty
    await tabStore.activateTab('request:req-2')
    expect(tabStore.activeTabId).toBe('request:req-2')
    reqStore.current!.url = 'https://api.example.com/req-2-modified'
    expect(reqStore.isDirty).toBe(true)
    expect(tabStore.activeTab?.isDirty).toBe(true)

    const flushSpy = vi.spyOn(reqStore, 'flush').mockResolvedValueOnce(true)

    // Close T1 (idx = 1) -> should flush, delete responseCache['req-2'], and activate T2 (folder:folder-auth)
    const closedT1 = await tabStore.closeTab('request:req-2')
    expect(closedT1).toBe(true)
    expect(flushSpy).toHaveBeenCalledTimes(1)
    expect(tabStore.responseCache['req-2']).toBeUndefined()
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1', 'folder:folder-auth'])
    expect(tabStore.activeTabId).toBe('folder:folder-auth')
    expect(colStore.activeFolderId).toBe('folder-auth')
    expect(colStore.activeRequestId).toBeNull()
    expect(resStore.response).toBeNull()

    // Close T2 (folder:folder-auth, now at idx = 1) -> activates T0 (request:req-1 at idx = 0) and restores req-1 response
    const closedT2 = await tabStore.closeTab('folder:folder-auth')
    expect(closedT2).toBe(true)
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(colStore.activeRequestId).toBe('req-1')
    expect(resStore.response?.status_code).toBe(200)

    // Close last remaining tab T0 (request:req-1) -> empty state
    const closedT0 = await tabStore.closeTab('request:req-1')
    expect(closedT0).toBe(true)
    expect(tabStore.tabs).toHaveLength(0)
    expect(tabStore.activeTabId).toBeNull()
    expect(colStore.activeRequestId).toBeNull()
    expect(colStore.activeFolderId).toBeNull()
    expect(reqStore.current).toBeNull()
    expect(resStore.response).toBeNull()
  })

  it('aborts closing active tab if flush fails (returns false) for both Request and Folder tabs', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const reqStore = useRequestStore()

    await colStore.selectRequest('req-1')
    reqStore.current!.url = 'https://api.example.com/unsaved-fail'
    expect(reqStore.isDirty).toBe(true)

    vi.spyOn(reqStore, 'flush').mockResolvedValueOnce(false)

    const closedReq = await tabStore.closeTab('request:req-1')
    expect(closedReq).toBe(false)
    expect(tabStore.tabs).toHaveLength(1)
    expect(tabStore.activeTabId).toBe('request:req-1')

    // Now test Folder tab flush failure
    vi.spyOn(reqStore, 'flush').mockResolvedValueOnce(true)
    await colStore.setActiveFolderId('folder-auth')
    tabStore.setTabDirty('folder', 'folder-auth', true)
    tabStore.registerFolderFlush(async () => false)

    const closedFolder = await tabStore.closeTab('folder:folder-auth')
    expect(closedFolder).toBe(false)
    expect(tabStore.tabs.some(t => t.id === 'folder:folder-auth')).toBe(true)
    expect(tabStore.activeTabId).toBe('folder:folder-auth')
  })

  it('closes inactive tab without changing activeTabId or interrupting active editor', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const resStore = useResponseStore()

    await colStore.selectRequest('req-1')
    resStore.response = { status_code: 200 } as any

    await colStore.selectRequest('req-2')
    resStore.response = { status_code: 204 } as any

    // Active is req-2; close inactive req-1
    const closed = await tabStore.closeTab('request:req-1')
    expect(closed).toBe(true)
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-2'])
    expect(tabStore.activeTabId).toBe('request:req-2')
    expect(colStore.activeRequestId).toBe('req-2')
    expect(tabStore.responseCache['req-1']).toBeUndefined()
    expect(resStore.response?.status_code).toBe(204)
  })

  it('synchronizes tab name, HTTP method, and isDirty immediately on rename, method change, edit, and save', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const reqStore = useRequestStore()

    await colStore.selectRequest('req-1')
    await colStore.setActiveFolderId('folder-auth')
    await tabStore.activateTab('request:req-1')

    // 1. Change HTTP Method on current request
    reqStore.current!.method = 'DELETE'
    expect(tabStore.activeTab?.method).toBe('DELETE')
    expect(tabStore.activeTab?.isDirty).toBe(true)

    // 2. Save request -> isDirty becomes false
    vi.mocked(SaveRequest).mockResolvedValueOnce(resSuccess({}))
    await reqStore.saveCurrent({ silent: true })
    expect(reqStore.isDirty).toBe(false)
    expect(tabStore.activeTab?.isDirty).toBe(false)

    // 3. Rename Request via collectionStore.renameRequest
    vi.mocked(RenameRequest).mockResolvedValueOnce(resSuccess({ id: 'req-1', name: 'Remove User' }))
    const updatedTree = JSON.parse(JSON.stringify(sampleTree))
    updatedTree[0].name = 'Remove User'
    vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(updatedTree))

    await colStore.renameRequest('req-1', 'Remove User')
    expect(tabStore.tabs.find(t => t.id === 'request:req-1')?.name).toBe('Remove User')

    // 4. Rename Folder via collectionStore.renameFolder
    vi.mocked(RenameFolder).mockResolvedValueOnce(resSuccess({ id: 'folder-auth', name: 'Security Module' }))
    updatedTree[2].name = 'Security Module'
    vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(updatedTree))

    await colStore.renameFolder('folder-auth', 'Security Module')
    expect(tabStore.tabs.find(t => t.id === 'folder:folder-auth')?.name).toBe('Security Module')
  })

  it('closes all descendant tabs (parent folder, subfolder, child request) without flushing when deleting parent folder, and activates surviving outside tab', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const reqStore = useRequestStore()

    // Open outside tab req-1, then folder-auth, folder-sub, and req-child (active)
    await colStore.selectRequest('req-1')
    await colStore.setActiveFolderId('folder-auth')
    await colStore.setActiveFolderId('folder-sub')
    await colStore.selectRequest('req-child')

    // Mark req-child dirty to ensure deleteFolder does NOT flush deleted entities
    reqStore.current!.url = 'https://api.example.com/dirty-deleted-child'
    const flushSpy = vi.spyOn(reqStore, 'flush')

    expect(tabStore.tabs.map(t => t.id)).toEqual([
      'request:req-1',
      'folder:folder-auth',
      'folder:folder-sub',
      'request:req-child'
    ])
    expect(tabStore.activeTabId).toBe('request:req-child')

    vi.mocked(DeleteFolder).mockResolvedValueOnce(resSuccess(null))
    vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(sampleTree.slice(0, 2)))

    await colStore.deleteFolder('folder-auth')

    expect(flushSpy).not.toHaveBeenCalled()
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(colStore.activeRequestId).toBe('req-1')
    expect(tabStore.responseCache['req-child']).toBeUndefined()
  })

  it('closes request tab on deleteRequest and clears all tabs and responseCache on switchCollection, deleteCollection, and refresh', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const resStore = useResponseStore()

    await colStore.selectRequest('req-1')
    resStore.response = { status_code: 200 } as any
    await colStore.selectRequest('req-2')
    resStore.response = { status_code: 201 } as any

    // Delete req-2 -> closes request:req-2 and activates request:req-1
    vi.mocked(DeleteRequest).mockResolvedValueOnce(resSuccess(null))
    vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([sampleTree[0]]))

    await colStore.deleteRequest('req-2')
    expect(tabStore.tabs.map(t => t.id)).toEqual(['request:req-1'])
    expect(tabStore.activeTabId).toBe('request:req-1')
    expect(tabStore.responseCache['req-2']).toBeUndefined()

    // Switch collection -> clears all tabs and responseCache
    vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))
    await colStore.switchCollection('Test-Collection-2', { force: true })
    expect(tabStore.tabs).toHaveLength(0)
    expect(tabStore.activeTabId).toBeNull()
    expect(tabStore.responseCache).toEqual({})

    // Open a tab again, then refresh -> clears all tabs
    await colStore.selectRequest('req-1')
    expect(tabStore.tabs).toHaveLength(1)
    await colStore.refresh()
    expect(tabStore.tabs).toHaveLength(0)
    expect(tabStore.activeTabId).toBeNull()

    // Open a tab again, then delete active collection -> clears all tabs
    await colStore.selectRequest('req-1')
    expect(tabStore.tabs).toHaveLength(1)
    vi.mocked(DeleteCollection).mockResolvedValueOnce(resSuccess({ active_collection: 'default' }))
    await colStore.deleteCollection('Test-Collection-2')
    expect(tabStore.tabs).toHaveLength(0)
    expect(tabStore.activeTabId).toBeNull()
  })
})
