import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GitConflictResolverModal from '../GitConflictResolverModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'

const resolveGitConflictMock = vi.fn()
const abortGitMergeMock = vi.fn()
const listCollectionsMock = vi.fn()
const getTreeMock = vi.fn()
const getEnvsMock = vi.fn()
const getActiveEnvMock = vi.fn()
const getRequestMock = vi.fn()

vi.mock('../../../wailsjs/go/main/App', () => ({
  ResolveGitConflict: (...args: any[]) => resolveGitConflictMock(...args),
  AbortGitMerge: (...args: any[]) => abortGitMergeMock(...args),
  ListCollections: (...args: any[]) => listCollectionsMock(...args),
  GetCollectionTree: (...args: any[]) => getTreeMock(...args),
  GetEnvironments: (...args: any[]) => getEnvsMock(...args),
  GetActiveEnvironment: (...args: any[]) => getActiveEnvMock(...args),
  GetRequest: (...args: any[]) => getRequestMock(...args),
  SaveCollectionGitRemote: vi.fn(),
  GetCollectionGitStatus: vi.fn(),
  GitPullCollection: vi.fn(),
  GitPushCollection: vi.fn(),
  GitPushCollectionToBranch: vi.fn(),
  GitClearAndPullCollection: vi.fn(),
  GitStashAndPullCollection: vi.fn(),
  GitListLocalBranches: vi.fn(),
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
  SwitchCollection: vi.fn(),
  CreateCollection: vi.fn(),
  RenameCollection: vi.fn(),
  UpdateCollection: vi.fn(),
  DeleteCollection: vi.fn(),
  DuplicateCollection: vi.fn()
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(() => () => {})
}))

