<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useCollectionStore } from '../../stores/collectionStore'
import {
  flattenCollectionRequests,
  getMethodBadgeClass,
  type FlatRequestItem
} from '../../stores/flowStore'

const props = withDefaults(
  defineProps<{
    open?: boolean
    title?: string
    selectedRequestId?: string
  }>(),
  {
    open: true,
    title: 'Chọn API Request',
    selectedRequestId: ''
  }
)

const emit = defineEmits<{
  (e: 'select', requestId: string, item: FlatRequestItem): void
  (e: 'close'): void
}>()

const collectionStore = useCollectionStore()
const searchQuery = ref('')
const activeIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)

const allRequests = computed<FlatRequestItem[]>(() => {
  return flattenCollectionRequests(collectionStore.tree)
})

const filteredRequests = computed<FlatRequestItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allRequests.value
  return allRequests.value.filter(item => {
    return (
      item.name.toLowerCase().includes(q) ||
      item.method.toLowerCase().includes(q) ||
      item.folderPath.toLowerCase().includes(q) ||
      item.breadcrumbPath.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q)
    )
  })
})

watch(searchQuery, () => {
  activeIndex.value = 0
})

watch(filteredRequests, list => {
  if (list.length === 0) {
    activeIndex.value = 0
  } else if (activeIndex.value >= list.length || activeIndex.value < 0) {
    activeIndex.value = 0
  }
})

const focusSearchInput = async () => {
  await nextTick()
  searchInputRef.value?.focus()
}

const clearSearch = () => {
  searchQuery.value = ''
  focusSearchInput()
}

onMounted(() => {
  if (props.open) {
    focusSearchInput()
  }
})

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      searchQuery.value = ''
      activeIndex.value = 0
      focusSearchInput()
    }
  }
)

const selectItem = (item: FlatRequestItem) => {
  emit('select', item.id, item)
  emit('close')
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    return
  }

  const list = filteredRequests.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (list.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % list.length
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (list.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + list.length) % list.length
    }
  } else if (e.key === 'Enter') {
    if (
      e.target instanceof HTMLButtonElement &&
      !e.target.hasAttribute('data-request-id')
    ) {
      return
    }
    e.preventDefault()
    const target = list[activeIndex.value]
    if (target) {
      selectItem(target)
    }
  }
}
</script>

<template>
  <div
    v-if="props.open"
    data-test="request-picker-modal"
    tabindex="-1"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
    @click.self="emit('close')"
    @keydown="handleKeydown"
  >
    <div
      class="w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      role="dialog"
      aria-modal="true"
      :aria-label="props.title"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950/60">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-zinc-100">{{ props.title }}</span>
          <span class="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            {{ filteredRequests.length }}/{{ allRequests.length }}
          </span>
        </div>
        <button
          type="button"
          data-test="request-picker-close-btn"
          class="text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800 text-xs transition-colors"
          title="Đóng (Esc)"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Search Input -->
      <div class="p-3 border-b border-zinc-800 bg-zinc-900">
        <div class="relative flex items-center">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            data-test="request-picker-search-input"
            placeholder="Tìm theo tên Request, Method (GET/POST...), Folder hoặc URL..."
            class="w-full bg-zinc-950 border border-zinc-700 focus:border-blue-500 rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-colors"
          />
          <button
            v-if="searchQuery"
            type="button"
            data-test="request-picker-clear-search-btn"
            class="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs px-1"
            @click="clearSearch"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Request List -->
      <div class="flex-1 overflow-y-auto divide-y divide-zinc-800/60 min-h-[180px] max-h-[380px]">
        <div
          v-if="filteredRequests.length === 0"
          data-test="request-picker-empty"
          class="flex flex-col items-center justify-center py-10 px-4 text-center text-zinc-500 text-xs"
        >
          <p v-if="allRequests.length === 0">Chưa có API Request nào trong Collection hiện tại.</p>
          <p v-else>Không tìm thấy Request nào khớp với từ khóa "{{ searchQuery }}".</p>
        </div>

        <button
          v-for="(item, idx) in filteredRequests"
          :key="item.id"
          type="button"
          data-test="request-picker-item"
          :data-request-id="item.id"
          class="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors outline-none"
          :class="[
            idx === activeIndex
              ? 'bg-blue-600/15 text-zinc-100'
              : 'hover:bg-zinc-800/70 text-zinc-300',
            props.selectedRequestId === item.id ? 'border-l-2 border-l-blue-500' : ''
          ]"
          @mouseenter="activeIndex = idx"
          @click="selectItem(item)"
        >
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              data-test="request-picker-item-method"
              class="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded shrink-0 uppercase text-center min-w-[46px]"
              :class="getMethodBadgeClass(item.method)"
            >
              {{ item.method }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  data-test="request-picker-item-name"
                  class="text-xs font-medium text-zinc-100 truncate"
                >
                  {{ item.name }}
                </span>
                <span
                  data-test="request-picker-item-folder"
                  class="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-400 truncate max-w-[240px]"
                >
                  {{ item.breadcrumbPath }}
                </span>
              </div>
              <div
                v-if="item.url"
                data-test="request-picker-item-url"
                class="text-[11px] text-zinc-500 font-mono truncate mt-0.5"
              >
                {{ item.url }}
              </div>
            </div>
          </div>

          <span class="text-[11px] text-zinc-500 shrink-0 font-mono">↵ Chọn</span>
        </button>
      </div>

      <!-- Footer -->
      <div class="px-4 py-2 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-[11px] text-zinc-500">
        <span>↑↓ Di chuyển • Enter Chọn • Esc Đóng</span>
      </div>
    </div>
  </div>
</template>
