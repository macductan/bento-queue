<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { SelectDirectoryDialog, UpdateCollectionRoot, GetCollectionRoot } from '../../wailsjs/go/main/App'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useRequestStore } from '@/stores/requestStore'

defineProps<{
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

const fetchRoot = async () => {
  try {
    currentPath.value = await GetCollectionRoot()
  } catch (err) {
    console.error('Failed to get collection root:', err)
    currentPath.value = 'Không thể tải đường dẫn'
  }
}

onMounted(() => {
  fetchRoot()
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
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50" @click="close"></div>
    
    <!-- Modal -->
    <div class="relative bg-surface-raised border border-border-default rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between p-4 border-b border-border-default">
        <h2 class="heading-sm text-text-primary">Cài đặt</h2>
        <button @click="close" class="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-overlay transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <div class="p-4 flex-1 overflow-y-auto min-h-[150px]">
        <div class="flex flex-col gap-4">
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
        </div>
      </div>
    </div>
  </div>
</template>
