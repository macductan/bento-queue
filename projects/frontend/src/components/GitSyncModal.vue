<script lang="ts" setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()

const remoteUrlInput = ref('')

const activeCollectionName = computed(() => {
  return collectionStore.activeCollection?.name || 'Default Collection'
})

watch(
  () => uiStore.gitSyncModalOpen,
  async (open) => {
    if (open) {
      remoteUrlInput.value = collectionStore.activeCollection?.git_remote_url || ''
      const status = await collectionStore.fetchGitStatus()
      if (!remoteUrlInput.value && status?.remote_url) {
        remoteUrlInput.value = status.remote_url
      }
    }
  },
  { immediate: true }
)

const closeModal = () => {
  uiStore.gitSyncModalOpen = false
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.gitSyncModalOpen) {
    e.preventDefault()
    e.stopPropagation()
    closeModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const onSaveRemote = async () => {
  await collectionStore.saveGitRemote(remoteUrlInput.value)
}

const onPull = async () => {
  if (remoteUrlInput.value.trim() !== (collectionStore.activeCollection?.git_remote_url || '')) {
    const saved = await collectionStore.saveGitRemote(remoteUrlInput.value)
    if (!saved) return
  }
  await collectionStore.gitPull()
}

const onPush = async () => {
  if (remoteUrlInput.value.trim() !== (collectionStore.activeCollection?.git_remote_url || '')) {
    const saved = await collectionStore.saveGitRemote(remoteUrlInput.value)
    if (!saved) return
  }
  await collectionStore.gitPush()
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
        class="p-3 rounded-md bg-red-950/50 border border-red-500/60 text-red-200 text-xs space-y-1.5"
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
      <div class="flex items-center justify-between pt-2 border-t border-border-default">
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-test="git-pull-modal-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-3 py-1.5 rounded bg-surface-raised border border-border-default text-xs font-semibold text-text-primary hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
            @click="onPull"
          >
            ↓ Git Pull
          </button>
          <button
            type="button"
            data-test="git-push-modal-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-3 py-1.5 rounded bg-surface-raised border border-border-default text-xs font-semibold text-text-primary hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
            @click="onPush"
          >
            ↑ Git Push
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
