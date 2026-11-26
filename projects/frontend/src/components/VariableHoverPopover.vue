<script lang="ts" setup>
import { computed, inject, ref, watch } from 'vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useRequestStore, type KVPair } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import {
  inspectVariableHierarchy,
  type FolderNodeLike
} from '@/utils/resolveHierarchyVariables'
import { LoadFolder, UpdateFolder } from '../../wailsjs/go/main/App'
import CustomSelect, { type SelectOption } from '@/components/CustomSelect.vue'
import KvpValueSelectControl from '@/components/KvpValueSelectControl.vue'

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

const injectedScopeContext = inject<'request' | 'folder' | null>('variableScopeContext', null)
const hasActiveRequest = computed(() => {
  if (injectedScopeContext === 'folder') return false
  if (injectedScopeContext === 'request') return Boolean(requestStore.current)
  return Boolean(requestStore.current && !collectionStore.activeFolderId)
})

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
    pathParamValue: currentPathParamValue.value,
    pathParams: requestStore.current?.path_params || null,
    requestVariables: hasActiveRequest.value ? (requestStore.current?.variables || []) : null,
    hasActiveRequest: hasActiveRequest.value
  })
})

const selectedScopeId = ref<string>(inspection.value.defaultScopeId)
const inputValue = ref<string>('')
const inputType = ref<'text' | 'select'>('text')
const inputOptions = ref<string[]>([])

const areStringArraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

const getBaselineForScope = (scopeId: string): {
  value: string
  type: 'text' | 'select'
  options: string[]
} => {
  const scopeOpt = inspection.value.options.find(o => o.id === scopeId)
  const type: 'text' | 'select' =
    scopeOpt?.type !== undefined
      ? (scopeOpt.type === 'select' ? 'select' : 'text')
      : inspection.value.inheritedType
  const options: string[] =
    scopeOpt?.type !== undefined
      ? (Array.isArray(scopeOpt.options) ? [...scopeOpt.options] : [])
      : [...inspection.value.inheritedOptions]
  let value = ''
  if (Object.prototype.hasOwnProperty.call(inspection.value.valuesByScopeId, scopeId)) {
    value = inspection.value.valuesByScopeId[scopeId] ?? ''
  } else if (scopeId === 'request' && type === 'select') {
    value = inspection.value.effectiveValue ?? ''
  }
  return { value, type, options }
}

const syncLocalStateForScope = (scopeId: string) => {
  const baseline = getBaselineForScope(scopeId)
  inputValue.value = baseline.value
  inputType.value = baseline.type
  inputOptions.value = baseline.options
}

syncLocalStateForScope(selectedScopeId.value)

watch(
  () => [props.variableName, props.variableKind, requestStore.current?.id],
  () => {
    selectedScopeId.value = inspection.value.defaultScopeId
    syncLocalStateForScope(selectedScopeId.value)
  }
)

watch(
  () => ({
    type: inspection.value.inheritedType,
    options: inspection.value.inheritedOptions
  }),
  (nextMeta, prevMeta) => {
    const scopeOpt = inspection.value.options.find(o => o.id === selectedScopeId.value)
    if (scopeOpt?.type !== undefined) return
    if (
      prevMeta &&
      inputType.value === prevMeta.type &&
      areStringArraysEqual(inputOptions.value, prevMeta.options)
    ) {
      inputType.value = nextMeta.type
      inputOptions.value = [...nextMeta.options]
    }
  }
)

watch(
  () => inspection.value.options,
  (opts) => {
    if (!opts.some(o => o.id === selectedScopeId.value)) {
      selectedScopeId.value = inspection.value.defaultScopeId
      syncLocalStateForScope(selectedScopeId.value)
    }
  }
)

watch(
  selectedScopeId,
  (newScopeId) => {
    syncLocalStateForScope(newScopeId)
  },
  { flush: 'sync' }
)

const handleScopeChange = (eOrVal?: any) => {
  const targetVal = eOrVal && typeof eOrVal === 'object' && 'target' in eOrVal
    ? (eOrVal.target as HTMLSelectElement)?.value
    : (typeof eOrVal === 'string' ? eOrVal : selectedScopeId.value)
  if (targetVal) {
    selectedScopeId.value = targetVal
    syncLocalStateForScope(targetVal)
  }
}

