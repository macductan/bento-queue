<script lang="ts" setup>
import { ref, watch, onMounted, computed, onBeforeUnmount, provide } from 'vue'
import { useCollectionStore, type AuthConfig } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import KvpEditor from '@/components/KvpEditor.vue'
import AuthEditor from '@/components/AuthEditor.vue'
import { LoadFolder, UpdateFolder } from '../../wailsjs/go/main/App'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'

const collectionStore = useCollectionStore()
const uiStore = useUiStore()
const envStore = useEnvironmentStore()

const loading = ref(false)
const saving = ref(false)
const folder = ref<any>(null)
const variables = ref<{ key: string, value: string, enabled: boolean }[]>([])
const folder_envs = ref<Record<string, { key: string, value: string, enabled: boolean }[]>>({})
const selectedEnvScope = ref<string>('__folder_global__')
const headers = ref<{ key: string, value: string, enabled: boolean }[]>([])
const auth = ref<AuthConfig>({ type: 'inherit' })
const activeTab = ref<'headers' | 'variables' | 'auth'>('headers')

watch(selectedEnvScope, (scope) => {
  if (scope !== '__folder_global__' && !folder_envs.value[scope]) {
    folder_envs.value[scope] = []
  }
})

const currentScopeVariables = computed<{ key: string, value: string, enabled: boolean }[]>({
  get() {
    if (selectedEnvScope.value === '__folder_global__') {
      return variables.value
    }
    return folder_envs.value[selectedEnvScope.value] || []
  },
  set(newVal) {
    if (selectedEnvScope.value === '__folder_global__') {
      variables.value = [...newVal]
    } else {
      folder_envs.value = { ...folder_envs.value, [selectedEnvScope.value]: [...newVal] }
    }
  }
})

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
  return resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: parentNodes.value,
    activeEnvId: envStore.activeEnvId
  })
})

provide('effectiveVariables', effectiveVariables)

const headersCount = computed(() => {
  return headers.value.filter(h => typeof h?.key === 'string' && h.key.trim() !== '').length
})

const folderGlobalVarsCount = computed(() => {
  return variables.value.filter(v => typeof v?.key === 'string' && v.key.trim() !== '').length
})

const getEnvVarsCount = (envId: string) => {
  const envVars = folder_envs.value[envId]
  if (!envVars || !Array.isArray(envVars)) return 0
  return envVars.filter(v => typeof v?.key === 'string' && v.key.trim() !== '').length
}

const totalVariablesCount = computed(() => {
  let count = folderGlobalVarsCount.value
  for (const list of Object.values(folder_envs.value)) {
    if (Array.isArray(list)) {
      count += list.filter(v => typeof v?.key === 'string' && v.key.trim() !== '').length
    }
  }
  return count
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
const saveStatus = ref<'saved' | 'unsaved' | 'saving' | 'error'>('saved')
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let activeSavePromise: Promise<boolean> | null = null

const getCleanSnapshot = () => {
  const cleanFolderEnvs: Record<string, { key: string; value: string; enabled: boolean }[]> = {}
  for (const [envId, vars] of Object.entries(folder_envs.value)) {
    const clean = (vars || []).filter(v => typeof v?.key === 'string' && v.key.trim() !== '')
    if (clean.length > 0) {
      cleanFolderEnvs[envId] = clean
    }
  }
  return JSON.stringify({
    variables: variables.value.filter(v => typeof v?.key === 'string' && v.key.trim() !== ''),
    folder_envs: cleanFolderEnvs,
    headers: headers.value.filter(h => typeof h?.key === 'string' && h.key.trim() !== ''),
    auth: auth.value
  })
}

const isDirty = computed(() => {
  if (!initialData.value) return false
  return getCleanSnapshot() !== initialData.value
})

const cancelAutoSave = () => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

const scheduleAutoSave = (delay = 800) => {
  cancelAutoSave()
  if (!isDirty.value) {
    if (saveStatus.value !== 'saving') saveStatus.value = 'saved'
    return
  }
  if (saveStatus.value !== 'saving') saveStatus.value = 'unsaved'
  if (uiStore.autoSaveEnabled) {
    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null
      if (isDirty.value) {
        await saveFolderData({ silent: true })
      }
    }, delay)
  }
}

