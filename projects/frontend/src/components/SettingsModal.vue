<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue'
import { SelectDirectoryDialog, UpdateCollectionRoot, GetCollectionRoot } from '../../wailsjs/go/main/App'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useRequestStore } from '@/stores/requestStore'
import { model } from '../../wailsjs/go/models'
import CollectionModal from './CollectionModal.vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const uiStore = useUiStore()
const collectionStore = useCollectionStore()
const envStore = useEnvironmentStore()
const reqStore = useRequestStore()

const isSaving = ref(false)
const currentPath = ref('')

// Collection modal state
const isCollectionModalOpen = ref(false)
const collectionModalMode = ref<'create' | 'rename'>('create')
const collectionModalInitialName = ref('')
const targetId = ref('')

const fetchRoot = async () => {
  try {
    currentPath.value = await GetCollectionRoot()
  } catch (err) {
    console.error('Failed to get collection root:', err)
    currentPath.value = 'Không thể tải đường dẫn'
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      fetchRoot()
      collectionStore.loadCollections()
    }
  }
)

onMounted(() => {
  fetchRoot()
  collectionStore.loadCollections()
})

const close = () => {
  emit('update:modelValue', false)
}

const changeLocation = async () => {
  if (isSaving.value) return
  if (reqStore.isDirty) {
    uiStore.showToast('Vui lòng lưu hoặc hủy thay đổi request hiện tại trước khi đổi thư mục')
    return
  }
  
  isSaving.value = true
  try {
    const dir = await SelectDirectoryDialog()
    if (!dir) return // Cancelled

    const result = await UpdateCollectionRoot(dir)
    if (result.success) {
      uiStore.showToast('Đã đổi thư mục lưu trữ thành công')
      // Refresh stores
      await collectionStore.refresh()
      await collectionStore.loadCollections()
      await envStore.refresh()
      await fetchRoot()
      close()
    } else {
      uiStore.showToast(result.error?.message || 'Không thể đổi thư mục')
    }
  } catch (err) {
    uiStore.showToast(String(err))
  } finally {
    isSaving.value = false
  }
}

const openCreateCollection = () => {
  collectionModalMode.value = 'create'
  collectionModalInitialName.value = ''
  targetId.value = ''
  isCollectionModalOpen.value = true
}

const openRenameCollection = (c: model.Collection) => {
  collectionModalMode.value = 'rename'
  collectionModalInitialName.value = c.name
  targetId.value = c.id || ''
  isCollectionModalOpen.value = true
}

const handleDuplicateCollection = async (id: string) => {
  await collectionStore.duplicateCollection(id)
}

const handleDeleteCollection = async (c: model.Collection) => {
  if (c.id === 'default' || c.is_default) {
    return
  }
  const confirmed = await uiStore.requestConfirm(
    `Bạn có chắc chắn muốn xóa collection "${c.name}" không? Toàn bộ request và environment sẽ bị xóa vĩnh viễn.`
  )
  if (!confirmed) return
  await collectionStore.deleteCollection(c.id || '')
}

