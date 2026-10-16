<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useRequestStore } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import {
  inspectVariableHierarchy,
  type FolderNodeLike
} from '@/utils/resolveHierarchyVariables'
import { LoadFolder, UpdateFolder } from '../../wailsjs/go/main/App'

export interface AnchorRectLike {
  top: number
  left: number
  bottom: number
  right: number
  width: number
  height: number
}

const props = withDefaults(
  defineProps<{
    variableName: string
    variableKind?: 'template' | 'path'
    anchorRect?: AnchorRectLike | null
    hierarchyFolders?: FolderNodeLike[]
  }>(),
  {
    variableKind: 'template',
    anchorRect: null,
    hierarchyFolders: () => []
  }
)

const emit = defineEmits<{
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
  (e: 'focusout'): void
  (e: 'close'): void
  (e: 'saved', payload: { key: string; value: string; scopeId: string }): void
}>()

const collectionStore = useCollectionStore()
const envStore = useEnvironmentStore()
const requestStore = useRequestStore()
const uiStore = useUiStore()

const saving = ref(false)
const revision = ref(0)
const showAllEnvs = ref(false)

const activeEnvObj = computed(() => {
  if (!envStore.activeEnvId) return null
  return envStore.environments.find(e => e.id === envStore.activeEnvId) || null
})

const isPathParam = computed(() => props.variableKind === 'path')

const formattedVarToken = computed(() =>
  isPathParam.value ? `:${props.variableName}` : `{{${props.variableName}}}`
)
const inputPlaceholder = computed(() =>
  isPathParam.value
    ? `Nhập giá trị cho :${props.variableName}...`
    : `Nhập giá trị cho {{${props.variableName}}}...`
)

const currentPathParamValue = computed(() => {
  void revision.value
  if (!isPathParam.value || !requestStore.current?.path_params) return undefined
  const trimmed = props.variableName.trim()
  const found = requestStore.current.path_params.find(
    p => p && p.enabled && typeof p.key === 'string' && p.key.trim() === trimmed
  )
  return found && found.value !== '' ? found.value : undefined
})

const allTreeFolders = computed<FolderNodeLike[]>(() => {
  void revision.value
  const list: FolderNodeLike[] = []
  const walk = (nodes: TreeNode[] | undefined) => {
    if (!Array.isArray(nodes)) return
    for (const n of nodes) {
      if (n.type === 'folder') {
        list.push(n)
        if (n.children) walk(n.children)
      }
    }
  }
  walk(collectionStore.tree)
  return list
})

const inspection = computed(() => {
  // Touch revision so local in-place folder updates trigger re-evaluation
  void revision.value
  return inspectVariableHierarchy(props.variableName, {
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: activeEnvObj.value?.variables ?? envStore.variablesMap,
    pathFolders: props.hierarchyFolders || [],
    activeEnvId: envStore.activeEnvId,
    activeEnvName: activeEnvObj.value?.name || null,
    environments: envStore.environments as any,
    includeAllEnvs: showAllEnvs.value,
    allFolders: showAllEnvs.value ? allTreeFolders.value : null,
    isPathParam: isPathParam.value,
    pathParamValue: currentPathParamValue.value
  })
})

const selectedScopeId = ref<string>(inspection.value.defaultScopeId)
const inputValue = ref<string>(
  inspection.value.valuesByScopeId[inspection.value.defaultScopeId] ?? ''
)

watch(
  () => [props.variableName, props.variableKind],
  () => {
    selectedScopeId.value = inspection.value.defaultScopeId
    inputValue.value = inspection.value.valuesByScopeId[selectedScopeId.value] ?? ''
  }
)

watch(
  () => inspection.value.options,
  (opts) => {
    if (!opts.some(o => o.id === selectedScopeId.value)) {
      selectedScopeId.value = inspection.value.defaultScopeId
      inputValue.value = inspection.value.valuesByScopeId[selectedScopeId.value] ?? ''
    }
  }
)

watch(
  selectedScopeId,
  (newScopeId) => {
    inputValue.value = inspection.value.valuesByScopeId[newScopeId] ?? ''
  },
  { flush: 'sync' }
)

const handleScopeChange = (e: Event) => {
  const target = e.target as HTMLSelectElement | null
  if (target) {
    selectedScopeId.value = target.value
    inputValue.value = inspection.value.valuesByScopeId[target.value] ?? ''
  }
}