describe('GitConflictResolverModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    listCollectionsMock.mockResolvedValue({
      success: true,
      data: [{ id: 'Test-Collection', name: 'Test-Collection', is_active: true }]
    })
    getTreeMock.mockResolvedValue({ success: true, data: [] })
    getEnvsMock.mockResolvedValue({ success: true, data: [] })
    getActiveEnvMock.mockResolvedValue({ success: true, data: '' })
    getRequestMock.mockResolvedValue({ success: true, data: null })
  })

  it('disables submit button until all fields are resolved, then builds merged payload for scalars, JSON body keys, and KVPair rows', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.activeCollectionId = 'Test-Collection'
    collectionStore.gitSyncStatus = {
      has_git_repo: true,
      remote_url: 'https://github.com/org/test-collection.git',
      branch: 'main',
      has_changes: true,
      has_conflicts: true,
      conflict_files: ['users/get-user.json'],
      conflicts: [
        {
          file_path: 'users/get-user.json',
          entity_type: 'request',
          entity_name: 'Get User',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: 'url',
              label: 'URL',
              base_value: 'https://api.example.com/v1/users',
              ours_value: 'https://api.example.com/v2/users-local',
              theirs_value: 'https://api.example.com/v2/users-remote'
            },
            {
              field_path: 'body.content.page',
              label: 'Body JSON: page',
              base_value: 1,
              ours_value: 2,
              theirs_value: 5
            },
            {
              field_path: 'headers.Authorization#0',
              label: 'Header: Authorization',
              base_value: { key: 'Authorization', value: 'Bearer old', enabled: true },
              ours_value: { key: 'Authorization', value: 'Bearer local-tok', enabled: true },
              theirs_value: { key: 'Authorization', value: 'Bearer remote-tok', enabled: false }
            }
          ],
          merged_preview: {
            id: 'req-1',
            name: 'Get User',
            method: 'POST',
            url: 'https://api.example.com/v2/users-local',
            headers: [
              { key: 'Authorization', value: 'Bearer local-tok', enabled: true },
              { key: 'Authorization', value: 'Bearer backup', enabled: false }
            ],
            body: {
              type: 'json',
              content: '{\n  "limit": 20,\n  "page": 2\n}'
            }
          }
        }
      ]
    } as any

    resolveGitConflictMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false,
        conflicts: []
      }
    })

    uiStore.gitConflictModalOpen = true
    const wrapper = mount(GitConflictResolverModal)

    const submitBtn = wrapper.find('[data-test="git-resolve-submit-btn"]')
    const progressBadge = wrapper.find('[data-test="git-conflict-progress-badge"]')

    expect(progressBadge.text()).toContain('Đã xử lý 0/1 file')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)

    // Pick field 0 (url) -> Local (ours)
    await wrapper.find('[data-test="pick-field-ours-0"]').trigger('click')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)

    // Pick field 1 (body.content.page) -> Remote (theirs = 5)
    await wrapper.find('[data-test="pick-field-theirs-1"]').trigger('click')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)

    // Pick field 2 (headers.Authorization#0) -> Remote (theirs)
    await wrapper.find('[data-test="pick-field-theirs-2"]').trigger('click')

    // Now all 3 fields in the file are resolved
    expect(progressBadge.text()).toContain('Đã xử lý 1/1 file')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)

    await submitBtn.trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(resolveGitConflictMock).toHaveBeenCalledTimes(1)
    const [collId, resolvedPayload] = resolveGitConflictMock.mock.calls[0]
    expect(collId).toBe('Test-Collection')

    const mergedReq = resolvedPayload['users/get-user.json']
    expect(mergedReq.url).toBe('https://api.example.com/v2/users-local')
    expect(JSON.parse(mergedReq.body.content)).toEqual({
      limit: 20,
      page: 5
    })
    expect(mergedReq.headers).toHaveLength(2)
    expect(mergedReq.headers[0]).toEqual({
      key: 'Authorization',
      value: 'Bearer remote-tok',
      enabled: false
    })
    expect(mergedReq.headers[1]).toEqual({
      key: 'Authorization',
      value: 'Bearer backup',
      enabled: false
    })
    expect(uiStore.gitConflictModalOpen).toBe(false)
    expect(uiStore.toast?.text).toBe('Đã giải quyết xung đột và hoàn tất đồng bộ Git')
  })

  it('supports delete_edit conflict resolution (keep vs delete) and multi-file global quick actions', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.activeCollectionId = 'Test-Collection'
    collectionStore.gitSyncStatus = {
      has_git_repo: true,
      branch: 'main',
      has_changes: true,
      has_conflicts: true,
      conflict_files: ['req-deleted.json', 'environments/dev.json'],
      conflicts: [
        {
          file_path: 'req-deleted.json',
          entity_type: 'request',
          entity_name: 'Deleted Request',
          conflict_type: 'delete_edit',
          fields: [],
          theirs_data: { id: 'req-del', name: 'Deleted Request (Remote Edited)', method: 'GET', url: 'https://example.com' },
          merged_preview: { id: 'req-del', name: 'Deleted Request (Remote Edited)', method: 'GET', url: 'https://example.com' }
        },
        {
          file_path: 'environments/dev.json',
          entity_type: 'environment',
          entity_name: 'Dev Env',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: 'variables.API_HOST#0',
              label: 'Biến (Variables): API_HOST',
              base_value: { key: 'API_HOST', value: 'http://localhost', enabled: true },
              ours_value: { key: 'API_HOST', value: 'https://dev-local.example.com', enabled: true },
              theirs_value: { key: 'API_HOST', value: 'https://dev-remote.example.com', enabled: true }
            }
          ],
          merged_preview: {
            id: 'env-dev',
            name: 'Dev Env',
            variables: [{ key: 'API_HOST', value: 'https://dev-local.example.com', enabled: true }]
          }
        }
      ]
    } as any

    resolveGitConflictMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        branch: 'main',
        has_changes: false,
        has_conflicts: false,
        conflicts: []
      }
    })

    uiStore.gitConflictModalOpen = true
    const wrapper = mount(GitConflictResolverModal)

    expect(wrapper.find('[data-test="delete-edit-conflict-panel"]').exists()).toBe(true)

    // Choose to delete the file on file 0
    await wrapper.find('[data-test="resolve-delete-file-btn"]').trigger('click')
    expect(wrapper.find('[data-test="git-conflict-progress-badge"]').text()).toContain('Đã xử lý 1/2 file')

    // Switch to file 1 in sidebar and click "Chọn toàn bộ bản Remote"
    await wrapper.find('[data-test="conflict-file-item-1"]').trigger('click')
    await wrapper.find('[data-test="pick-all-theirs-btn"]').trigger('click')
    expect(wrapper.find('[data-test="git-conflict-progress-badge"]').text()).toContain('Đã xử lý 2/2 file')

    const submitBtn = wrapper.find('[data-test="git-resolve-submit-btn"]')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)
    await submitBtn.trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(resolveGitConflictMock).toHaveBeenCalledWith('Test-Collection', {
      'req-deleted.json': { __deleted__: true },
      'environments/dev.json': {
        id: 'env-dev',
        name: 'Dev Env',
        variables: [{ key: 'API_HOST', value: 'https://dev-remote.example.com', enabled: true }]
      }
    })
  })

  it('supports pick-all-files-ours-btn and aborting merge via git-abort-merge-btn', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.activeCollectionId = 'Test-Collection'
    collectionStore.gitSyncStatus = {
      has_git_repo: true,
      branch: 'main',
      has_changes: true,
      has_conflicts: true,
      conflict_files: ['collection.json'],
      conflicts: [
        {
          file_path: 'collection.json',
          entity_type: 'collection',
          entity_name: 'Test Collection',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: 'description',
              label: 'Mô tả',
              base_value: 'Old',
              ours_value: 'Local desc',
              theirs_value: 'Remote desc'
            }
          ],
          merged_preview: {
            id: 'Test-Collection',
            name: 'Test Collection',
            description: 'Local desc'
          }
        }
      ]
    } as any

    abortGitMergeMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        branch: 'main',
        has_changes: false,
        has_conflicts: false,
        conflicts: []
      }
    })

    uiStore.gitConflictModalOpen = true
    const wrapper = mount(GitConflictResolverModal)

    await wrapper.find('[data-test="pick-all-files-ours-btn"]').trigger('click')
    expect(wrapper.find('[data-test="git-conflict-progress-badge"]').text()).toContain('Đã xử lý 1/1 file')

    await wrapper.find('[data-test="git-abort-merge-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(abortGitMergeMock).toHaveBeenCalledWith('Test-Collection')
    expect(uiStore.gitConflictModalOpen).toBe(false)
    expect(uiStore.toast?.text).toBe('Đã huỷ merge và khôi phục trạng thái trước đó')
  })

  it('resolves duplicate KVPair conflicts when #0 is deleted (null) and #1 is kept without shifting or overwriting, and reloads/clears activeRequestId on resolve and abort', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()
    const { useRequestStore } = await import('@/stores/requestStore')
    const requestStore = useRequestStore()

    const loadReqSpy = vi.spyOn(requestStore, 'loadRequest').mockResolvedValue(undefined as any)
    const clearReqSpy = vi.spyOn(requestStore, 'clearRequest').mockImplementation(() => {})

    collectionStore.activeCollectionId = 'Test-Collection'
    collectionStore.activeRequestId = 'req-dup'
    collectionStore.gitSyncStatus = {
      has_git_repo: true,
      branch: 'main',
      has_changes: true,
      has_conflicts: true,
      conflict_files: ['req-dup.json', 'README.md'],
      conflicts: [
        {
          file_path: 'req-dup.json',
          entity_type: 'request',
          entity_name: 'Dup KVPair Req',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: 'params.tag#0',
              label: 'Query Param: tag',
              base_value: { key: 'tag', value: 'v0', enabled: true },
              ours_value: null,
              theirs_value: { key: 'tag', value: 'v0-remote', enabled: true }
            },
            {
              field_path: 'params.tag#1',
              label: 'Query Param: tag #2',
              base_value: { key: 'tag', value: 'v1', enabled: true },
              ours_value: { key: 'tag', value: 'v1-local', enabled: true },
              theirs_value: { key: 'tag', value: 'v1-remote', enabled: false }
            }
          ],
          merged_preview: {
            id: 'req-dup',
            name: 'Dup KVPair Req',
            params: [{ key: 'tag', value: 'v1-local', enabled: true }]
          }
        },
        {
          file_path: 'README.md',
          entity_type: 'raw',
          entity_name: 'README.md',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: '__raw__',
              label: 'Nội dung file',
              base_value: '# Base',
              ours_value: '# Local README',
              theirs_value: '# Remote README'
            }
          ]
        }
      ]
    } as any

    getTreeMock.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'req-dup', name: 'Dup KVPair Req', type: 'request' }]
    })
    resolveGitConflictMock.mockResolvedValueOnce({
      success: true,
      data: {
        has_git_repo: true,
        branch: 'main',
        has_changes: false,
        has_conflicts: false,
        conflicts: []
      }
    })

    uiStore.gitConflictModalOpen = true
    const wrapper = mount(GitConflictResolverModal)

    // File 0 (req-dup.json): pick ours (null / deleted) for tag#0 and theirs (v1-remote) for tag#1
    await wrapper.find('[data-test="pick-field-ours-0"]').trigger('click')
    await wrapper.find('[data-test="pick-field-theirs-1"]').trigger('click')

    // Switch to File 1 (README.md raw) and pick theirs
    await wrapper.find('[data-test="conflict-file-item-1"]').trigger('click')
    await wrapper.find('[data-test="pick-field-theirs-0"]').trigger('click')

    const submitBtn = wrapper.find('[data-test="git-resolve-submit-btn"]')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)
    await submitBtn.trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(resolveGitConflictMock).toHaveBeenCalledWith('Test-Collection', {
      'req-dup.json': {
        id: 'req-dup',
        name: 'Dup KVPair Req',
        params: [{ key: 'tag', value: 'v1-remote', enabled: false }]
      },
      'README.md': '# Remote README'
    })
    expect(loadReqSpy).toHaveBeenCalledWith('req-dup')

    // Verify abortGitMerge clears activeRequestId when request is no longer in tree
    getTreeMock.mockResolvedValueOnce({ success: true, data: [] })
    abortGitMergeMock.mockResolvedValueOnce({
      success: true,
      data: { has_git_repo: true, branch: 'main', has_changes: false, has_conflicts: false }
    })
    await collectionStore.abortGitMerge('Test-Collection')
    expect(clearReqSpy).toHaveBeenCalled()
    expect(collectionStore.activeRequestId).toBeNull()
  })

  it('renders Flow and Flow Folder entity badges for flow and flow_folder conflicts and reloads flowStore.loadFlowTree() on resolve', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()
    const { useFlowStore } = await import('@/stores/flowStore')
    const flowStore = useFlowStore()
    const loadFlowTreeSpy = vi.spyOn(flowStore, 'loadFlowTree').mockResolvedValue()

    collectionStore.activeCollectionId = 'Test-Collection'
    collectionStore.gitSyncStatus = {
      has_git_repo: true,
      branch: 'main',
      has_changes: true,
      has_conflicts: true,
      conflict_files: ['flows/checkout.json', 'flows/orders/_folder.json'],
      conflicts: [
        {
          file_path: 'flows/checkout.json',
          entity_type: 'flow',
          entity_name: 'Checkout Flow',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: 'name',
              label: 'Tên Flow',
              base_value: 'Checkout',
              ours_value: 'Checkout Local',
              theirs_value: 'Checkout Remote'
            }
          ],
          merged_preview: {
            id: 'flow-checkout',
            name: 'Checkout Local'
          }
        },
        {
          file_path: 'flows/orders/_folder.json',
          entity_type: 'flow_folder',
          entity_name: 'Orders Folder',
          conflict_type: 'field_conflict',
          fields: [
            {
              field_path: 'name',
              label: 'Tên thư mục Flow',
              base_value: 'Orders',
              ours_value: 'Orders Local',
              theirs_value: 'Orders Remote'
            }
          ],
          merged_preview: {
            id: 'ff-orders',
            name: 'Orders Local'
          }
        }
      ]
    } as any

    resolveGitConflictMock.mockResolvedValueOnce({
      success: true,
      data: {
        has_git_repo: true,
        branch: 'main',
        has_changes: false,
        has_conflicts: false,
        conflicts: []
      }
    })

    uiStore.gitConflictModalOpen = true
    const wrapper = mount(GitConflictResolverModal)

    const fileItem0 = wrapper.find('[data-test="conflict-file-item-0"]')
    const fileItem1 = wrapper.find('[data-test="conflict-file-item-1"]')

    expect(fileItem0.text()).toContain('Flow')
    expect(fileItem0.text()).toContain('Checkout Flow')
    expect(fileItem1.text()).toContain('Flow Folder')
    expect(fileItem1.text()).toContain('Orders Folder')

    await wrapper.find('[data-test="pick-all-files-ours-btn"]').trigger('click')
    await wrapper.find('[data-test="git-resolve-submit-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(resolveGitConflictMock).toHaveBeenCalled()
    expect(loadFlowTreeSpy).toHaveBeenCalled()
  })
})


