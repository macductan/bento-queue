<script lang="ts" setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()

const remoteUrlInput = ref('')
const selectedBranch = ref('main')
const showRemoteChangeConfirm = ref(false)
const pendingRemoteUrl = ref('')

const activeCollectionName = computed(() => {
  return collectionStore.activeCollection?.name || 'Default Collection'
})

const availableBranches = computed(() => {
  const list = collectionStore.gitBranches.length > 0
    ? [...collectionStore.gitBranches]
    : [collectionStore.gitSyncStatus?.branch || 'main']
  const current = collectionStore.gitSyncStatus?.branch || 'main'
  if (current && !list.includes(current)) {
    list.unshift(current)
  }
  return list
})

watch(
  () => uiStore.gitSyncModalOpen,
  async (open) => {
    if (open) {
      showRemoteChangeConfirm.value = false
      pendingRemoteUrl.value = ''
      remoteUrlInput.value = collectionStore.activeCollection?.git_remote_url || ''
      const [status, branches] = await Promise.all([
        collectionStore.fetchGitStatus(),
        collectionStore.fetchLocalBranches()
      ])
      if (!remoteUrlInput.value && status?.remote_url) {
        remoteUrlInput.value = status.remote_url
      }
      const defaultBranch = status?.branch || branches[0] || 'main'
      selectedBranch.value = defaultBranch
    }
  },
  { immediate: true }
)

const branchDropdownOpen = ref(false)
const branchDropdownRef = ref<HTMLElement | null>(null)

const toggleBranchDropdown = () => {
  if (collectionStore.gitSyncLoading) return
  branchDropdownOpen.value = !branchDropdownOpen.value
}

const selectBranch = (branch: string) => {
  selectedBranch.value = branch
  branchDropdownOpen.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  if (branchDropdownRef.value && !branchDropdownRef.value.contains(e.target as Node)) {
    branchDropdownOpen.value = false
  }
}

