<script lang="ts" setup>
import { ref, watch, onMounted, computed, onBeforeUnmount, provide, nextTick } from 'vue'
import { useCollectionStore, type AuthConfig } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useTabStore } from '@/stores/tabStore'
import KvpEditor from '@/components/KvpEditor.vue'
import AuthEditor from '@/components/AuthEditor.vue'
import DefaultHeadersTable from '@/components/DefaultHeadersTable.vue'
import CustomSelect, { type SelectOption } from '@/components/CustomSelect.vue'
import { LoadFolder, UpdateFolder } from '../../wailsjs/go/main/App'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'
import { getInheritedHeaders, getDefaultHeaders, type DefaultHeaderItem } from '@/utils/headers'
import { resolveEffectiveAuth, getAuthArtifacts } from '@/utils/auth'
import { resolveVariables } from '@/utils/variables'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const collectionStore = useCollectionStore()
const uiStore = useUiStore()
const envStore = useEnvironmentStore()
const tabStore = useTabStore()

const loading = ref(false)
const saving = ref(false)
const folder = ref<any>(null)
const variables = ref<{ key: string, value: string, enabled: boolean }[]>([])
const folder_envs = ref<Record<string, { key: string, value: string, enabled: boolean }[]>>({})
const resolveDefaultEnvScope = (): string => {
  const activeId = envStore.activeEnvId
  if (activeId && envStore.environments.some(e => e.id === activeId)) {
    return activeId
  }
  return '__folder_global__'
}

const selectedEnvScope = ref<string>(resolveDefaultEnvScope())
const headers = ref<{ key: string, value: string, enabled: boolean }[]>([])
const auth = ref<AuthConfig>({ type: 'inherit' })
const auth_envs = ref<Record<string, AuthConfig>>({})
const activeTab = computed<'variables' | 'auth' | 'headers'>({
  get: () => {
    const id = folder.value?.id || collectionStore.activeFolderId || undefined
    return uiStore.getFolderActiveTab(id)
  },
  set: (val) => {
    const id = folder.value?.id || collectionStore.activeFolderId || undefined
    uiStore.setFolderActiveTab(val, id)
  }
})

watch(selectedEnvScope, (scope) => {
  if (scope !== '__folder_global__' && !folder_envs.value[scope]) {
    folder_envs.value[scope] = []
  }
})

watch(() => envStore.activeEnvId, () => {
  selectedEnvScope.value = resolveDefaultEnvScope()
})

watch(
  () => envStore.environments.map(e => e.id).join(','),
  () => {
    const envs = envStore.environments
    if (selectedEnvScope.value !== '__folder_global__' && !envs.some(e => e.id === selectedEnvScope.value)) {
      selectedEnvScope.value = resolveDefaultEnvScope()
    } else if (
      selectedEnvScope.value === '__folder_global__' &&
      envStore.activeEnvId &&
      envs.some(e => e.id === envStore.activeEnvId)
    ) {
      selectedEnvScope.value = resolveDefaultEnvScope()
    }
  }
)

const currentScopeVariables = computed<{ key: string, value: string, enabled: boolean }[]>({
  get() {
    if (selectedEnvScope.value === '__folder_global__') {
      return variables.value
    }
    return folder_envs.value[selectedEnvScope.value] ?? []
  },
  set(newVal) {
    if (selectedEnvScope.value === '__folder_global__') {
      variables.value = Array.isArray(newVal) ? newVal : []
    } else {
      folder_envs.value[selectedEnvScope.value] = Array.isArray(newVal) ? newVal : []
    }
  }
})

const folderName = computed(() => {
  if (!folder.value) return ''
  const node = collectionStore.findNode(collectionStore.tree, folder.value.id)
  return node ? node.name : folder.value.name
})

const isRenamingFolder = ref(false)
const editingFolderName = ref('')
const renameFolderInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => collectionStore.activeFolderId,
  () => {
    isRenamingFolder.value = false
    editingFolderName.value = ''
  }
)

watch(folderName, (newName) => {
  if (folder.value && newName) {
    folder.value.name = newName
  }
})

const startRenameFolder = async () => {
  if (!folder.value) return
  editingFolderName.value = folderName.value || folder.value.name || ''
  isRenamingFolder.value = true
  await nextTick()
  if (renameFolderInputRef.value) {
    renameFolderInputRef.value.focus()
    renameFolderInputRef.value.select()
  }
}