const popoverStyle = computed(() => {
  const rect = props.anchorRect
  if (!rect) {
    return {
      top: '16px',
      left: '16px'
    }
  }

  const viewportWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1024
  const viewportHeight = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 768
  const popoverWidth = 320
  const estimatedHeight = 168
  const gap = 6

  let top = rect.bottom + gap
  if (top + estimatedHeight > viewportHeight - 12 && rect.top - estimatedHeight - gap >= 8) {
    top = rect.top - estimatedHeight - gap
  }

  let left = rect.left
  if (left + popoverWidth > viewportWidth - 12) {
    left = Math.max(12, viewportWidth - popoverWidth - 12)
  }
  if (left < 12) {
    left = 12
  }

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`
  }
})

const upsertVariable = (
  list: { key: string; value: string; enabled?: boolean; description?: string }[] | null | undefined,
  key: string,
  value: string
): { key: string; value: string; enabled: boolean; description?: string }[] => {
  const items = Array.isArray(list)
    ? list.map(v => ({
        key: v.key,
        value: v.value ?? '',
        enabled: Boolean(v.enabled),
        ...(v.description !== undefined ? { description: v.description } : {})
      }))
    : []
  const matchingIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (typeof items[i]?.key === 'string' && items[i].key.trim() === key) {
      matchingIndices.push(i)
    }
  }
  if (matchingIndices.length === 0) {
    items.push({ key, value, enabled: true })
    return items
  }
  const lastIdx = matchingIndices[matchingIndices.length - 1]
  items[lastIdx] = {
    ...items[lastIdx],
    key,
    value,
    enabled: true
  }
  const earlierIndices = new Set(matchingIndices.slice(0, -1))
  return items.filter((_, i) => !earlierIndices.has(i))
}

const handleSave = async () => {
  if (saving.value) return
  const trimmedKey = props.variableName.trim()
  if (!trimmedKey) return

  const scopeOpt =
    inspection.value.options.find(o => o.id === selectedScopeId.value) ||
    inspection.value.defaultOption
  if (!scopeOpt) return

  const newVal = inputValue.value
  saving.value = true

  try {
    if (scopeOpt.kind === 'path-param') {
      if (!requestStore.current) return
      if (!Array.isArray(requestStore.current.path_params)) {
        requestStore.current.path_params = []
      }
      requestStore.current.path_params = upsertVariable(
        requestStore.current.path_params,
        trimmedKey,
        newVal
      )
      requestStore.scheduleAutoSave()
      revision.value++
      emit('saved', { key: trimmedKey, value: newVal, scopeId: scopeOpt.id })
      return
    }

    if (scopeOpt.kind === 'collection') {
      const activeColl = collectionStore.activeCollection
      if (!activeColl) return

      const collId = activeColl.id || collectionStore.activeCollectionId || 'default'
      const nextVars = upsertVariable(activeColl.variables as any, trimmedKey, newVal)
      const ok = await collectionStore.updateCollectionVariables(collId, nextVars)
      if (ok) {
        revision.value++
        emit('saved', { key: trimmedKey, value: newVal, scopeId: scopeOpt.id })
      }
      return
    }

    if (scopeOpt.kind === 'global-env') {
      const envId = scopeOpt.envId || envStore.activeEnvId
      if (!envId) return

      const targetEnv = envStore.environments.find(e => e.id === envId)
      if (!targetEnv) return

      const nextVars = upsertVariable(targetEnv.variables as any, trimmedKey, newVal)
      const payloadEnv = {
        ...targetEnv,
        variables: nextVars
      } as any

      const ok = await envStore.save(payloadEnv)
      if (ok) {
        revision.value++
        emit('saved', { key: trimmedKey, value: newVal, scopeId: scopeOpt.id })
      }
      return
    }

    if (scopeOpt.kind === 'folder-global' || scopeOpt.kind === 'folder-env') {
      const folderId = scopeOpt.folderId
      if (!folderId) return

      const loadRes = await LoadFolder(folderId)
      if (!loadRes || !loadRes.success || !loadRes.data) {
        uiStore.showToast(loadRes?.error?.message || 'Không thể tải thông tin thư mục')
        return
      }

      const folderData = JSON.parse(JSON.stringify(loadRes.data))
      folderData.id = folderData.id || folderId

      if (scopeOpt.kind === 'folder-global') {
        folderData.variables = upsertVariable(folderData.variables, trimmedKey, newVal)
      } else {
        const envId = scopeOpt.envId || envStore.activeEnvId
        if (!envId) return
        if (!folderData.folder_envs || typeof folderData.folder_envs !== 'object') {
          folderData.folder_envs = {}
        }
        folderData.folder_envs[envId] = upsertVariable(
          folderData.folder_envs[envId],
          trimmedKey,
          newVal
        )
      }

      const updateRes = await UpdateFolder(folderData)
      if (!updateRes || !updateRes.success) {
        uiStore.showToast(updateRes?.error?.message || 'Không thể lưu thư mục')
        return
      }

      await collectionStore.loadTree()

      const treeNode = collectionStore.findNode(collectionStore.tree, folderId)
      if (treeNode) {
        treeNode.variables = folderData.variables || []
        treeNode.folder_envs = folderData.folder_envs || {}
      }

      const propFolder = (props.hierarchyFolders || []).find(f => f && f.id === folderId)
      if (propFolder && propFolder !== treeNode) {
        propFolder.variables = folderData.variables || []
        propFolder.folder_envs = folderData.folder_envs || {}
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hecto:folder-updated', { detail: folderData }))
      }

      revision.value++
      emit('saved', { key: trimmedKey, value: newVal, scopeId: scopeOpt.id })
    }
  } catch (err) {
    uiStore.showToast(String(err))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      data-test="variable-hover-popover"
      role="dialog"
      :aria-label="`Biến môi trường ${variableName}`"
      class="fixed z-[9999] w-80 rounded-lg bg-surface-overlay border border-border-default shadow-2xl p-3 text-text-primary flex flex-col gap-2.5"
      :style="popoverStyle"
      @mouseenter="emit('mouseenter')"
      @mouseleave="emit('mouseleave')"
      @focusout="emit('focusout')"
      @keydown.esc.stop.prevent="emit('close')"
    >
      <!-- Header: Variable Name & Status Badge -->
      <div class="flex items-center justify-between gap-2">
        <span
          data-test="variable-popover-name"
          class="font-mono text-xs font-semibold truncate"
          :class="inspection.isResolved ? 'text-variable-valid' : 'text-variable-missing'"
        >
          {{ formattedVarToken }}
        </span>
        <span
          v-if="!inspection.isResolved"
          data-test="variable-status-badge"
          class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 shrink-0"
        >
          Chưa định nghĩa
        </span>
        <span
          v-else
          data-test="variable-status-badge"
          class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30 shrink-0 truncate max-w-[150px]"
        >
          {{ inspection.winningOption?.label || 'Đã định nghĩa' }}
        </span>
      </div>

      <!-- Scope Dropdown -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <label class="text-[11px] font-medium text-text-secondary">
            Phạm vi lưu trữ (Scope)
          </label>
          <button
            type="button"
            data-test="toggle-all-env-scopes"
            class="text-[10px] font-medium text-brand-primary hover:underline cursor-pointer outline-none"
            @click="showAllEnvs = !showAllEnvs"
          >
            {{ showAllEnvs ? 'Thu gọn' : 'Tất cả Env/Folder' }}
          </button>
        </div>
        <div class="relative flex items-center">
          <select
            v-model="selectedScopeId"
            data-test="variable-scope-select"
            class="peer appearance-none w-full bg-surface-raised border border-border-default rounded px-2.5 py-1.5 pr-7 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary cursor-pointer"
            @change="handleScopeChange"
          >
            <option
              v-for="opt in inspection.options"
              :key="opt.id"
              :value="opt.id"
              class="bg-surface-overlay text-text-primary"
            >
              {{ opt.label }}
            </option>
          </select>
          <div class="absolute right-2 pointer-events-none text-text-muted flex items-center justify-center">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Value Input + Save Button -->
      <div class="flex items-center gap-1.5">
        <input
          v-model="inputValue"
          data-test="variable-value-input"
          type="text"
          :placeholder="inputPlaceholder"
          class="flex-1 min-w-0 bg-surface-input border border-border-default rounded px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
          spellcheck="false"
          autocomplete="off"
          @keydown.enter.prevent="handleSave"
          @keydown.esc.stop.prevent="emit('close')"
        />
        <button
          type="button"
          data-test="variable-save-btn"
          :disabled="saving"
          class="px-2.5 py-1.5 rounded bg-brand-primary text-white text-xs font-medium hover:bg-brand-hover transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          :class="{ 'opacity-50 cursor-not-allowed': saving }"
          @click="handleSave"
        >
          {{ saving ? '...' : 'Lưu' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
