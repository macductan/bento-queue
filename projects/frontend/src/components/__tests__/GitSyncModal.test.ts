import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GitSyncModal from '../GitSyncModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'
import { useTabStore } from '@/stores/tabStore'

const saveRemoteMock = vi.fn()
const getStatusMock = vi.fn()
const gitPullMock = vi.fn()
const gitPullFromBranchMock = vi.fn()
const gitPushMock = vi.fn()
const gitPushToBranchMock = vi.fn()
const gitClearAndPullMock = vi.fn()
const gitStashAndPullMock = vi.fn()
const gitListLocalBranchesMock = vi.fn()
const gitCheckoutBranchMock = vi.fn()
const resolveGitConflictMock = vi.fn()
const abortGitMergeMock = vi.fn()
const listCollectionsMock = vi.fn()
const getTreeMock = vi.fn()

vi.mock('../../../wailsjs/go/main/App', () => ({
  SaveCollectionGitRemote: (...args: any[]) => saveRemoteMock(...args),
  GetCollectionGitStatus: (...args: any[]) => getStatusMock(...args),
  GitPullCollection: (...args: any[]) => gitPullMock(...args),
  GitPullCollectionFromBranch: (...args: any[]) => gitPullFromBranchMock(...args),
  GitPushCollection: (...args: any[]) => gitPushMock(...args),
  GitPushCollectionToBranch: (...args: any[]) => gitPushToBranchMock(...args),
  GitClearAndPullCollection: (...args: any[]) => gitClearAndPullMock(...args),
  GitStashAndPullCollection: (...args: any[]) => gitStashAndPullMock(...args),
  GitListLocalBranches: (...args: any[]) => gitListLocalBranchesMock(...args),
  GitCheckoutBranch: (...args: any[]) => gitCheckoutBranchMock(...args),
  ResolveGitConflict: (...args: any[]) => resolveGitConflictMock(...args),
  AbortGitMerge: (...args: any[]) => abortGitMergeMock(...args),
  ListCollections: (...args: any[]) => listCollectionsMock(...args),
  GetCollectionTree: (...args: any[]) => getTreeMock(...args),
  GetEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  GetActiveEnvironment: vi.fn().mockResolvedValue({ success: true, data: '' }),
  GetRequest: vi.fn().mockResolvedValue({ success: true, data: null }),
  SaveRequest: vi.fn().mockResolvedValue({ success: true }),
  SaveFolderMeta: vi.fn().mockResolvedValue({ success: true }),
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

describe('GitSyncModal.vue & collectionStore Git Sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    getStatusMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })
    gitListLocalBranchesMock.mockResolvedValue({
      success: true,
      data: ['main', 'develop', 'feature/auth']
    })
    gitCheckoutBranchMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })
    listCollectionsMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'Test-Collection',
          name: 'Test-Collection',
          git_remote_url: 'https://github.com/org/test-collection.git',
          is_active: true
        }
      ]
    })
    getTreeMock.mockResolvedValue({
      success: true,
      data: []
    })
  })

  it('saves unchanged Git remote URL directly without confirmation dialog', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        description: '',
        git_remote_url: 'git@github.com:org/test-collection.git',
        is_active: true,
        created_at: '',
        updated_at: ''
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    saveRemoteMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'git@github.com:org/test-collection.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    const input = wrapper.find('[data-test="git-remote-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('git@github.com:org/test-collection.git')

    const saveBtn = wrapper.find('[data-test="save-git-remote-btn"]')
    await saveBtn.trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(wrapper.find('[data-test="git-remote-confirm-dialog"]').exists()).toBe(false)
    expect(saveRemoteMock).toHaveBeenCalledWith('Test-Collection', 'git@github.com:org/test-collection.git')
    expect(uiStore.toast?.text).toBe('Đã lưu cấu hình Git Remote')
  })

  it('shows Clear/Stash confirmation dialog when remote URL changes and executes chosen action', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        description: '',
        git_remote_url: 'https://github.com/org/old-repo.git',
        is_active: true,
        created_at: '',
        updated_at: ''
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    saveRemoteMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/new-repo.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })
    gitClearAndPullMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/new-repo.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })
    gitStashAndPullMock.mockResolvedValue({
      success: false,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/new-repo.git',
        branch: 'main',
        has_changes: true,
        has_conflicts: true,
        conflict_files: ['req-1.json']
      },
      error: {
        code: 'GIT_CONFLICT',
        message: 'Xung đột khi Stash & Pull tại req-1.json'
      }
    })

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    const input = wrapper.find('[data-test="git-remote-input"]')
    await input.setValue('https://github.com/org/new-repo.git')
    await wrapper.find('[data-test="save-git-remote-btn"]').trigger('click')

    // Confirm dialog appears
    const confirmDialog = wrapper.find('[data-test="git-remote-confirm-dialog"]')
    expect(confirmDialog.exists()).toBe(true)

    // Click Clear local data
    await wrapper.find('[data-test="git-clear-and-pull-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 15))
    expect(saveRemoteMock).toHaveBeenCalledWith('Test-Collection', 'https://github.com/org/new-repo.git')
    expect(gitClearAndPullMock).toHaveBeenCalledWith('Test-Collection')

    // Change again and test Stash & merge with conflict
    await input.setValue('https://github.com/org/another-repo.git')
    await wrapper.find('[data-test="save-git-remote-btn"]').trigger('click')
    expect(wrapper.find('[data-test="git-remote-confirm-dialog"]').exists()).toBe(true)

    await wrapper.find('[data-test="git-stash-and-pull-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 15))
    expect(gitStashAndPullMock).toHaveBeenCalledWith('Test-Collection')
    expect(collectionStore.gitConflictError?.files).toEqual(['req-1.json'])
    expect(wrapper.find('[data-test="git-conflict-alert"]').exists()).toBe(true)
  })

  it('loads local branches into select dropdown and pushes to selected branch', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        description: '',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true,
        created_at: '',
        updated_at: ''
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    gitPushToBranchMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'develop',
        has_changes: false,
        has_conflicts: false
      }
    })

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    const branchSelect = wrapper.find('[data-test="git-push-branch-select"]')
    expect(branchSelect.exists()).toBe(true)
    const options = branchSelect.findAll('option').map(o => o.text())
    expect(options).toEqual(['main', 'develop', 'feature/auth'])

    await branchSelect.setValue('develop')
    await wrapper.find('[data-test="git-push-modal-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(gitPushToBranchMock).toHaveBeenCalledWith('Test-Collection', 'develop')
  })

  it('displays conflict alert and conflicted files when gitPull returns GIT_CONFLICT', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        description: '',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true,
        created_at: '',
        updated_at: ''
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    gitPullMock.mockResolvedValue({
      success: false,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: true,
        has_conflicts: true,
        conflict_files: ['auth/login.json', 'users/list.json']
      },
      error: {
        code: 'GIT_CONFLICT',
        message: 'Xung đột Git (Merge Conflict) khi Pull tại: auth/login.json, users/list.json.'
      }
    })

    const ok = await collectionStore.gitPull('Test-Collection')
    expect(ok).toBe(false)
    expect(uiStore.gitSyncModalOpen).toBe(true)
    expect(collectionStore.gitConflictError?.files).toEqual(['auth/login.json', 'users/list.json'])

    const wrapper = mount(GitSyncModal)
    const alert = wrapper.find('[data-test="git-conflict-alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('auth/login.json')
    expect(alert.text()).toContain('users/list.json')
  })

  it('closes modal on Escape key', async () => {
    const uiStore = useUiStore()
    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(uiStore.gitSyncModalOpen).toBe(false)
    wrapper.unmount()
  })

  it('saves first-time remote URL directly without confirm dialog and supports git-save-only-remote-btn when changing URL', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    getStatusMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: false,
        remote_url: '',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })
    saveRemoteMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/first-remote.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        description: '',
        git_remote_url: '',
        is_active: true,
        created_at: '',
        updated_at: ''
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'
    uiStore.gitSyncModalOpen = true

    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    const input = wrapper.find('[data-test="git-remote-input"]')
    await input.setValue('https://github.com/org/first-remote.git')
    await wrapper.find('[data-test="save-git-remote-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(wrapper.find('[data-test="git-remote-confirm-dialog"]').exists()).toBe(false)
    expect(saveRemoteMock).toHaveBeenCalledWith('Test-Collection', 'https://github.com/org/first-remote.git')

    // Now collection has an existing remote URL; changing it opens confirm dialog where git-save-only-remote-btn saves without pulling
    collectionStore.collections[0].git_remote_url = 'https://github.com/org/first-remote.git'
    await input.setValue('https://github.com/org/second-remote.git')
    await wrapper.find('[data-test="save-git-remote-btn"]').trigger('click')
    expect(wrapper.find('[data-test="git-remote-confirm-dialog"]').exists()).toBe(true)

    const saveOnlyBtn = wrapper.find('[data-test="git-save-only-remote-btn"]')
    expect(saveOnlyBtn.exists()).toBe(true)
    await saveOnlyBtn.trigger('click')
    await new Promise(r => setTimeout(r, 15))

    expect(saveRemoteMock).toHaveBeenCalledWith('Test-Collection', 'https://github.com/org/second-remote.git')
  })

  it('auto-flushes requestStore and tabStore before gitPull, gitStashAndPull, and gitPush', async () => {
    const collectionStore = useCollectionStore()
    const requestStore = useRequestStore()
    const tabStore = useTabStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    const flushReqSpy = vi.spyOn(requestStore, 'flush').mockResolvedValue(true)
    const flushFolderSpy = vi.spyOn(tabStore, 'flushActiveFolderIfNeeded').mockResolvedValue(true)

    gitPullMock.mockResolvedValue({
      success: true,
      data: { has_git_repo: true, branch: 'main', has_changes: false, has_conflicts: false }
    })
    gitStashAndPullMock.mockResolvedValue({
      success: true,
      data: { has_git_repo: true, branch: 'main', has_changes: false, has_conflicts: false }
    })
    gitPushToBranchMock.mockResolvedValue({
      success: true,
      data: { has_git_repo: true, branch: 'main', has_changes: false, has_conflicts: false }
    })

    await collectionStore.gitPull('Test-Collection')
    expect(flushReqSpy).toHaveBeenCalledTimes(1)
    expect(flushFolderSpy).toHaveBeenCalledTimes(1)

    await collectionStore.gitStashAndPull('https://github.com/org/test-collection.git', 'Test-Collection')
    expect(flushReqSpy).toHaveBeenCalledTimes(2)
    expect(flushFolderSpy).toHaveBeenCalledTimes(2)

    await collectionStore.gitPush('main', 'Test-Collection')
    expect(flushReqSpy).toHaveBeenCalledTimes(3)
    expect(flushFolderSpy).toHaveBeenCalledTimes(3)

    // Verify gitPull / gitStashAndPull / gitPush abort when requestStore.flush() returns false
    flushReqSpy.mockResolvedValueOnce(false)
    expect(await collectionStore.gitPull('Test-Collection')).toBe(false)
    expect(gitPullMock).toHaveBeenCalledTimes(1)

    flushReqSpy.mockResolvedValueOnce(true)
    flushFolderSpy.mockResolvedValueOnce(false)
    expect(await collectionStore.gitStashAndPull('https://github.com/org/test-collection.git', 'Test-Collection')).toBe(false)
    expect(gitStashAndPullMock).toHaveBeenCalledTimes(1)

    flushReqSpy.mockResolvedValueOnce(false)
    expect(await collectionStore.gitPush('main', 'Test-Collection')).toBe(false)
    expect(gitPushToBranchMock).toHaveBeenCalledTimes(1)
  })

  it('auto-opens gitConflictModalOpen when gitPull, gitStashAndPull, or gitPush returns GIT_CONFLICT with conflicts and reloads/clears activeRequestId on gitPush', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()
    const requestStore = useRequestStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    const conflictPayload = {
      success: false,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: true,
        has_conflicts: true,
        conflict_files: ['req-1.json'],
        conflicts: [
          {
            file_path: 'req-1.json',
            entity_type: 'request',
            entity_name: 'Req 1',
            conflict_type: 'field_conflict',
            fields: [{ field_path: 'url', label: 'URL', ours_value: 'a', theirs_value: 'b' }]
          }
        ]
      },
      error: { code: 'GIT_CONFLICT', message: 'Conflict' }
    }

    uiStore.gitConflictModalOpen = false
    gitPullMock.mockResolvedValueOnce(conflictPayload)
    expect(await collectionStore.gitPull('Test-Collection')).toBe(false)
    expect(uiStore.gitConflictModalOpen).toBe(true)

    uiStore.gitConflictModalOpen = false
    gitStashAndPullMock.mockResolvedValueOnce(conflictPayload)
    expect(await collectionStore.gitStashAndPull('https://github.com/org/test-collection.git', 'Test-Collection')).toBe(false)
    expect(uiStore.gitConflictModalOpen).toBe(true)

    uiStore.gitConflictModalOpen = false
    gitPushToBranchMock.mockResolvedValueOnce(conflictPayload)
    expect(await collectionStore.gitPush('main', 'Test-Collection')).toBe(false)
    expect(uiStore.gitConflictModalOpen).toBe(true)

    // Verify activeRequestId reload when present in tree, and clear when removed after gitPush
    const loadReqSpy = vi.spyOn(requestStore, 'loadRequest').mockResolvedValue(undefined as any)
    const clearReqSpy = vi.spyOn(requestStore, 'clearRequest').mockImplementation(() => {})

    collectionStore.activeRequestId = 'req-active'
    getTreeMock.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'req-active', name: 'Active Req', type: 'request' }]
    })
    gitPushToBranchMock.mockResolvedValueOnce({
      success: true,
      data: { has_git_repo: true, branch: 'main', has_changes: false, has_conflicts: false }
    })
    expect(await collectionStore.gitPush('main', 'Test-Collection')).toBe(true)
    expect(loadReqSpy).toHaveBeenCalledWith('req-active')

    getTreeMock.mockResolvedValueOnce({
      success: true,
      data: []
    })
    gitPushToBranchMock.mockResolvedValueOnce({
      success: true,
      data: { has_git_repo: true, branch: 'main', has_changes: false, has_conflicts: false }
    })
    expect(await collectionStore.gitPush('main', 'Test-Collection')).toBe(true)
    expect(clearReqSpy).toHaveBeenCalled()
    expect(collectionStore.activeRequestId).toBeNull()
  })

  it('opens Visual Conflict Resolver and supports aborting merge from GitSyncModal conflict alert', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    getStatusMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: true,
        has_conflicts: true,
        conflict_files: ['req-1.json']
      }
    })

    collectionStore.activeCollectionId = 'Test-Collection'
    collectionStore.gitConflictError = {
      message: 'Xung đột tại req-1.json',
      files: ['req-1.json']
    }
    uiStore.gitSyncModalOpen = true

    abortGitMergeMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'main',
        has_changes: false,
        has_conflicts: false
      }
    })

    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    const openResolverBtn = wrapper.find('[data-test="open-conflict-resolver-btn"]')
    expect(openResolverBtn.exists()).toBe(true)
    await openResolverBtn.trigger('click')
    expect(uiStore.gitConflictModalOpen).toBe(true)

    const abortBtn = wrapper.find('[data-test="git-sync-abort-merge-btn"]')
    expect(abortBtn.exists()).toBe(true)
    await abortBtn.trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(abortGitMergeMock).toHaveBeenCalledWith('Test-Collection')
    expect(collectionStore.gitConflictError).toBeNull()
  })

  it('toggles custom branch dropdown, selects branch, and closes dropdown on option click', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    const customSelectBtn = wrapper.find('[data-test="custom-branch-select-btn"]')
    expect(customSelectBtn.exists()).toBe(true)
    expect(customSelectBtn.text()).toContain('main')
    expect(wrapper.find('[data-test="branch-select-dropdown"]').exists()).toBe(false)

    // Open dropdown
    await customSelectBtn.trigger('click')
    expect(wrapper.find('[data-test="branch-select-dropdown"]').exists()).toBe(true)

    const options = wrapper.findAll('[data-test="branch-select-option"]')
    expect(options.length).toBe(3)
    expect(options[0].text()).toContain('main')
    expect(options[1].text()).toContain('develop')
    expect(options[2].text()).toContain('feature/auth')

    // Click 'develop' option
    await options[1].trigger('click')
    expect(wrapper.find('[data-test="branch-select-dropdown"]').exists()).toBe(false)
    expect(customSelectBtn.text()).toContain('develop')

    // Verify hidden select was also updated
    const hiddenSelect = wrapper.find('[data-test="git-push-branch-select"]').element as HTMLSelectElement
    expect(hiddenSelect.value).toBe('develop')
  })

  it('filters branches by search query in branch dropdown', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    // Open dropdown
    await wrapper.find('[data-test="custom-branch-select-btn"]').trigger('click')
    expect(wrapper.find('[data-test="branch-select-dropdown"]').exists()).toBe(true)

    // Type 'auth' in search input
    const searchInput = wrapper.find('[data-test="branch-search-input"]')
    expect(searchInput.exists()).toBe(true)
    await searchInput.setValue('auth')

    const options = wrapper.findAll('[data-test="branch-select-option"]')
    expect(options.length).toBe(1)
    expect(options[0].text()).toContain('feature/auth')
  })

  it('allows creating a new branch and pushing to it with new branch badge', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    gitPushToBranchMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'feature/v2-release',
        has_changes: false,
        has_conflicts: false
      }
    })

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    // Open dropdown
    await wrapper.find('[data-test="custom-branch-select-btn"]').trigger('click')

    // Search query for a non-existing branch
    const searchInput = wrapper.find('[data-test="branch-search-input"]')
    await searchInput.setValue('feature/v2-release')

    const createOption = wrapper.find('[data-test="create-new-branch-option"]')
    expect(createOption.exists()).toBe(true)
    expect(createOption.text()).toContain('Tạo nhánh mới: feature/v2-release')

    // Click create new branch
    await createOption.trigger('click')

    // Dropdown should close and trigger button should display the new branch with 'Mới' badge
    expect(wrapper.find('[data-test="branch-select-dropdown"]').exists()).toBe(false)
    const triggerBtn = wrapper.find('[data-test="custom-branch-select-btn"]')
    expect(triggerBtn.text()).toContain('feature/v2-release')
    expect(wrapper.find('[data-test="branch-new-badge"]').exists()).toBe(true)

    // Push to the new branch
    await wrapper.find('[data-test="git-push-modal-btn"]').trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(gitPushToBranchMock).toHaveBeenCalledWith('Test-Collection', 'feature/v2-release')
  })

  it('refreshes branches from remote when clicking refresh button', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    await wrapper.find('[data-test="custom-branch-select-btn"]').trigger('click')
    const refreshBtn = wrapper.find('[data-test="refresh-branches-btn"]')
    expect(refreshBtn.exists()).toBe(true)

    gitListLocalBranchesMock.mockClear()
    await refreshBtn.trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(gitListLocalBranchesMock).toHaveBeenCalledWith('Test-Collection')
  })

  it('checks out branch directly from dropdown or status bar button', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        git_remote_url: 'https://github.com/org/test-collection.git',
        is_active: true
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    gitCheckoutBranchMock.mockResolvedValue({
      success: true,
      data: {
        has_git_repo: true,
        remote_url: 'https://github.com/org/test-collection.git',
        branch: 'develop',
        has_changes: false,
        has_conflicts: false
      }
    })

    uiStore.gitSyncModalOpen = true
    const wrapper = mount(GitSyncModal)
    await new Promise(r => setTimeout(r, 10))

    // Open dropdown and checkout 'develop' directly
    await wrapper.find('[data-test="custom-branch-select-btn"]').trigger('click')
    const checkoutBtns = wrapper.findAll('[data-test="checkout-branch-item-btn"]')
    expect(checkoutBtns.length).toBeGreaterThan(0)

    await checkoutBtns[0].trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(gitCheckoutBranchMock).toHaveBeenCalledWith('Test-Collection', 'develop')

    // Also test checkout button in status bar when selectedBranch !== currentBranch
    await wrapper.find('[data-test="git-push-branch-select"]').setValue('feature/auth')
    await new Promise(r => setTimeout(r, 10))

    const statusBarCheckoutBtn = wrapper.find('[data-test="checkout-selected-branch-btn"]')
    expect(statusBarCheckoutBtn.exists()).toBe(true)
    expect(statusBarCheckoutBtn.text()).toContain('Chuyển sang feature/auth')

    await statusBarCheckoutBtn.trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(gitCheckoutBranchMock).toHaveBeenCalledWith('Test-Collection', 'feature/auth')
  })
})