const scopeSelectOptions = computed<SelectOption[]>(() =>
  inspection.value.options.map(opt => ({
    value: opt.id,
    label: opt.label
  }))
)

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
  list: KVPair[] | null | undefined,
  key: string,
  value: string,
  meta?: { type?: 'text' | 'select'; options?: string[]; pureValueOverride?: boolean }
): KVPair[] => {
  const items: KVPair[] = Array.isArray(list)
    ? list.map(v => ({
        ...v,
        key: v.key,
        value: v.value ?? '',
        enabled: Boolean(v.enabled),
        ...(Array.isArray(v.options) ? { options: [...v.options] } : {})
      }))
    : []
  const matchingIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (typeof items[i]?.key === 'string' && items[i].key.trim() === key) {
      matchingIndices.push(i)
    }
  }
  const buildUpdated = (existing?: KVPair): KVPair => {
    const next: KVPair = {
      ...(existing ? { ...existing } : {}),
      key,
      value,
      enabled: true
    }
    if (meta?.pureValueOverride) {
      delete next.type
      delete next.options
      return next
    }
    if (meta?.type === 'select') {
      next.type = 'select'
      if (Array.isArray(meta.options) && meta.options.length > 0) {
        next.options = [...meta.options]
      } else {
        delete next.options
      }
    } else {
      if (existing?.type === 'select') {
        next.type = 'text'
      } else {
        delete next.type
      }
      if (!existing) {
        delete next.options
      } else if (Array.isArray(meta?.options)) {
        if (meta.options.length === 0) {
          delete next.options
        } else {
          next.options = [...meta.options]
        }
      } else if (!existing.options?.length) {
        delete next.options
      }
    }
    return next
  }
  if (matchingIndices.length === 0) {
    items.push(buildUpdated())
    return items
  }
  const lastIdx = matchingIndices[matchingIndices.length - 1]
  items[lastIdx] = buildUpdated(items[lastIdx])
  const earlierIndices = new Set(matchingIndices.slice(0, -1))
  return items.filter((_, i) => !earlierIndices.has(i))
}

const hasPendingChanges = computed(() => {
  const baseline = getBaselineForScope(selectedScopeId.value)
  if (inputValue.value !== baseline.value) return true
  if (inputType.value !== baseline.type) return true
  return !areStringArraysEqual(inputOptions.value, baseline.options)
})

const hasRequestOverride = computed(
  () =>
    selectedScopeId.value === 'request' &&
    Boolean(inspection.value.options.find(o => o.id === 'request')?.hasVariable)
)

const isCurrentScopeReadonly = computed(() => {
  if (!hasActiveRequest.value) return false
  const flags = requestStore.activeSyncFlags
  if (!flags) return false
  if (selectedScopeId.value === 'request') return Boolean(flags.variables)
  if (selectedScopeId.value === 'path-param') return Boolean(flags.path_params)
  return false
})

const handleClearRequestOverride = async () => {
  if (saving.value || isCurrentScopeReadonly.value || !requestStore.current) return
  const trimmedKey = props.variableName.trim()
  if (!trimmedKey || !Array.isArray(requestStore.current.variables)) return
  saving.value = true
  try {
    requestStore.current.variables = requestStore.current.variables.filter(
      v => !(v && typeof v.key === 'string' && v.key.trim() === trimmedKey)
    )
    const ok = await requestStore.saveCurrent({ silent: true })
    if (ok) {
      revision.value++
      syncLocalStateForScope('request')
      emit('saved', {
        key: trimmedKey,
        value: inspection.value.effectiveValue ?? '',
        scopeId: 'request'
      })
    }
  } catch (err) {
    uiStore.showToast(String(err))
  } finally {
    saving.value = false
  }
}

const handleSelectValue = async (val: string) => {
  inputValue.value = val
  await handleSave()
}

