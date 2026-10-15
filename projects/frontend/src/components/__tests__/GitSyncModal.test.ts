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
const listCollectionsMock = vi.fn()
const getTreeMock = vi.fn()

vi.mock('../../../wailsjs/go/main/App', () => ({
  SaveCollectionGitRemote: (...args: any[]) => saveRemoteMock(...args),
  GetCollectionGitStatus: (...args: any[]) => getStatusMock(...args),
  GitPullCollection: (...args: any[]) => gitPullMock(...args),
  GitPushCollection: (...args: any[]) => gitPushMock(...args),
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

  it('saves Git remote URL for Test-Collection via GitSyncModal', async () => {
    const collectionStore = useCollectionStore()
    const uiStore = useUiStore()

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

    const input = wrapper.find('[data-test="git-remote-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('git@github.com:org/test-collection.git')

    const saveBtn = wrapper.find('[data-test="save-git-remote-btn"]')
    await saveBtn.trigger('click')
    await new Promise(r => setTimeout(r, 10))

    expect(saveRemoteMock).toHaveBeenCalledWith('Test-Collection', 'git@github.com:org/test-collection.git')
    expect(uiStore.toast?.text).toBe('Đã lưu cấu hình Git Remote')
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
})
