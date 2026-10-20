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
const customBranches = ref<string[]>([])
const branchSearchQuery = ref('')
const branchSearchInputRef = ref<HTMLInputElement | null>(null)
const isRefreshingBranches = ref(false)

const activeCollectionName = computed(() => {
  return collectionStore.activeCollection?.name || 'Default Collection'
})

const currentBranch = computed(() => {
  return collectionStore.gitSyncStatus?.branch || collectionStore.gitBranches[0] || 'main'
})

const availableBranches = computed(() => {
  const set = new Set<string>()
  if (currentBranch.value) {
    set.add(currentBranch.value)
  }
  for (const b of collectionStore.gitBranches) {
    if (b) set.add(b)
  }
  for (const b of customBranches.value) {
    if (b) set.add(b)
  }
  if (selectedBranch.value) {
    set.add(selectedBranch.value)
  }
  return Array.from(set)
})

const filteredBranches = computed(() => {
  const query = branchSearchQuery.value.trim().toLowerCase()
  if (!query) return availableBranches.value
  return availableBranches.value.filter(b => b.toLowerCase().includes(query))
})

const isQueryNewBranch = computed(() => {
  const query = branchSearchQuery.value.trim()
  if (!query) return false
  return !availableBranches.value.some(b => b.toLowerCase() === query.toLowerCase())
})

const isCustomNewBranch = computed(() => {
  const sel = selectedBranch.value.trim()
  if (!sel) return false
  return !collectionStore.gitBranches.includes(sel) && sel !== collectionStore.gitSyncStatus?.branch
})

