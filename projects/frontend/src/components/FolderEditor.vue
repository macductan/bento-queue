<script lang="ts" setup>
import { ref, watch, onMounted, computed, onBeforeUnmount, provide } from 'vue'
import { useCollectionStore, type AuthConfig } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import KvpEditor from '@/components/KvpEditor.vue'
import AuthEditor from '@/components/AuthEditor.vue'
import { LoadFolder, UpdateFolder } from '../../wailsjs/go/main/App'

const collectionStore = useCollectionStore()
const uiStore = useUiStore()
const envStore = useEnvironmentStore()

const loading = ref(false)
const saving = ref(false)
const folder = ref<any>(null)
const variables = ref<{ key: string, value: string, enabled: boolean }[]>([])
const headers = ref<{ key: string, value: string, enabled: boolean }[]>([])
const auth = ref<AuthConfig>({ type: 'inherit' })
const activeTab = ref<'headers' | 'variables' | 'auth'>('headers')

const folderName = computed(() => {
  if (!folder.value) return ''
  const node = collectionStore.findNode(collectionStore.tree, folder.value.id)
  return node ? node.name : folder.value.name
})

const parentNodes = computed(() => {
  if (!folder.value) return []
  const fullPath = collectionStore.findFolderPath(collectionStore.tree, folder.value.id) || []
  return fullPath.slice(0, -1)
})

const effectiveVariables = computed(() => {
  const map = new Map<string, string>()
  for (const [k, v] of envStore.variablesMap.entries()) map.set(k, v)
  for (const node of parentNodes.value) {
    if (node.variables) {
      for (const v of node.variables) {
        if (v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
          map.set(v.key.trim(), v.value)
        }
      }
    }
  }
  return map
})

provide('effectiveVariables', effectiveVariables)

const headersCount = computed(() => {
  return headers.value.filter(h => typeof h?.key === 'string' && h.key.trim() !== '').length
})

const variablesCount = computed(() => {
  return variables.value.filter(v => typeof v?.key === 'string' && v.key.trim() !== '').length
})

const authCount = computed(() => {
  const a = auth.value
  if (!a || a.type === 'none' || a.type === 'inherit') return 0
  if (a.type === 'bearer') return a.bearer?.token?.trim() ? 1 : 0
  if (a.type === 'basic') return (a.basic?.username?.trim() || a.basic?.password?.trim()) ? 1 : 0
  if (a.type === 'apiKey') return a.apiKey?.key?.trim() ? 1 : 0
  return 0
})

const initialData = ref<string>('')
const isDirty = computed(() => {
  if (!initialData.value) return false
  const currentSnapshot = JSON.stringify({
    variables: variables.value,
    headers: headers.value,
    auth: auth.value
  })
  return currentSnapshot !== initialData.value
})

const loadFolderData = async () => {
  if (!collectionStore.activeFolderId) return
  loading.value = true
  try {
    const result = await LoadFolder(collectionStore.activeFolderId)
    if (result.success && result.data) {
      folder.value = result.data
      variables.value = result.data.variables || []
      headers.value = result.data.headers || []
      auth.value = result.data.auth || { type: 'inherit' }
      initialData.value = JSON.stringify({
        variables: variables.value,
        headers: headers.value,
        auth: auth.value
      })
    } else {
      uiStore.showToast(result.error?.message || 'Không thể tải thông tin thư mục')
    }
  } catch (e) {
    uiStore.showToast(String(e))
  } finally {
    loading.value = false
  }
}

const saveFolderData = async () => {
  if (!folder.value || saving.value) return
  saving.value = true
  try {
    const cleanHeaders = headers.value.filter(h => typeof h?.key === 'string' && h.key.trim() !== '')
    const cleanVariables = variables.value.filter(v => typeof v?.key === 'string' && v.key.trim() !== '')

    const dataToSave = { 
      ...folder.value, 
      variables: cleanVariables,
      headers: cleanHeaders,
      auth: auth.value
    }
    const result = await UpdateFolder(dataToSave)
    if (result.success) {
      variables.value = cleanVariables
      headers.value = cleanHeaders
      initialData.value = JSON.stringify({
        variables: cleanVariables,
        headers: cleanHeaders,
        auth: auth.value
      })
      uiStore.showToast('Đã lưu cấu hình thư mục')
      await collectionStore.loadTree() // Reload tree to reflect new headers/variables in store
    } else {
      uiStore.showToast(result.error?.message || 'Không thể lưu thư mục')
    }
  } catch (e) {
    uiStore.showToast(String(e))
  } finally {
    saving.value = false
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveFolderData()
  }
}

watch(() => collectionStore.activeFolderId, loadFolderData)

onMounted(() => {
  loadFolderData()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="flex flex-col h-full bg-surface-base">
    <div v-if="loading" class="flex-1 flex items-center justify-center text-text-muted">
      Đang tải...
    </div>
    <div v-else-if="folder" class="flex flex-col h-full">
      <div class="px-4 py-3 border-b border-border-default flex items-center justify-between">
        <h2 class="text-lg font-medium text-text-primary flex items-center gap-2">
          {{ folderName }}
          <span v-if="isDirty" class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0" title="Chưa lưu" aria-label="Chưa lưu"></span>
        </h2>
        <button 
          @click="saveFolderData"
          :disabled="saving"
          class="px-3 py-1.5 bg-brand-primary text-white rounded hover:bg-brand-hover transition-colors text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-primary outline-none"
          :class="{ 'opacity-50 cursor-not-allowed': saving }"
        >
          {{ saving ? 'Đang lưu...' : 'Lưu (Ctrl+S)' }}
        </button>
      </div>
      
      <!-- Folder Tabs -->
      <div class="flex border-b border-border-default px-4 bg-surface-base" role="tablist">
        <button
          role="tab"
          :aria-selected="activeTab === 'headers'"
          @click="activeTab = 'headers'"
          class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm transition-colors"
          :class="activeTab === 'headers' ? 'border-brand-primary text-blue-400' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'"
        >
          Headers
          <span 
            v-if="headersCount > 0" 
            class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
            :class="activeTab === 'headers' ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
          >
            {{ headersCount }}
          </span>
        </button>
        <button
          role="tab"
          :aria-selected="activeTab === 'auth'"
          @click="activeTab = 'auth'"
          class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm transition-colors"
          :class="activeTab === 'auth' ? 'border-brand-primary text-blue-400' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'"
        >
          Auth
          <span 
            v-if="authCount > 0" 
            class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
            :class="activeTab === 'auth' ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
          >
            {{ authCount }}
          </span>
        </button>
        <button
          role="tab"
          :aria-selected="activeTab === 'variables'"
          @click="activeTab = 'variables'"
          class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm transition-colors"
          :class="activeTab === 'variables' ? 'border-brand-primary text-blue-400' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'"
        >
          Variables
          <span 
            v-if="variablesCount > 0" 
            class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
            :class="activeTab === 'variables' ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
          >
            {{ variablesCount }}
          </span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div v-show="activeTab === 'headers'">
          <KvpEditor v-model="headers" />
        </div>
        <div v-show="activeTab === 'auth'">
          <AuthEditor v-model="auth" :path-nodes="parentNodes" :is-folder="true" />
        </div>
        <div v-show="activeTab === 'variables'">
          <KvpEditor v-model="variables" />
        </div>
      </div>
    </div>
  </div>
</template>