const handleCollectionModalSubmit = async (name: string) => {
  if (collectionModalMode.value === 'create') {
    const ok = await collectionStore.createCollection(name)
    if (ok) {
      isCollectionModalOpen.value = false
    }
  } else if (collectionModalMode.value === 'rename' && targetId.value) {
    const ok = await collectionStore.renameCollection(targetId.value, name)
    if (ok) {
      isCollectionModalOpen.value = false
    }
  }
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown.esc="close">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50" @click="close"></div>
    
    <!-- Modal -->
    <div class="relative bg-surface-raised border border-border-default rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between p-4 border-b border-border-default">
        <h2 class="heading-sm text-text-primary">Cài đặt</h2>
        <button @click="close" class="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-overlay transition-colors" aria-label="Đóng">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div class="p-4 flex-1 overflow-y-auto min-h-[150px]">
        <div class="flex flex-col gap-6">
          <!-- Storage Section -->
          <div>
            <h3 class="ui-sm font-semibold text-text-primary mb-2">Lưu trữ</h3>
            
            <p class="ui-xs text-text-muted mb-3">
              Thay đổi thư mục chứa dữ liệu ứng dụng (collections, environments). Dữ liệu ở thư mục cũ sẽ được giữ nguyên.
            </p>
            <div class="mb-3 px-3 py-2 bg-surface-base border border-border-default rounded ui-xs text-text-secondary truncate" :title="currentPath">
              {{ currentPath || 'Đang tải...' }}
            </div>

            <button @click="changeLocation" :disabled="isSaving" class="px-4 py-2 bg-surface-overlay border border-border-default text-text-primary rounded hover:bg-text-primary hover:text-text-inverse transition-colors ui-sm font-medium w-full text-left flex items-center justify-between">
              <span>Đổi thư mục lưu trữ...</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </button>
          </div>

          <!-- Auto-save Section -->
          <div class="border-t border-border-default pt-4">
            <div class="flex items-center justify-between gap-4">
              <div class="flex-1">
                <h3 class="ui-sm font-semibold text-text-primary">Tự động lưu (Auto-save)</h3>
                <p class="ui-xs text-text-muted mt-0.5">
                  Tự động lưu ngầm các thay đổi sau 800ms cho cả Request và Folder. Khi tắt, bạn có thể lưu thủ công bằng Ctrl+S.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Tự động lưu"
                :aria-checked="uiStore.autoSaveEnabled"
                data-test="toggle-auto-save"
                @click="uiStore.setAutoSaveEnabled(!uiStore.autoSaveEnabled)"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                :class="uiStore.autoSaveEnabled ? 'bg-brand-primary' : 'bg-surface-overlay'"
                title="Bật/Tắt tự động lưu"
              >
                <span
                  aria-hidden="true"
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  :class="uiStore.autoSaveEnabled ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

          <!-- Collection Management Section -->
          <div class="border-t border-border-default pt-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="ui-sm font-semibold text-text-primary">Quản lý Collection</h3>
              <button
                type="button"
                @click="openCreateCollection"
                class="px-2.5 py-1 text-xs bg-brand-primary hover:bg-brand-primary-hover text-white rounded transition-colors flex items-center gap-1 font-medium cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Tạo mới</span>
              </button>
            </div>
            
            <p class="ui-xs text-text-muted mb-3">
              Danh sách các collection hiện có trong ứng dụng.
            </p>

            <div v-if="collectionStore.collectionsLoading && collectionStore.collections.length === 0" class="py-4 text-center ui-xs text-text-muted">
              Đang tải collections...
            </div>
            <div v-else-if="collectionStore.collections.length === 0" class="py-4 text-center ui-xs text-text-muted">
              Không có collection nào.
            </div>
            <div v-else class="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
              <div
                v-for="c in collectionStore.collections"
                :key="c.id"
                class="flex items-center justify-between px-3 py-2 bg-surface-base border border-border-default rounded text-text-primary ui-xs"
              >
                <div class="flex items-center gap-2 min-w-0 mr-2 flex-1">
                  <span class="font-medium truncate" :title="c.name">{{ c.name }}</span>
                  <span
                    v-if="c.id === collectionStore.activeCollectionId"
                    class="px-1.5 py-0.2 rounded text-[10px] bg-brand-primary/20 text-brand-primary border border-brand-primary/30 shrink-0 font-medium"
                  >
                    Active
                  </span>
                  <span
                    v-if="c.id === 'default' || c.is_default"
                    class="px-1.5 py-0.2 rounded text-[10px] bg-surface-overlay text-text-muted border border-border-default shrink-0"
                  >
                    Default
                  </span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <!-- Rename -->
                  <button
                    type="button"
                    class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                    title="Đổi tên collection"
                    aria-label="Đổi tên collection"
                    @click="openRenameCollection(c)"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>

                  <!-- Duplicate -->
                  <button
                    type="button"
                    class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                    title="Nhân bản collection"
                    aria-label="Nhân bản collection"
                    @click="handleDuplicateCollection(c.id || '')"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>

                  <!-- Delete -->
                  <button
                    type="button"
                    :disabled="c.id === 'default' || c.is_default"
                    :class="[
                      'p-1 rounded transition-colors',
                      (c.id === 'default' || c.is_default)
                        ? 'opacity-30 cursor-not-allowed text-text-muted'
                        : 'text-text-muted hover:text-rose-400 hover:bg-surface-hover'
                    ]"
                    :title="(c.id === 'default' || c.is_default) ? 'Không thể xóa collection mặc định' : 'Xóa collection'"
                    aria-label="Xóa collection"
                    @click="handleDeleteCollection(c)"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collection Modal -->
    <CollectionModal
      v-model="isCollectionModalOpen"
      :mode="collectionModalMode"
      :initial-name="collectionModalInitialName"
      @submit="handleCollectionModalSubmit"
    />
  </div>
</template>