watch([variables, folder_envs, headers, auth], () => {
  if (loading.value) return
  if (isDirty.value) {
    scheduleAutoSave()
  } else {
    cancelAutoSave()
    if (saveStatus.value !== 'saving') saveStatus.value = 'saved'
  }
}, { deep: true })

const loadFolderData = async () => {
  if (!collectionStore.activeFolderId) return
  cancelAutoSave()
  loading.value = true
  try {
    const result = await LoadFolder(collectionStore.activeFolderId)
    if (result.success && result.data) {
      folder.value = result.data
      variables.value = result.data.variables || []
      folder_envs.value = result.data.folder_envs || {}
      headers.value = result.data.headers || []
      auth.value = result.data.auth || { type: 'inherit' }
      initialData.value = getCleanSnapshot()
      saveStatus.value = 'saved'
    } else {
      uiStore.showToast(result.error?.message || 'Không thể tải thông tin thư mục')
    }
  } catch (e) {
    uiStore.showToast(String(e))
  } finally {
    loading.value = false
  }
}

const saveFolderData = async (options?: { silent?: boolean }): Promise<boolean> => {
  if (activeSavePromise) {
    const prev = await activeSavePromise
    if (!folder.value) return false
    if (!isDirty.value) {
      if (!options?.silent) uiStore.showToast('Đã lưu cấu hình thư mục')
      return prev
    }
  }

  if (!folder.value) return false
  if (!isDirty.value) {
    if (!options?.silent) uiStore.showToast('Đã lưu cấu hình thư mục')
    return true
  }

  cancelAutoSave()
  let savePromise: Promise<boolean> | null = null
  const exec = async (): Promise<boolean> => {
    saving.value = true
    saveStatus.value = 'saving'
    try {
      const cleanHeaders = headers.value.filter(h => typeof h?.key === 'string' && h.key.trim() !== '')
      const cleanVariables = variables.value.filter(v => typeof v?.key === 'string' && v.key.trim() !== '')
      const cleanFolderEnvs: Record<string, { key: string; value: string; enabled: boolean }[]> = {}
      for (const [envId, vars] of Object.entries(folder_envs.value)) {
        const clean = (vars || []).filter(v => typeof v?.key === 'string' && v.key.trim() !== '')
        if (clean.length > 0) {
          cleanFolderEnvs[envId] = clean
        }
      }

      const dataToSave = { 
        ...folder.value, 
        variables: cleanVariables,
        folder_envs: cleanFolderEnvs,
        headers: cleanHeaders,
        auth: auth.value
      }
      const result = await UpdateFolder(dataToSave)
      if (result.success) {
        initialData.value = getCleanSnapshot()
        saveStatus.value = 'saved'
        if (!options?.silent) {
          uiStore.showToast('Đã lưu cấu hình thư mục')
        }
        await collectionStore.loadTree() // Reload tree to reflect new headers/variables in store
        return true
      } else {
        saveStatus.value = 'error'
        uiStore.showToast(result.error?.message || 'Không thể lưu thư mục')
        return false
      }
    } catch (e) {
      saveStatus.value = 'error'
      uiStore.showToast(String(e))
      return false
    } finally {
      saving.value = false
      if (activeSavePromise === savePromise) {
        activeSavePromise = null
      }
    }
  }

  savePromise = exec()
  activeSavePromise = savePromise
  return await savePromise
}

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveFolderData()
  }
}

const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (isDirty.value) {
    e.preventDefault()
    void saveFolderData({ silent: true })
  }
}

let isReverting = false

watch(() => collectionStore.activeFolderId, async (newId, oldId) => {
  if (isReverting) {
    isReverting = false
    return
  }
  if (oldId && isDirty.value) {
    const saved = await saveFolderData({ silent: true })
    if (!saved) {
      isReverting = true
      collectionStore.activeFolderId = oldId
      return
    }
  }
  cancelAutoSave()
  await loadFolderData()
})

