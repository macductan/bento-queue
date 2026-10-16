import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GitSyncModal from '../GitSyncModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'

const saveRemoteMock = vi.fn()
const getStatusMock = vi.fn()
const gitPullMock = vi.fn()
const gitPushMock = vi.fn()
const gitPushToBranchMock = vi.fn()
const gitClearAndPullMock = vi.fn()
const gitStashAndPullMock = vi.fn()
const gitListLocalBranchesMock = vi.fn()
const listCollectionsMock = vi.fn()
const getTreeMock = vi.fn()

vi.mock('../../../wailsjs/go/main/App', () => ({
  SaveCollectionGitRemote: (...args: any[]) => saveRemoteMock(...args),
  GetCollectionGitStatus: (...args: any[]) => getStatusMock(...args),
  GitPullCollection: (...args: any[]) => gitPullMock(...args),
  GitPushCollection: (...args: any[]) => gitPushMock(...args),
  GitPushCollectionToBranch: (...args: any[]) => gitPushToBranchMock(...args),
  GitClearAndPullCollection: (...args: any[]) => gitClearAndPullMock(...args),
  GitStashAndPullCollection: (...args: any[]) => gitStashAndPullMock(...args),
  GitListLocalBranches: (...args: any[]) => gitListLocalBranchesMock(...args),
  ListCollections: (...args: any[]) => listCollectionsMock(...args),
  GetCollectionTree: (...args: any[]) => getTreeMock(...args),
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
})