const closeModal = () => {
  showRemoteChangeConfirm.value = false
  pendingRemoteUrl.value = ''
  branchDropdownOpen.value = false
  uiStore.gitSyncModalOpen = false
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.gitSyncModalOpen) {
    if (branchDropdownOpen.value) {
      branchDropdownOpen.value = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (showRemoteChangeConfirm.value) {
      showRemoteChangeConfirm.value = false
      pendingRemoteUrl.value = ''
    } else {
      closeModal()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('click', handleClickOutside)
})

const onSaveRemote = async () => {
  const newUrl = remoteUrlInput.value.trim()
  const currentUrl = (collectionStore.activeCollection?.git_remote_url || '').trim()

  if (newUrl !== '' && currentUrl !== '' && newUrl !== currentUrl) {
    pendingRemoteUrl.value = newUrl
    showRemoteChangeConfirm.value = true
    return
  }

  await collectionStore.saveGitRemote(newUrl)
  await collectionStore.fetchLocalBranches()
}

const onConfirmClearAndPull = async () => {
  const url = pendingRemoteUrl.value || remoteUrlInput.value.trim()
  showRemoteChangeConfirm.value = false
  pendingRemoteUrl.value = ''
  await collectionStore.gitClearAndPull(url)
  if (collectionStore.gitSyncStatus?.branch) {
    selectedBranch.value = collectionStore.gitSyncStatus.branch
  }
}

const onConfirmStashAndPull = async () => {
  const url = pendingRemoteUrl.value || remoteUrlInput.value.trim()
  showRemoteChangeConfirm.value = false
  pendingRemoteUrl.value = ''
  await collectionStore.gitStashAndPull(url)
  if (collectionStore.gitSyncStatus?.branch) {
    selectedBranch.value = collectionStore.gitSyncStatus.branch
  }
}

const onConfirmSaveRemoteOnly = async () => {
  const url = pendingRemoteUrl.value || remoteUrlInput.value.trim()
  showRemoteChangeConfirm.value = false
  pendingRemoteUrl.value = ''
  await collectionStore.saveGitRemote(url)
  await collectionStore.fetchLocalBranches()
}

const onCancelRemoteChange = () => {
  showRemoteChangeConfirm.value = false
  pendingRemoteUrl.value = ''
}

const onPull = async () => {
  const newUrl = remoteUrlInput.value.trim()
  const currentUrl = (collectionStore.activeCollection?.git_remote_url || '').trim()
  if (newUrl !== '' && newUrl !== currentUrl) {
    if (currentUrl !== '') {
      pendingRemoteUrl.value = newUrl
      showRemoteChangeConfirm.value = true
      return
    }
    const saved = await collectionStore.saveGitRemote(newUrl)
    if (!saved) return
  }
  await collectionStore.gitPull()
  await collectionStore.fetchLocalBranches()
  if (collectionStore.gitSyncStatus?.branch) {
    selectedBranch.value = collectionStore.gitSyncStatus.branch
  }
}

const onPush = async () => {
  const newUrl = remoteUrlInput.value.trim()
  const currentUrl = (collectionStore.activeCollection?.git_remote_url || '').trim()
  if (newUrl !== '' && newUrl !== currentUrl) {
    const saved = await collectionStore.saveGitRemote(newUrl)
    if (!saved) return
  }
  await collectionStore.gitPush(selectedBranch.value)
  await collectionStore.fetchLocalBranches()
  if (collectionStore.gitSyncStatus?.branch) {
    selectedBranch.value = collectionStore.gitSyncStatus.branch
  }
}

const openConflictResolver = () => {
  uiStore.gitConflictModalOpen = true
}

const onAbortMerge = async () => {
  await collectionStore.abortGitMerge()
}
</script>

<template>
  <div
    v-if="uiStore.gitSyncModalOpen"
    data-test="git-sync-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Cấu hình Git Sync"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    @click.self="closeModal"
  >
    <div class="w-full max-w-lg rounded-lg bg-surface-overlay border border-border-default shadow-2xl p-5 space-y-4">
      <div class="flex items-center justify-between border-b border-border-default pb-3">
        <div>
          <h2 class="text-base font-semibold text-text-primary m-0">
            Đồng bộ Git — {{ activeCollectionName }}
          </h2>
          <p class="text-xs text-text-muted mt-0.5 mb-0">
            Cấu hình Git Remote URL (HTTPS hoặc SSH) cho Collection này để Pull / Push trực tiếp.
          </p>
        </div>
        <button
          type="button"
          data-test="close-git-modal-btn"
          class="text-text-muted hover:text-text-primary p-1 rounded cursor-pointer"
          aria-label="Đóng"
          @click="closeModal"
        >
          ✕
        </button>
      </div>

      <!-- Git Conflict Alert -->
      <div
        v-if="collectionStore.gitConflictError || collectionStore.gitSyncStatus?.has_conflicts"
        data-test="git-conflict-alert"
        role="alert"
        class="p-3 rounded-md bg-red-950/50 border border-red-500/60 text-red-200 text-xs space-y-2"
      >
        <div class="font-semibold text-red-300 flex items-center gap-1.5">
          <span>⚠️ Phát hiện xung đột Git (Merge Conflict)</span>
        </div>
        <p class="m-0">
          {{ collectionStore.gitConflictError?.message || 'Có xung đột Git chưa được giải quyết trong thư mục Collection. Vui lòng mở thư mục Collection và xử lý conflict thủ công bằng Git.' }}
        </p>
        <ul
          v-if="(collectionStore.gitConflictError?.files?.length || collectionStore.gitSyncStatus?.conflict_files?.length)"
          data-test="git-conflict-files"
          class="list-disc list-inside font-mono text-[11px] text-red-300 m-0 pt-1"
        >
          <li
            v-for="file in (collectionStore.gitConflictError?.files || collectionStore.gitSyncStatus?.conflict_files || [])"
            :key="file"
          >
            {{ file }}
          </li>
        </ul>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            data-test="open-conflict-resolver-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-2.5 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            @click="openConflictResolver"
          >
            Mở bộ giải quyết xung đột (Visual Resolver)
          </button>
          <button
            type="button"
            data-test="git-sync-abort-merge-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-2.5 py-1 rounded bg-surface-raised border border-red-500/50 hover:bg-surface-hover text-red-200 text-xs font-semibold disabled:opacity-50 cursor-pointer"
            @click="onAbortMerge"
          >
            Huỷ merge
          </button>
        </div>
      </div>

      <!-- Remote URL Input -->
      <div class="space-y-1.5">
        <label for="git-remote-url-input" class="block text-xs font-medium text-text-secondary">
          Git Remote URL (HTTPS / SSH)
        </label>
        <div class="flex items-center gap-2">
          <input
            id="git-remote-url-input"
            v-model="remoteUrlInput"
            type="text"
            data-test="git-remote-input"
            placeholder="https://github.com/org/repo.git hoặc git@github.com:org/repo.git"
            class="flex-1 min-w-0 px-3 py-1.5 rounded bg-surface-input border border-border-default font-mono text-xs text-text-primary focus:border-brand-primary outline-none"
            @keydown.enter.prevent="onSaveRemote"
          />
          <button
            type="button"
            data-test="save-git-remote-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-3 py-1.5 rounded bg-brand-primary text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0 cursor-pointer"
            @click="onSaveRemote"
          >
            Lưu Remote
          </button>
        </div>
      </div>

      <!-- Confirm Dialog when Remote URL changes -->
      <div
        v-if="showRemoteChangeConfirm"
        data-test="git-remote-confirm-dialog"
        role="alertdialog"
        aria-label="Xác nhận thay đổi Git Remote URL"
        class="p-3 rounded-md bg-amber-950/40 border border-amber-500/50 text-xs space-y-2.5"
      >
        <p class="m-0 text-amber-200 font-medium">
          Bạn đang kết nối với Git Remote URL mới. Vui lòng chọn cách xử lý dữ liệu local hiện tại:
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-test="git-clear-and-pull-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            @click="onConfirmClearAndPull"
          >
            Clear local data
          </button>
          <button
            type="button"
            data-test="git-stash-and-pull-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-3 py-1.5 rounded bg-brand-primary hover:opacity-90 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
            @click="onConfirmStashAndPull"
          >
            Stash &amp; merge
          </button>
          <button
            type="button"
            data-test="git-save-only-remote-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-3 py-1.5 rounded bg-surface-raised border border-border-default hover:bg-surface-hover text-text-primary text-xs font-semibold disabled:opacity-50 cursor-pointer"
            @click="onConfirmSaveRemoteOnly"
          >
            Chỉ lưu Remote
          </button>
          <button
            type="button"
            data-test="git-cancel-remote-change-btn"
            class="px-2.5 py-1.5 rounded text-xs text-text-muted hover:text-text-primary cursor-pointer"
            @click="onCancelRemoteChange"
          >
            Hủy
          </button>
        </div>
      </div>

      <!-- Status Info -->
      <div v-if="collectionStore.gitSyncStatus" class="text-xs text-text-muted flex items-center justify-between bg-surface-base px-3 py-2 rounded border border-border-default">
        <span>
          Nhánh: <strong class="font-mono text-text-primary">{{ collectionStore.gitSyncStatus.branch || 'main' }}</strong>
        </span>
        <span>
          Trạng thái:
          <strong v-if="collectionStore.gitSyncStatus.has_conflicts" class="text-red-400">Conflict</strong>
          <strong v-else-if="collectionStore.gitSyncStatus.has_changes" class="text-amber-400">Có thay đổi local</strong>
          <strong v-else class="text-emerald-400">Đã đồng bộ</strong>
        </span>
      </div>

      <!-- Pull & Push Actions -->
      <div class="flex items-center justify-between pt-2 border-t border-border-default gap-2">
        <div class="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            data-test="git-pull-modal-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="h-8 px-3 rounded bg-surface-raised border border-border-default text-xs font-semibold text-text-primary hover:bg-surface-hover disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
            @click="onPull"
          >
            <span>↓ Git Pull</span>
          </button>

          <!-- Custom Branch Select Dropdown -->
          <div ref="branchDropdownRef" class="relative flex items-center">
            <!-- Hidden native select for test compatibility and accessibility -->
            <select
              v-model="selectedBranch"
              data-test="git-push-branch-select"
              aria-label="Chọn nhánh để Push"
              :disabled="collectionStore.gitSyncLoading"
              class="sr-only"
            >
              <option v-for="b in availableBranches" :key="b" :value="b">
                {{ b }}
              </option>
            </select>

            <!-- Custom Dropdown Trigger Button -->
            <button
              type="button"
              data-test="custom-branch-select-btn"
              :disabled="collectionStore.gitSyncLoading"
              aria-haspopup="listbox"
              :aria-expanded="branchDropdownOpen"
              class="h-8 px-2.5 rounded bg-surface-raised hover:bg-surface-hover border border-border-default hover:border-border-hover focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors cursor-pointer text-xs font-mono text-text-primary flex items-center gap-2 select-none disabled:opacity-50"
              @click="toggleBranchDropdown"
            >
              <!-- Git Branch Icon -->
              <svg class="w-3.5 h-3.5 text-text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"></line>
                <circle cx="18" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <path d="M18 9a9 9 0 0 1-9 9"></path>
              </svg>
              <span class="truncate max-w-[130px]">{{ selectedBranch || 'main' }}</span>
              <!-- Down Chevron Icon -->
              <svg
                class="w-3 h-3 text-text-muted transition-transform shrink-0"
                :class="{ 'rotate-180': branchDropdownOpen }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- Custom Dropdown Menu -->
            <div
              v-if="branchDropdownOpen"
              data-test="branch-select-dropdown"
              role="listbox"
              class="absolute left-0 bottom-full mb-1 z-50 min-w-[180px] max-h-48 overflow-y-auto rounded-md bg-surface-raised border border-border-default shadow-lg p-1 space-y-0.5"
            >
              <button
                v-for="b in availableBranches"
                :key="b"
                type="button"
                role="option"
                :aria-selected="selectedBranch === b"
                data-test="branch-select-option"
                class="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono text-left transition-colors cursor-pointer"
                :class="selectedBranch === b ? 'bg-brand-primary/15 text-brand-primary font-medium' : 'text-text-primary hover:bg-surface-hover'"
                @click="selectBranch(b)"
              >
                <span class="truncate">{{ b }}</span>
                <svg
                  v-if="selectedBranch === b"
                  class="w-3.5 h-3.5 text-brand-primary shrink-0 ml-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <button
            type="button"
            data-test="git-push-modal-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="h-8 px-3 rounded bg-surface-raised border border-border-default text-xs font-semibold text-text-primary hover:bg-surface-hover disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
            @click="onPush"
          >
            <span>↑ Git Push</span>
          </button>
        </div>
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-medium text-text-secondary hover:text-text-primary cursor-pointer"
          @click="closeModal"
        >
          Đóng
        </button>
      </div>
    </div>
  </div>
</template>