onMounted(() => {
  loadFolderData()
  window.addEventListener('keydown', handleKeydown)
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }
})

onBeforeUnmount(async () => {
  window.removeEventListener('keydown', handleKeydown)
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
  cancelAutoSave()
  const stillExists = folder.value && collectionStore.findNode(collectionStore.tree, folder.value.id)
  if (isDirty.value && stillExists) {
    await saveFolderData({ silent: true })
  }
})
</script>

<template>
  <div class="flex flex-col h-full bg-surface-base">
    <div v-if="loading" class="flex-1 flex items-center justify-center text-text-muted">
      Đang tải...
    </div>
    <div v-else-if="folder" class="flex flex-col h-full">
      <div class="px-4 py-3 border-b border-border-default flex items-center justify-between">
        <h2 class="text-lg font-medium text-text-primary flex items-center gap-3">
          <span>{{ folderName }}</span>
          <span
            data-test="folder-save-state-indicator"
            role="status"
            aria-live="polite"
            class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-surface-overlay border border-border-default select-none"
            :data-status="saveStatus"
          >
            <!-- saving -->
            <template v-if="saveStatus === 'saving'">
              <svg class="animate-spin w-3 h-3 text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class="text-text-secondary text-xs">Đang lưu...</span>
            </template>

            <!-- unsaved -->
            <template v-else-if="saveStatus === 'unsaved'">
              <span class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0" title="Chưa lưu" aria-label="Chưa lưu"></span>
              <span class="text-amber-400 text-xs">Chưa lưu</span>
            </template>

            <!-- error -->
            <template v-else-if="saveStatus === 'error'">
              <span class="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Lỗi khi lưu" aria-label="Lỗi khi lưu"></span>
              <span class="text-red-400 text-xs">Lỗi khi lưu</span>
            </template>

            <!-- saved -->
            <template v-else>
              <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-text-muted text-xs">Đã lưu</span>
            </template>
          </span>
        </h2>
        <button 
          @click="saveFolderData()"
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
            v-if="totalVariablesCount > 0" 
            class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
            :class="activeTab === 'variables' ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
          >
            {{ totalVariablesCount }}
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
        <div v-show="activeTab === 'variables'" class="flex flex-col gap-3">
          <div class="flex items-center justify-between bg-surface-raised/40 p-2.5 rounded-md border border-border-default">
            <div class="flex items-center gap-2">
              <label for="folder-env-scope-select" class="text-xs font-medium text-text-secondary whitespace-nowrap">
                Phạm vi môi trường:
              </label>
              <div class="relative flex items-center">
                <select
                  id="folder-env-scope-select"
                  v-model="selectedEnvScope"
                  class="peer appearance-none bg-surface-overlay border border-border-default rounded-md h-[32px] pl-2.5 pr-7 text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary cursor-pointer"
                  data-test="folder-env-scope-select"
                >
                  <option value="__folder_global__" class="bg-surface-overlay text-text-primary">
                    Folder Global Env (Dùng chung) {{ folderGlobalVarsCount > 0 ? `(${folderGlobalVarsCount})` : '' }}
                  </option>
                  <option v-for="env in envStore.environments" :key="env.id" :value="env.id" class="bg-surface-overlay text-text-primary">
                    {{ env.name }} {{ getEnvVarsCount(env.id) > 0 ? `(${getEnvVarsCount(env.id)})` : '' }}
                  </option>
                </select>
                <div class="absolute right-2 pointer-events-none text-text-muted peer-focus:text-brand-primary flex items-center justify-center">
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </div>
            </div>
            <span class="text-xs text-text-muted">
              {{ selectedEnvScope === '__folder_global__' ? 'Có hiệu lực cho mọi môi trường' : 'Chỉ áp dụng khi chọn môi trường này' }}
            </span>
          </div>
          <KvpEditor v-model="currentScopeVariables" />
        </div>
      </div>
    </div>
  </div>
</template>