const handleSave = async () => {
  if (saving.value || isCurrentScopeReadonly.value) return
  const trimmedKey = props.variableName.trim()
  if (!trimmedKey) return

  const scopeOpt =
    inspection.value.options.find(o => o.id === selectedScopeId.value) ||
    inspection.value.defaultOption
  if (!scopeOpt) return

  const newVal = inputValue.value
  const varMeta = { type: inputType.value, options: inputOptions.value }
  saving.value = true

  try {
    if (scopeOpt.kind === 'request') {
      if (!requestStore.current) return
      if (!Array.isArray(requestStore.current.variables)) {
        requestStore.current.variables = []
      }
      const isPureOverride =
        inputType.value === inspection.value.parentInheritedType &&
        areStringArraysEqual(inputOptions.value, inspection.value.parentInheritedOptions)
      requestStore.current.variables = upsertVariable(
        requestStore.current.variables,
        trimmedKey,
        newVal,
        isPureOverride ? { pureValueOverride: true } : varMeta
      )
      const ok = await requestStore.saveCurrent({ silent: true })
      if (ok) {
        revision.value++
        emit('saved', { key: trimmedKey, value: newVal, scopeId: scopeOpt.id })
      }
      return
    }

    if (scopeOpt.kind === 'path-param') {
      if (!requestStore.current) return
      if (!Array.isArray(requestStore.current.path_params)) {
        requestStore.current.path_params = []
      }
      requestStore.current.path_params = upsertVariable(
        requestStore.current.path_params,
        trimmedKey,
        newVal,
        varMeta
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
      const nextVars = upsertVariable(activeColl.variables as any, trimmedKey, newVal, varMeta)
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

      const nextVars = upsertVariable(targetEnv.variables as any, trimmedKey, newVal, varMeta)
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
        folderData.variables = upsertVariable(folderData.variables, trimmedKey, newVal, varMeta)
      } else {
        const envId = scopeOpt.envId || envStore.activeEnvId
        if (!envId) return
        if (!folderData.folder_envs || typeof folderData.folder_envs !== 'object') {
          folderData.folder_envs = {}
        }
        folderData.folder_envs[envId] = upsertVariable(
          folderData.folder_envs[envId],
          trimmedKey,
          newVal,
          varMeta
        )
      }

      const updateRes = await UpdateFolder(folderData)
      if (!updateRes || !updateRes.success) {
        uiStore.showToast(updateRes?.error?.message || 'Không thể lưu thư mục')
        return
      }

      await collectionStore.loadTree()
      collectionStore.scheduleAutoPush()

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
          <div class="flex items-center gap-2">
            <button
              v-if="hasRequestOverride"
              type="button"
              data-test="variable-reset-request-override-btn"
              :disabled="saving || isCurrentScopeReadonly"
              title="Xóa giá trị riêng của Request này để dùng mặc định từ Env/Folder"
              class="text-[10px] font-medium text-amber-400 hover:underline cursor-pointer outline-none disabled:opacity-50"
              @click="handleClearRequestOverride"
            >
              Bỏ ghi đè
            </button>
            <button
              type="button"
              data-test="toggle-all-env-scopes"
              class="text-[10px] font-medium text-brand-primary hover:underline cursor-pointer outline-none"
              @click="showAllEnvs = !showAllEnvs"
            >
              {{ showAllEnvs ? 'Thu gọn' : 'Tất cả Env/Folder' }}
            </button>
          </div>
        </div>
        <CustomSelect
          v-model="selectedScopeId"
          data-test="variable-scope-select"
          :options="scopeSelectOptions"
          full-width
          size="xs"
          @change="handleScopeChange"
        />
      </div>

      <!-- Value Input / Select + Save Button -->
      <div class="flex items-center gap-1.5">
        <KvpValueSelectControl
          class="flex-1 min-w-0"
          :model-value="inputValue"
          :type="inputType"
          :options="inputOptions"
          :readonly="isCurrentScopeReadonly"
          :disabled="isCurrentScopeReadonly"
          :compact="true"
          @update:model-value="val => { inputValue = val }"
          @update:type="nextType => { inputType = nextType }"
          @update:options="nextOpts => { inputOptions = nextOpts }"
          @select="handleSelectValue"
          @portal-mouseenter="emit('mouseenter')"
          @portal-mouseleave="emit('mouseleave')"
        >
          <input
            v-model="inputValue"
            :readonly="isCurrentScopeReadonly"
            data-test="variable-value-input"
            type="text"
            :placeholder="inputPlaceholder"
            class="flex-1 min-w-0 bg-surface-input border border-border-default rounded px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
            :class="{ 'opacity-60 cursor-not-allowed': isCurrentScopeReadonly }"
            spellcheck="false"
            autocomplete="off"
            @keydown.enter.prevent="handleSave"
            @keydown.esc.stop.prevent="emit('close')"
          />
        </KvpValueSelectControl>
        <button
          type="button"
          data-test="variable-save-btn"
          :disabled="saving || isCurrentScopeReadonly"
          class="px-2.5 py-1.5 rounded bg-brand-primary text-white text-xs font-medium hover:bg-brand-hover transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary flex items-center gap-1.5"
          :class="{ 'opacity-50 cursor-not-allowed': saving || isCurrentScopeReadonly }"
          @click="handleSave"
        >
          <span
            v-if="hasPendingChanges && !saving"
            data-test="variable-save-dirty-dot"
            class="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"
            aria-hidden="true"
          ></span>
          <span>{{ saving ? '...' : 'Lưu' }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