watch(
  () => uiStore.gitSyncModalOpen,
  async (open) => {
    if (open) {
      showRemoteChangeConfirm.value = false
      pendingRemoteUrl.value = ''
      branchSearchQuery.value = ''
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
  if (branchDropdownOpen.value) {
    branchSearchQuery.value = ''
    setTimeout(() => {
      branchSearchInputRef.value?.focus()
    }, 50)
  }
}

const selectBranch = (branch: string) => {
  selectedBranch.value = branch
  branchDropdownOpen.value = false
  branchSearchQuery.value = ''
}

const createAndSelectBranch = (branchName: string) => {
  const name = branchName.trim()
  if (!name) return
  if (!customBranches.value.includes(name)) {
    customBranches.value.push(name)
  }
  selectedBranch.value = name
  branchDropdownOpen.value = false
  branchSearchQuery.value = ''
}

const onSearchEnter = () => {
  const query = branchSearchQuery.value.trim()
  if (!query) return
  if (isQueryNewBranch.value) {
    createAndSelectBranch(query)
  } else {
    const match = filteredBranches.value.find(b => b.toLowerCase() === query.toLowerCase()) || filteredBranches.value[0]
    if (match) {
      selectBranch(match)
    }
  }
}

const refreshBranches = async () => {
  isRefreshingBranches.value = true
  try {
    await collectionStore.fetchLocalBranches()
  } finally {
    isRefreshingBranches.value = false
  }
}

const onCheckoutBranch = async (branch: string) => {
  if (collectionStore.gitSyncLoading) return
  const ok = await collectionStore.gitCheckout(branch)
  if (ok) {
    selectedBranch.value = branch
  }
}

const handleClickOutside = (e: MouseEvent) => {
  if (branchDropdownRef.value && !branchDropdownRef.value.contains(e.target as Node)) {
    branchDropdownOpen.value = false
    branchSearchQuery.value = ''
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
  await collectionStore.gitPull(selectedBranch.value || currentBranch.value)
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
  await collectionStore.gitPush(selectedBranch.value || currentBranch.value)
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

      <!-- Status Info & Branch Selector Bar -->
      <div
        v-if="collectionStore.gitSyncStatus"
        class="text-xs text-text-muted flex items-center justify-between bg-surface-base px-3 py-2 rounded border border-border-default gap-3"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-text-secondary font-medium shrink-0">Nhánh:</span>

          <!-- Custom Branch Select Dropdown -->
          <div ref="branchDropdownRef" class="relative flex items-center min-w-0">
            <!-- Hidden native select for test compatibility and accessibility -->
            <select
              v-model="selectedBranch"
              data-test="git-push-branch-select"
              aria-label="Chọn nhánh Git"
              :disabled="collectionStore.gitSyncLoading"
              class="sr-only"
              @change="selectBranch(selectedBranch)"
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
              class="h-7 px-2.5 rounded bg-surface-raised hover:bg-surface-hover border border-border-default hover:border-border-hover focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors cursor-pointer text-xs font-mono text-text-primary flex items-center gap-1.5 select-none disabled:opacity-50"
              @click="toggleBranchDropdown"
            >
              <!-- Git Branch Icon -->
              <svg class="w-3.5 h-3.5 text-text-secondary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"></line>
                <circle cx="18" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <path d="M18 9a9 9 0 0 1-9 9"></path>
              </svg>
              <span class="truncate max-w-[140px]">{{ selectedBranch || currentBranch || 'main' }}</span>
              <span
                v-if="isCustomNewBranch"
                data-test="branch-new-badge"
                class="px-1 py-0.2 text-[10px] rounded bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 font-sans font-medium"
              >
                Mới
              </span>
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
              class="absolute left-0 top-full mt-1 z-50 w-64 max-h-72 flex flex-col rounded-md bg-surface-raised border border-border-default shadow-xl p-1.5 space-y-1"
            >
              <!-- Search & Refresh Header -->
              <div class="flex items-center gap-1.5 pb-1 border-b border-border-default/60">
                <div class="relative flex-1">
                  <input
                    ref="branchSearchInputRef"
                    v-model="branchSearchQuery"
                    type="text"
                    data-test="branch-search-input"
                    placeholder="Tìm hoặc nhập tên nhánh..."
                    class="w-full px-2 py-1 text-xs bg-surface-input border border-border-default rounded font-mono text-text-primary focus:border-brand-primary outline-none"
                    @keydown.enter.prevent="onSearchEnter"
                  />
                </div>
                <button
                  type="button"
                  data-test="refresh-branches-btn"
                  :disabled="isRefreshingBranches || collectionStore.gitSyncLoading"
                  class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer disabled:opacity-40 transition-colors"
                  title="Tải lại danh sách nhánh từ remote"
                  @click="refreshBranches"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    :class="{ 'animate-spin': isRefreshingBranches }"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                </button>
              </div>

              <!-- Option to create new branch if query doesn't match -->
              <div v-if="isQueryNewBranch && branchSearchQuery.trim()" class="pt-0.5">
                <button
                  type="button"
                  data-test="create-new-branch-option"
                  class="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-mono text-emerald-400 hover:bg-emerald-950/40 border border-dashed border-emerald-500/40 text-left cursor-pointer transition-colors"
                  @click="createAndSelectBranch(branchSearchQuery)"
                >
                  <span class="text-sm leading-none font-bold">+</span>
                  <span class="truncate">Tạo nhánh mới: <strong>{{ branchSearchQuery.trim() }}</strong></span>
                </button>
              </div>

              <!-- Branch Options List -->
              <div class="overflow-y-auto max-h-48 space-y-0.5 py-0.5">
                <div
                  v-if="filteredBranches.length === 0 && !isQueryNewBranch"
                  class="text-xs text-text-muted px-2 py-2 text-center"
                >
                  Không tìm thấy nhánh nào
                </div>

                <div
                  v-for="b in filteredBranches"
                  :key="b"
                  class="group flex items-center justify-between px-2 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer"
                  :class="currentBranch === b ? 'bg-brand-primary/15 text-brand-primary font-medium' : 'text-text-primary hover:bg-surface-hover'"
                  @click="selectBranch(b)"
                >
                  <button
                    type="button"
                    role="option"
                    :aria-selected="currentBranch === b"
                    data-test="branch-select-option"
                    class="flex items-center gap-1.5 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                    :class="currentBranch === b ? 'text-brand-primary font-medium' : 'text-text-primary'"
                  >
                    <span class="truncate">{{ b }}</span>
                    <span
                      v-if="b === currentBranch"
                      class="text-[10px] px-1 py-0.2 rounded bg-surface-base text-text-muted font-sans shrink-0 border border-border-default"
                    >
                      hiện tại
                    </span>
                  </button>

                  <div class="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      v-if="b !== currentBranch"
                      type="button"
                      data-test="checkout-branch-item-btn"
                      class="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-surface-base hover:bg-surface-input text-text-secondary hover:text-text-primary border border-border-default transition-all cursor-pointer"
                      title="Chuyển working tree sang nhánh này"
                      @click.stop="onCheckoutBranch(b)"
                    >
                      Checkout
                    </button>
                    <svg
                      v-if="currentBranch === b"
                      class="w-3.5 h-3.5 text-brand-primary shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Checkout Selected Branch Button if different from current -->
          <button
            v-if="selectedBranch && selectedBranch !== currentBranch"
            type="button"
            data-test="checkout-selected-branch-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="text-[11px] px-2 py-0.5 rounded bg-brand-primary/15 hover:bg-brand-primary/25 text-brand-primary font-medium border border-brand-primary/30 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Chuyển working tree sang nhánh đã chọn"
            @click="onCheckoutBranch(selectedBranch)"
          >
            Chuyển sang {{ selectedBranch }}
          </button>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span>Trạng thái:</span>
          <strong v-if="collectionStore.gitSyncStatus.has_conflicts" class="text-red-400">Conflict</strong>
          <strong v-else-if="collectionStore.gitSyncStatus.has_changes" class="text-amber-400">Có thay đổi local</strong>
          <strong v-else class="text-emerald-400">Đã đồng bộ</strong>
        </div>
      </div>

      <!-- Pull & Push Actions -->
      <div class="flex items-center justify-between pt-2 border-t border-border-default gap-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-test="git-pull-modal-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="h-8 px-3 rounded bg-surface-raised border border-border-default text-xs font-semibold text-text-primary hover:bg-surface-hover disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
            @click="onPull"
          >
            <span>↓ Git Pull</span>
          </button>
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