const cancelRenameFolder = () => {
  isRenamingFolder.value = false
  editingFolderName.value = ''
}

const commitRenameFolder = async () => {
  if (!isRenamingFolder.value || !folder.value) return
  const targetId = folder.value.id
  const currentName = folderName.value || folder.value.name || ''
  const trimmed = editingFolderName.value.trim()
  isRenamingFolder.value = false
  if (!trimmed || trimmed === currentName) {
    return
  }
  const ok = await collectionStore.renameNode(targetId, trimmed, 'folder')
  if (ok && folder.value && folder.value.id === targetId) {
    folder.value.name = folderName.value !== currentName ? folderName.value : trimmed
  }
}

const parentNodes = computed(() => {
  if (!folder.value) return []
  const fullPath = collectionStore.findFolderPath(collectionStore.tree, folder.value.id) || []
  return fullPath.slice(0, -1)
})

const folderParentPath = computed(() => {
  if (!folder.value) return ''
  const collName = collectionStore.activeCollection?.name
  const parts: string[] = []
  if (collName) parts.push(collName)
  for (const p of parentNodes.value) {
    if (p.name) parts.push(p.name)
  }
  return parts.join(' / ')
})

const folderHierarchyNodes = computed(() => {
  if (!folder.value) return []
  return [
    ...parentNodes.value,
    {
      id: folder.value.id,
      name: folderName.value || folder.value.name,
      variables: variables.value,
      folder_envs: folder_envs.value
    }
  ]
})

const effectiveVariables = computed(() => {
  return resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: folderHierarchyNodes.value,
    activeEnvId: envStore.activeEnvId
  })
})

provide('effectiveVariables', effectiveVariables)
provide('variableHierarchyFolders', folderHierarchyNodes)

const defaultHeaders = computed(() => {
  if (!folder.value) return []
  const inherited = getInheritedHeaders(parentNodes.value).map(h => ({
    ...h,
    rawValue: h.value || '',
    value: resolveVariables(h.value || '', effectiveVariables.value)
  }))
  const { auth: effectiveAuth, sourceNode } = resolveEffectiveAuth(auth.value, parentNodes.value, {
    activeEnvId: envStore.activeEnvId,
    requestAuthEnvs: auth_envs.value,
    collection: collectionStore.activeCollection as any
  })
  const { headers: authHeaders } = getAuthArtifacts(effectiveAuth, effectiveVariables.value)

  const isInherited = !!sourceNode
  const folderIdx = sourceNode ? parentNodes.value.findIndex(f => f.id === sourceNode.id) : -1
  const authFolderLevel = folderIdx !== -1 ? folderIdx + 1 : parentNodes.value.length + 1

  const taggedAuthHeaders = authHeaders.map(h => ({
    ...h,
    authSource: 'folder' as const,
    folderLevel: isInherited && sourceNode ? authFolderLevel : parentNodes.value.length + 1,
    folderName: isInherited && sourceNode ? sourceNode.name : (folderName.value || folder.value?.name)
  }))

  return getDefaultHeaders({ headers: headers.value }, inherited, taggedAuthHeaders)
})

const toggleDefaultHeader = (item: DefaultHeaderItem) => {
  if (!folder.value || item.overridden) return

  const lower = item.key.toLowerCase().trim()
  const idx = headers.value.findIndex(
    h => h && typeof h.key === 'string' && h.key.trim().toLowerCase() === lower
  )

  if (idx !== -1) {
    if (!headers.value[idx].enabled) {
      headers.value.splice(idx, 1)
    } else {
      headers.value[idx].enabled = false
    }
  } else {
    headers.value.push({
      key: item.key,
      value: item.source === 'auth' ? '' : (item.rawValue ?? item.value ?? ''),
      enabled: false
    })
  }
}

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

const isConfiguredFolderAuth = (a: AuthConfig | undefined): boolean => {
  if (!a || a.type === 'none' || a.type === 'inherit') return false
  if (a.type === 'bearer') return !!a.bearer?.token?.trim()
  if (a.type === 'basic') return !!(a.basic?.username?.trim() || a.basic?.password?.trim())
  if (a.type === 'apiKey') return !!a.apiKey?.key?.trim()
  return false
}

