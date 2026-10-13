<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { model } from '../../wailsjs/go/models'
import CollectionModal from './CollectionModal.vue'

const collectionStore = useCollectionStore()
const uiStore = useUiStore()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// Modal state
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'rename'>('create')
const modalInitialName = ref('')
const targetId = ref('')

const activeCollectionName = computed(() => {
  if (collectionStore.collectionsLoading && collectionStore.collections.length === 0) {
    return 'Đang tải...'
  }
  return collectionStore.activeCollection?.name || 'Default Collection'
})

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const closeDropdown = () => {
  isOpen.value = false
}

const handleSelect = async (id: string) => {
  if (id === collectionStore.activeCollectionId) {
    isOpen.value = false
    return
  }
  const switched = await collectionStore.switchCollection(id)
  if (switched) {
    isOpen.value = false
  }
}

const isDuplicating = ref(false)

const openCreate = () => {
  modalMode.value = 'create'
  modalInitialName.value = ''
  targetId.value = ''
  isModalOpen.value = true
  isOpen.value = false
}

const openSettings = () => {
  uiStore.settingsModalOpen = true
  isOpen.value = false
}

const openRename = (c: model.Collection) => {
  modalMode.value = 'rename'
  modalInitialName.value = c.name
  targetId.value = c.id || ''
  isModalOpen.value = true
  isOpen.value = false
}

const handleDuplicate = async (id: string) => {
  if (isDuplicating.value) return
  isDuplicating.value = true
  try {
    await collectionStore.duplicateCollection(id)
  } finally {
    isDuplicating.value = false
  }
}

const handleDelete = async (c: model.Collection) => {
  if (c.id === 'default' || c.is_default) {
    return
  }
  isOpen.value = false
  const confirmed = await uiStore.requestConfirm(
    `Bạn có chắc chắn muốn xóa collection "${c.name}" không? Toàn bộ request và environment sẽ bị xóa vĩnh viễn.`
  )
  if (!confirmed) return
  await collectionStore.deleteCollection(c.id || '')
}

const handleModalSubmit = async (name: string) => {
  if (modalMode.value === 'create') {
    const ok = await collectionStore.createCollection(name)
    if (ok) {
      isModalOpen.value = false
      isOpen.value = false
    }
  } else if (modalMode.value === 'rename' && targetId.value) {
    const ok = await collectionStore.renameCollection(targetId.value, name)
    if (ok) {
      isModalOpen.value = false
      isOpen.value = false
    }
  }
}

const handleDocumentClick = (e: MouseEvent) => {
  if (!isOpen.value) return
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="relative flex-1 min-w-0" ref="dropdownRef">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="toggleDropdown"
      class="w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded text-text-primary hover:bg-surface-hover transition-colors min-w-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary"
      :title="activeCollectionName"
      :aria-expanded="isOpen"
      aria-haspopup="true"
      aria-label="Chọn collection"
    >
      <div class="flex items-center gap-1.5 min-w-0">
        <svg class="w-4 h-4 shrink-0 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span class="truncate ui-xs font-semibold text-text-primary">
          {{ activeCollectionName }}
        </span>
      </div>
      <svg
        :class="['w-3.5 h-3.5 shrink-0 text-text-muted transition-transform duration-150', isOpen ? 'rotate-180' : '']"
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

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="absolute top-full left-0 mt-1 w-[240px] bg-surface-raised border border-border-default rounded-md shadow-xl py-1 z-50 flex flex-col"
      role="menu"
      aria-label="Danh sách collections"
    >
      <!-- List of collections -->
      <div class="max-h-64 overflow-y-auto flex flex-col py-0.5">
        <div v-if="collectionStore.collections.length === 0" class="py-3 px-2.5 text-center ui-xs text-text-muted">
          Không có collection nào
        </div>
        <div
          v-for="c in collectionStore.collections"
          :key="c.id"
          :class="[
            'group flex items-center justify-between px-2.5 py-1.5 hover:bg-surface-hover transition-colors text-left text-text-primary ui-xs cursor-pointer focus:outline-none focus:bg-surface-hover',
            c.id === collectionStore.activeCollectionId ? 'bg-surface-overlay/60 text-brand-primary' : ''
          ]"
          role="menuitem"
          tabindex="0"
          @click="handleSelect(c.id || '')"
          @keydown.enter="handleSelect(c.id || '')"
          @keydown.space.prevent="handleSelect(c.id || '')"
        >
          <div class="flex items-center gap-1.5 min-w-0 mr-1.5 flex-1">
            <!-- Active checkmark or spacer -->
            <svg
              v-if="c.id === collectionStore.activeCollectionId"
              class="w-3.5 h-3.5 shrink-0 text-brand-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span v-else class="w-3.5 h-3.5 shrink-0"></span>

            <!-- Name -->
            <span class="truncate font-medium" :title="c.name">{{ c.name }}</span>

            <!-- Default Badge -->
            <span
              v-if="c.id === 'default' || c.is_default"
              class="px-1 py-0.2 rounded text-[10px] bg-surface-overlay text-text-muted border border-border-default shrink-0"
            >
              Default
            </span>
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100" @click.stop>
            <!-- Rename -->
            <button
              type="button"
              class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
              title="Đổi tên collection"
              aria-label="Đổi tên collection"
              @click="openRename(c)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>

            <!-- Duplicate -->
            <button
              type="button"
              class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
              title="Nhân bản collection"
              aria-label="Nhân bản collection"
              @click="handleDuplicate(c.id || '')"
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
                  : 'text-text-muted hover:text-rose-400 hover:bg-surface-overlay'
              ]"
              :title="(c.id === 'default' || c.is_default) ? 'Không thể xóa collection mặc định' : 'Xóa collection'"
              aria-label="Xóa collection"
              @click="handleDelete(c)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Divider & Create collection / Settings button -->
      <div class="border-t border-border-default pt-1 mt-1 px-1 flex flex-col gap-0.5">
        <button
          type="button"
          @click="openCreate"
          class="w-full flex items-center gap-1.5 px-2 py-1.5 text-brand-primary hover:bg-surface-hover rounded ui-xs font-medium transition-colors text-left cursor-pointer"
        >
          <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Tạo collection mới</span>
        </button>
        <button
          type="button"
          @click="openSettings"
          class="w-full flex items-center gap-1.5 px-2 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded ui-xs font-medium transition-colors text-left cursor-pointer"
        >
          <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Quản lý collections...</span>
        </button>
      </div>
    </div>

    <!-- Modal for create / rename -->
    <CollectionModal
      v-model="isModalOpen"
      :mode="modalMode"
      :initial-name="modalInitialName"
      @submit="handleModalSubmit"
    />
  </div>
</template>