const authCount = computed(() => {
  let count = isConfiguredFolderAuth(auth.value) ? 1 : 0
  for (const envAuth of Object.values(auth_envs.value || {})) {
    if (isConfiguredFolderAuth(envAuth)) count++
  }
  return count
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
  const cleanAuthEnvs: Record<string, AuthConfig> = {}
  for (const [envId, envAuth] of Object.entries(auth_envs.value || {})) {
    if (envAuth && envAuth.type && envAuth.type !== 'inherit') {
      cleanAuthEnvs[envId] = envAuth
    }
  }
  return JSON.stringify({
    variables: variables.value.filter(v => typeof v?.key === 'string' && v.key.trim() !== ''),
    folder_envs: cleanFolderEnvs,
    headers: headers.value.filter(h => typeof h?.key === 'string' && h.key.trim() !== ''),
    auth: auth.value,
    auth_envs: cleanAuthEnvs
  })
}

const isDirty = computed(() => {
  if (!initialData.value) return false
  return getCleanSnapshot() !== initialData.value
})

watch(
  isDirty,
  (dirty) => {
    if (loading.value) return
    const targetFolderId = folder.value?.id || collectionStore.activeFolderId
    if (targetFolderId) {
      tabStore.setTabDirty('folder', targetFolderId, dirty)
    }
  },
  { flush: 'sync' }
)

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

watch([variables, folder_envs, headers, auth, auth_envs], () => {
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
  isRenamingFolder.value = false
  editingFolderName.value = ''
  loading.value = true
  initialData.value = ''
  try {
    const result = await LoadFolder(collectionStore.activeFolderId)
    if (result.success && result.data) {
      folder.value = result.data
      variables.value = result.data.variables || []
      folder_envs.value = result.data.folder_envs || {}
      const defaultScope = resolveDefaultEnvScope()
      if (defaultScope !== '__folder_global__' && !folder_envs.value[defaultScope]) {
        folder_envs.value[defaultScope] = []
      }
      selectedEnvScope.value = defaultScope
      headers.value = result.data.headers || []
      auth.value = result.data.auth || { type: 'inherit' }
      auth_envs.value = result.data.auth_envs || {}
      initialData.value = getCleanSnapshot()
      saveStatus.value = 'saved'
      if (folder.value?.id) {
        tabStore.updateTabMeta('folder', folder.value.id, {
          name: folderName.value || folder.value.name
        })
        tabStore.setTabDirty('folder', folder.value.id, false)
      }
    } else {
      uiStore.showToast(result.error?.message || 'Không thể tải thông tin thư mục')
    }
  } catch (e) {
    uiStore.showToast(String(e))
  } finally {
    loading.value = false
  }
}

const saveFolderData = async (options?: { silent?: boolean } | boolean): Promise<boolean> => {
  const isSilent = typeof options === 'boolean' ? options : Boolean(options?.silent)
  if (activeSavePromise) {
    const prev = await activeSavePromise
    if (!folder.value) return false
    if (!isDirty.value) {
      if (!isSilent) uiStore.showToast('Đã lưu cấu hình thư mục')
      return prev
    }
  }

  if (!folder.value) return false
  if (!isDirty.value) {
    if (!isSilent) uiStore.showToast('Đã lưu cấu hình thư mục')
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
      const cleanAuthEnvs: Record<string, AuthConfig> = {}
      for (const [envId, envAuth] of Object.entries(auth_envs.value || {})) {
        if (envAuth && envAuth.type && envAuth.type !== 'inherit') {
          cleanAuthEnvs[envId] = envAuth
        }
      }

      const dataToSave = { 
        ...folder.value, 
        variables: cleanVariables,
        folder_envs: cleanFolderEnvs,
        headers: cleanHeaders,
        auth: auth.value,
        auth_envs: cleanAuthEnvs
      }
      const result = await UpdateFolder(dataToSave)
      if (result.success) {
        initialData.value = getCleanSnapshot()
        saveStatus.value = 'saved'
        if (folder.value?.id) {
          tabStore.setTabDirty('folder', folder.value.id, false)
        }
        if (!isSilent) {
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

const flushFolder = async (): Promise<boolean> => {
  cancelAutoSave()
  if (!folder.value || !isDirty.value) return true
  return await saveFolderData({ silent: true })
}

tabStore.registerFolderFlush(flushFolder)

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
  const oldStillExists = Boolean(oldId && collectionStore.findNode(collectionStore.tree, oldId))
  if (oldId && oldStillExists && isDirty.value) {
    const saved = await saveFolderData({ silent: true })
    if (!saved) {
      isReverting = true
      collectionStore.activeFolderId = oldId
      return
    }
  }
  cancelAutoSave()
  if (!newId) return
  await loadFolderData()
})

const syncExternalFolderVariables = (updatedData: any) => {
  if (!folder.value || loading.value || saving.value || isDirty.value || !updatedData || updatedData.id !== folder.value.id) return
  const nextVars = Array.isArray(updatedData.variables)
    ? updatedData.variables.map((v: any) => ({ ...v }))
    : []
  const nextFolderEnvs: Record<string, { key: string; value: string; enabled: boolean }[]> = {}
  if (updatedData.folder_envs && typeof updatedData.folder_envs === 'object') {
    for (const [envId, list] of Object.entries(updatedData.folder_envs)) {
      if (Array.isArray(list)) {
        nextFolderEnvs[envId] = list.map((v: any) => ({ ...v }))
      }
    }
  }
  if (selectedEnvScope.value !== '__folder_global__' && !nextFolderEnvs[selectedEnvScope.value]) {
    nextFolderEnvs[selectedEnvScope.value] = []
  }
  if (updatedData.auth) {
    auth.value = JSON.parse(JSON.stringify(updatedData.auth))
  }
  if (updatedData.auth_envs && typeof updatedData.auth_envs === 'object' && !Array.isArray(updatedData.auth_envs)) {
    auth_envs.value = JSON.parse(JSON.stringify(updatedData.auth_envs))
  }
  folder.value = {
    ...folder.value,
    variables: nextVars,
    folder_envs: nextFolderEnvs,
    auth: auth.value,
    auth_envs: auth_envs.value
  }
  variables.value = nextVars
  folder_envs.value = nextFolderEnvs
  cancelAutoSave()
  initialData.value = getCleanSnapshot()
  saveStatus.value = 'saved'
}

const handleExternalFolderUpdated = async (e: Event) => {
  const ce = e as CustomEvent
  if (!ce?.detail || loading.value || saving.value) return
  const targetId = folder.value?.id || collectionStore.activeFolderId
  if (ce.detail.folderId) {
    if (ce.detail.folderId === targetId && !isDirty.value) {
      cancelAutoSave()
      await loadFolderData()
    }
    return
  }
  syncExternalFolderVariables(ce.detail)
}

onMounted(() => {
  tabStore.registerFolderFlush(flushFolder)
  loadFolderData()
  window.addEventListener('keydown', handleKeydown)
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('hecto:folder-updated', handleExternalFolderUpdated)
  }
})

onBeforeUnmount(async () => {
  tabStore.registerFolderFlush(null)
  window.removeEventListener('keydown', handleKeydown)
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('hecto:folder-updated', handleExternalFolderUpdated)
  }
  cancelAutoSave()
  const stillExists = folder.value && collectionStore.findNode(collectionStore.tree, folder.value.id)
  if (isDirty.value && stillExists) {
    await saveFolderData({ silent: true })
  }
})

const folderEnvScopeOptions = computed<SelectOption[]>(() => {
  const list: SelectOption[] = [
    {
      value: '__folder_global__',
      label: `Folder Global Env (Dùng chung) ${folderGlobalVarsCount.value > 0 ? `(${folderGlobalVarsCount.value})` : ''}`.trim()
    }
  ]
  for (const env of envStore.environments) {
    const count = getEnvVarsCount(env.id)
    list.push({
      value: env.id,
      label: `${env.name} ${count > 0 ? `(${count})` : ''}`.trim()
    })
  }
  return list
})
</script>

<template>
  <div class="flex flex-col h-full bg-surface-base">
    <div v-if="loading" class="flex-1 flex items-center justify-center text-text-muted">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="folder" class="flex flex-col h-full">
      <div class="px-4 py-3 border-b border-border-default flex items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div v-if="folderParentPath" data-test="folder-parent-path" class="text-xs font-medium text-text-muted/70 truncate mb-1 select-none">
            {{ folderParentPath }}
          </div>
          <h2 class="text-lg font-medium text-text-primary flex items-center gap-2 min-w-0">
            <template v-if="!isRenamingFolder">
              <span
                data-test="breadcrumb-current-folder"
                class="truncate cursor-pointer hover:text-brand-primary transition-colors"
                :title="t('requestEditor.renameFolderHint')"
                @dblclick.stop="startRenameFolder"
              >{{ folderName }}</span>
              <button
                type="button"
                data-test="breadcrumb-rename-btn"
                class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
                :title="t('requestEditor.renameFolder')"
                :aria-label="t('requestEditor.renameFolder')"
                @click.stop="startRenameFolder"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </template>
            <input
              v-else
              ref="renameFolderInputRef"
              v-model="editingFolderName"
              data-test="breadcrumb-name-input"
              type="text"
              class="bg-zinc-950 border border-indigo-500 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none w-64"
              @keydown.enter.prevent="commitRenameFolder"
              @keydown.esc.prevent="cancelRenameFolder"
              @blur="commitRenameFolder"
            />
          </h2>
        </div>
        <div class="ml-auto flex items-center gap-3 shrink-0">
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
              <span class="text-text-secondary text-xs">{{ t('requestEditor.saving') }}</span>
            </template>

            <!-- unsaved -->
            <template v-else-if="saveStatus === 'unsaved'">
              <span class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0" :title="t('common.unsaved')" :aria-label="t('common.unsaved')"></span>
              <span class="text-amber-400 text-xs">{{ t('common.unsaved') }}</span>
            </template>

            <!-- error -->
            <template v-else-if="saveStatus === 'error'">
              <span class="w-2 h-2 rounded-full bg-red-500 shrink-0" :title="t('requestEditor.saveError')" :aria-label="t('requestEditor.saveError')"></span>
              <span class="text-red-400 text-xs">{{ t('requestEditor.saveError') }}</span>
            </template>

            <!-- saved -->
            <template v-else>
              <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-text-muted text-xs">{{ t('requestEditor.saved') }}</span>
            </template>
          </span>
          <button
            type="button"
            data-test="folder-save-btn"
            :disabled="saving || saveStatus === 'saving'"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-[11px] font-medium transition-colors cursor-pointer"
            :title="t('requestEditor.saveShortcut')"
            @click="saveFolderData(false)"
          >
            <svg class="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span>{{ t('common.save') }}</span>
            <kbd class="text-[9px] text-zinc-400 bg-zinc-900 px-1 py-0.5 rounded border border-zinc-700 font-mono">Ctrl+S</kbd>
          </button>
        </div>
      </div>
      
      <!-- Folder Tabs -->
      <div class="flex border-b border-border-default px-4 bg-surface-base" role="tablist">
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
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div v-show="activeTab === 'headers'" role="tabpanel" class="flex flex-col gap-4">
          <DefaultHeadersTable :items="defaultHeaders" @toggle="toggleDefaultHeader" />
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between px-1">
              <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Headers
              </span>
            </div>
            <KvpEditor v-model="headers" />
          </div>
        </div>
        <div v-show="activeTab === 'auth'" role="tabpanel">
          <AuthEditor v-model="auth" v-model:authEnvs="auth_envs" :path-nodes="parentNodes" :is-folder="true" />
        </div>
        <div v-show="activeTab === 'variables'" role="tabpanel" class="flex flex-col gap-3">
          <div class="flex items-center justify-between bg-surface-raised/40 p-2.5 rounded-md border border-border-default">
            <div class="flex items-center gap-2">
              <label for="folder-env-scope-select" class="text-xs font-medium text-text-secondary whitespace-nowrap">
                {{ t('auth.envScope') }}:
              </label>
              <CustomSelect
                id="folder-env-scope-select"
                v-model="selectedEnvScope"
                data-test="folder-env-scope-select"
                :options="folderEnvScopeOptions"
                size="sm"
              />
            </div>
            <span class="text-xs text-text-muted">
              {{ selectedEnvScope === '__folder_global__' ? t('auth.applyAllEnvs') : t('auth.applyCurrentEnvOnly') }}
            </span>
          </div>
          <KvpEditor v-model="currentScopeVariables" />
        </div>
      </div>
    </div>
  </div>
</template>
