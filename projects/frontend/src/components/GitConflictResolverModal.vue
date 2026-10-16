<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import type { model } from '../../wailsjs/go/models'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()

interface FileResolutionState {
  fieldChoices: Record<string, 'ours' | 'theirs'>
  deleteChoice?: 'keep' | 'delete'
}

const selectedFileIndex = ref(0)
const resolutionMap = ref<Record<string, FileResolutionState>>({})

const conflicts = computed<model.GitFileConflict[]>(() => {
  return collectionStore.gitSyncStatus?.conflicts || []
})

const activeConflict = computed<model.GitFileConflict | null>(() => {
  if (conflicts.value.length === 0) return null
  const idx = Math.min(selectedFileIndex.value, conflicts.value.length - 1)
  return conflicts.value[idx] || null
})

function cloneDeep<T>(val: T): T {
  if (val === undefined || val === null) return val
  return JSON.parse(JSON.stringify(val))
}

function initResolutionState() {
  const nextMap: Record<string, FileResolutionState> = {}
  for (const c of conflicts.value) {
    const existing = resolutionMap.value[c.file_path]
    nextMap[c.file_path] = {
      fieldChoices: existing ? { ...existing.fieldChoices } : {},
      deleteChoice: existing?.deleteChoice
    }
  }
  resolutionMap.value = nextMap
  if (selectedFileIndex.value >= conflicts.value.length) {
    selectedFileIndex.value = 0
  }
}

watch(
  [() => uiStore.gitConflictModalOpen, () => collectionStore.gitSyncStatus?.conflicts],
  ([open]) => {
    if (open) {
      initResolutionState()
    }
  },
  { immediate: true, deep: true }
)

function isDeleteConflict(c: model.GitFileConflict): boolean {
  return c.conflict_type === 'delete_edit' || c.conflict_type === 'edit_delete'
}

function getUnresolvedFieldCount(c: model.GitFileConflict): number {
  const state = resolutionMap.value[c.file_path]
  if (!state) {
    return isDeleteConflict(c) ? 1 : (c.fields?.length || 0)
  }
  if (isDeleteConflict(c)) {
    return state.deleteChoice ? 0 : 1
  }
  const fields = c.fields || []
  return fields.filter((f) => !state.fieldChoices[f.field_path]).length
}

function isFileResolved(c: model.GitFileConflict): boolean {
  return getUnresolvedFieldCount(c) === 0
}

const resolvedFilesCount = computed(() => {
  return conflicts.value.filter((c) => isFileResolved(c)).length
})

const allResolved = computed(() => {
  if (conflicts.value.length === 0) return false
  return conflicts.value.every((c) => isFileResolved(c))
})

function pickField(filePath: string, fieldPath: string, side: 'ours' | 'theirs') {
  if (!resolutionMap.value[filePath]) {
    resolutionMap.value[filePath] = { fieldChoices: {} }
  }
  resolutionMap.value[filePath].fieldChoices[fieldPath] = side
}

function getFieldChoice(filePath: string, fieldPath: string): 'ours' | 'theirs' | undefined {
  return resolutionMap.value[filePath]?.fieldChoices[fieldPath]
}

function pickDeleteResolution(filePath: string, decision: 'keep' | 'delete') {
  if (!resolutionMap.value[filePath]) {
    resolutionMap.value[filePath] = { fieldChoices: {} }
  }
  resolutionMap.value[filePath].deleteChoice = decision
}

function getDeleteChoice(filePath: string): 'keep' | 'delete' | undefined {
  return resolutionMap.value[filePath]?.deleteChoice
}

function pickAllForFile(c: model.GitFileConflict, side: 'ours' | 'theirs') {
  if (!resolutionMap.value[c.file_path]) {
    resolutionMap.value[c.file_path] = { fieldChoices: {} }
  }
  if (isDeleteConflict(c)) {
    if (c.conflict_type === 'delete_edit') {
      resolutionMap.value[c.file_path].deleteChoice = side === 'ours' ? 'delete' : 'keep'
    } else {
      resolutionMap.value[c.file_path].deleteChoice = side === 'ours' ? 'keep' : 'delete'
    }
    return
  }
  for (const f of c.fields || []) {
    resolutionMap.value[c.file_path].fieldChoices[f.field_path] = side
  }
}

function pickAllFiles(side: 'ours' | 'theirs') {
  for (const c of conflicts.value) {
    pickAllForFile(c, side)
  }
}

const kvListPrefixes = [
  'body.form_data.',
  'body.urlencoded.',
  'headers.',
  'params.',
  'path_params.',
  'variables.'
]

function resolveKVPairListTarget(
  rootObj: Record<string, any>,
  fieldPath: string
): { list: any[]; keyName: string; occIdx: number } | null {
  const hashIdx = fieldPath.lastIndexOf('#')
  if (hashIdx === -1) return null
  const occStr = fieldPath.slice(hashIdx + 1)
  const occIdx = Number.parseInt(occStr, 10)
  if (Number.isNaN(occIdx)) return null

  const beforeHash = fieldPath.slice(0, hashIdx)

  if (beforeHash.startsWith('folder_envs.')) {
    const rest = beforeHash.slice('folder_envs.'.length)
    const dotIdx = rest.indexOf('.')
    if (dotIdx === -1) return null
    const envId = rest.slice(0, dotIdx)
    const keyName = rest.slice(dotIdx + 1)
    if (!rootObj.folder_envs || typeof rootObj.folder_envs !== 'object') {
      rootObj.folder_envs = {}
    }
    if (!Array.isArray(rootObj.folder_envs[envId])) {
      rootObj.folder_envs[envId] = []
    }
    return { list: rootObj.folder_envs[envId], keyName, occIdx }
  }

  for (const prefix of kvListPrefixes) {
    if (beforeHash.startsWith(prefix)) {
      const keyName = beforeHash.slice(prefix.length)
      const pathParts = prefix.slice(0, -1).split('.')
      let curr: Record<string, any> = rootObj
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i]
        if (!curr[part] || typeof curr[part] !== 'object') {
          curr[part] = {}
        }
        curr = curr[part]
      }
      const lastPart = pathParts[pathParts.length - 1]
      if (!Array.isArray(curr[lastPart])) {
        curr[lastPart] = []
      }
      return { list: curr[lastPart], keyName, occIdx }
    }
  }

  return null
}

function applyFieldToMergedObject(
  mergedObj: Record<string, any>,
  field: model.GitFieldConflict,
  side: 'ours' | 'theirs'
) {
  const chosenVal = cloneDeep(side === 'ours' ? field.ours_value : field.theirs_value)
  const fieldPath = field.field_path

  // Case 1: Deep JSON body key (body.content.<subPath>)
  if (fieldPath.startsWith('body.content.')) {
    const subPath = fieldPath.slice('body.content.'.length)
    if (!mergedObj.body || typeof mergedObj.body !== 'object') {
      mergedObj.body = { type: 'json', content: '{}' }
    }
    let contentObj: Record<string, any> = {}
    if (typeof mergedObj.body.content === 'string' && mergedObj.body.content.trim() !== '') {
      try {
        const parsed = JSON.parse(mergedObj.body.content)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          contentObj = parsed
        }
      } catch {
        contentObj = {}
      }
    }
    const parts = subPath.split('.')
    let curr: Record<string, any> = contentObj
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (!curr[p] || typeof curr[p] !== 'object' || Array.isArray(curr[p])) {
        curr[p] = {}
      }
      curr = curr[p]
    }
    const lastKey = parts[parts.length - 1]
    if (chosenVal === null || chosenVal === undefined) {
      delete curr[lastKey]
    } else {
      curr[lastKey] = chosenVal
    }
    mergedObj.body.content = JSON.stringify(contentObj, null, 2)
    return
  }

  // Case 2: KVPair item (<listPrefix>.<Key>#<occIdx>)
  const kvTarget = resolveKVPairListTarget(mergedObj, fieldPath)
  if (kvTarget) {
    const { list, keyName, occIdx } = kvTarget
    let seen = 0
    let foundIdx = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].key === keyName) {
        if (seen === occIdx) {
          foundIdx = i
          break
        }
        seen++
      }
    }
    if (chosenVal === null || chosenVal === undefined) {
      if (foundIdx !== -1) {
        list[foundIdx] = { __deleted_kv__: true, key: keyName }
      }
    } else {
      if (foundIdx !== -1) {
        list[foundIdx] = chosenVal
      } else {
        list.push(chosenVal)
      }
    }
    return
  }

  // Case 3: Standard dot-separated path
  const parts = fieldPath.split('.')
  let curr: Record<string, any> = mergedObj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!curr[p] || typeof curr[p] !== 'object' || Array.isArray(curr[p])) {
      curr[p] = {}
    }
    curr = curr[p]
  }
  const lastKey = parts[parts.length - 1]
  if (chosenVal === null || chosenVal === undefined) {
    delete curr[lastKey]
  } else {
    curr[lastKey] = chosenVal
  }
}

function buildFinalMergedObject(c: model.GitFileConflict): any {
  const state = resolutionMap.value[c.file_path]
  if (c.entity_type === 'raw' || c.fields?.[0]?.field_path === '__raw__') {
    if (isDeleteConflict(c)) {
      if (state?.deleteChoice === 'delete') {
        return { __deleted__: true }
      }
      return (c.fields?.[0]?.ours_value ?? c.fields?.[0]?.theirs_value ?? '') as any
    }
    return (
      state?.fieldChoices['__raw__'] === 'theirs'
        ? c.fields?.[0]?.theirs_value
        : c.fields?.[0]?.ours_value
    ) as any
  }

  if (isDeleteConflict(c)) {
    if (state?.deleteChoice === 'delete') {
      return { __deleted__: true }
    }
    const baseKeep = c.merged_preview || c.ours_data || c.theirs_data || {}
    return cloneDeep(baseKeep)
  }

  const mergedObj = cloneDeep(c.merged_preview || c.ours_data || c.theirs_data || {})
  const touchedKVLists = new Set<any[]>()

  // Pre-seed occurrence placeholders for KVPair conflicts where Ours deleted the item (ours_value == null)
  // or earlier occurrences were omitted from merged_preview so occurrence indices never shift.
  for (const field of c.fields || []) {
    const kvTarget = resolveKVPairListTarget(mergedObj, field.field_path)
    if (!kvTarget) continue
    const { list, keyName, occIdx } = kvTarget
    touchedKVLists.add(list)

    if (field.ours_value === null || field.ours_value === undefined) {
      let seen = 0
      let insertAt = -1
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].key === keyName) {
          if (seen === occIdx) {
            insertAt = i
            break
          }
          seen++
        }
      }
      const placeholder = { __kv_placeholder__: true, key: keyName }
      if (insertAt !== -1) {
        list.splice(insertAt, 0, placeholder)
      } else {
        list.push(placeholder)
      }
    }

    let keyCount = list.filter((item) => item && item.key === keyName).length
    while (keyCount <= occIdx) {
      const firstIdx = list.findIndex((item) => item && item.key === keyName)
      const placeholder = { __kv_placeholder__: true, key: keyName }
      if (firstIdx !== -1) {
        list.splice(firstIdx, 0, placeholder)
      } else {
        list.push(placeholder)
      }
      keyCount++
    }
  }

  for (const field of c.fields || []) {
    const choice = state?.fieldChoices[field.field_path]
    if (choice) {
      applyFieldToMergedObject(mergedObj, field, choice)
    }
  }

  for (const list of touchedKVLists) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && (list[i].__deleted_kv__ || list[i].__kv_placeholder__)) {
        list.splice(i, 1)
      }
    }
  }

  return mergedObj
}

function formatConflictValue(val: any): string {
  if (val === null || val === undefined) {
    return 'Đã xoá (Không tồn tại)'
  }
  if (typeof val === 'object' && !Array.isArray(val) && 'key' in val && 'value' in val) {
    const enabledBadge = val.enabled === false ? ' [Đang tắt / disabled]' : ''
    const desc = val.description ? ` // ${val.description}` : ''
    return `${val.key}: ${val.value}${enabledBadge}${desc}`
  }
  if (typeof val === 'string') {
    return val
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val)
  }
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

function entityTypeBadge(entityType: string): { label: string; classes: string } {
  switch (entityType) {
    case 'request':
      return { label: 'Request', classes: 'bg-blue-500/20 text-blue-300 border-blue-500/40' }
    case 'folder':
      return { label: 'Folder', classes: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
    case 'environment':
      return { label: 'Environment', classes: 'bg-purple-500/20 text-purple-300 border-purple-500/40' }
    default:
      return { label: 'Collection', classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
  }
}

async function onSubmitResolve() {
  if (!allResolved.value) return
  const payload: Record<string, any> = {}
  for (const c of conflicts.value) {
    payload[c.file_path] = buildFinalMergedObject(c)
  }
  await collectionStore.resolveGitConflicts(payload)
}

async function onAbortMerge() {
  await collectionStore.abortGitMerge()
}

function closeModal() {
  uiStore.gitConflictModalOpen = false
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.gitConflictModalOpen) {
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
</script>

<template>
  <div
    v-if="uiStore.gitConflictModalOpen"
    data-test="git-conflict-resolver-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Giải quyết xung đột Git (Visual Conflict Resolver)"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
  >
    <div class="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-lg bg-surface-overlay border border-border-default shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-border-default bg-surface-base">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold text-text-primary m-0">
            Giải quyết xung đột Git (Visual Conflict Resolver)
          </h2>
          <span
            data-test="git-conflict-progress-badge"
            class="px-2.5 py-0.5 rounded-full text-xs font-medium border"
            :class="
              allResolved
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                : 'bg-amber-950/60 text-amber-300 border-amber-500/50'
            "
          >
            Đã xử lý {{ resolvedFilesCount }}/{{ conflicts.length }} file
          </span>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button
            v-if="conflicts.length > 0"
            type="button"
            data-test="pick-all-files-ours-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-2.5 py-1 rounded bg-surface-raised border border-border-default hover:bg-surface-hover text-xs font-medium text-text-primary disabled:opacity-50 cursor-pointer"
            @click="pickAllFiles('ours')"
          >
            Chọn toàn bộ Local (Tất cả file)
          </button>
          <button
            v-if="conflicts.length > 0"
            type="button"
            data-test="pick-all-files-theirs-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-2.5 py-1 rounded bg-surface-raised border border-border-default hover:bg-surface-hover text-xs font-medium text-text-primary disabled:opacity-50 cursor-pointer"
            @click="pickAllFiles('theirs')"
          >
            Chọn toàn bộ Remote (Tất cả file)
          </button>
          <button
            type="button"
            data-test="git-abort-merge-btn"
            :disabled="collectionStore.gitSyncLoading"
            class="px-2.5 py-1 rounded bg-red-950/60 border border-red-500/50 hover:bg-red-900/60 text-xs font-semibold text-red-200 disabled:opacity-50 cursor-pointer"
            @click="onAbortMerge"
          >
            Huỷ merge (Rollback)
          </button>
          <button
            type="button"
            data-test="close-conflict-resolver-btn"
            class="text-text-muted hover:text-text-primary p-1 rounded cursor-pointer"
            aria-label="Đóng"
            @click="closeModal"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Body -->
      <div v-if="conflicts.length > 0" class="flex-1 flex min-h-0 overflow-hidden">
        <!-- Left Sidebar: Conflicted Files List -->
        <div class="w-64 shrink-0 border-r border-border-default bg-surface-base overflow-y-auto p-2 space-y-1">
          <div class="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Danh sách file xung đột ({{ conflicts.length }})
          </div>
          <button
            v-for="(c, idx) in conflicts"
            :key="c.file_path"
            type="button"
            :data-test="'conflict-file-item-' + idx"
            class="w-full text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer space-y-1"
            :class="
              idx === selectedFileIndex
                ? 'bg-surface-raised border-brand-primary text-text-primary'
                : 'bg-transparent border-transparent hover:bg-surface-hover text-text-secondary'
            "
            @click="selectedFileIndex = idx"
          >
            <div class="flex items-center justify-between gap-1.5">
              <span
                class="px-1.5 py-0.2 rounded text-[10px] font-semibold border shrink-0"
                :class="entityTypeBadge(c.entity_type).classes"
              >
                {{ entityTypeBadge(c.entity_type).label }}
              </span>
              <span
                class="text-[11px] font-medium shrink-0"
                :class="isFileResolved(c) ? 'text-emerald-400' : 'text-amber-400'"
              >
                <template v-if="isFileResolved(c)">✓ Đã chọn</template>
                <template v-else>Còn {{ getUnresolvedFieldCount(c) }} trường</template>
              </span>
            </div>
            <div class="text-xs font-semibold text-text-primary truncate">
              {{ c.entity_name || c.file_path }}
            </div>
            <div class="text-[11px] font-mono text-text-muted truncate">
              {{ c.file_path }}
            </div>
          </button>
        </div>

        <!-- Right Pane: 2-Column Diff Resolver for Active File -->
        <div v-if="activeConflict" class="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 space-y-4">
          <!-- File Header & Per-File Quick Actions -->
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-default">
            <div>
              <div class="flex items-center gap-2">
                <span
                  class="px-2 py-0.5 rounded text-xs font-semibold border"
                  :class="entityTypeBadge(activeConflict.entity_type).classes"
                >
                  {{ entityTypeBadge(activeConflict.entity_type).label }}
                </span>
                <h3 class="text-sm font-semibold text-text-primary m-0">
                  {{ activeConflict.entity_name || activeConflict.file_path }}
                </h3>
              </div>
              <p class="text-xs font-mono text-text-muted mt-0.5 mb-0">
                {{ activeConflict.file_path }}
              </p>
            </div>
          </div>

          <!-- 2-Column Header -->
          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center justify-between px-3 py-2 rounded-md bg-blue-950/30 border border-blue-500/40">
              <span class="text-xs font-semibold text-blue-300">
                Bản của bạn (Local)
              </span>
              <button
                type="button"
                data-test="pick-all-ours-btn"
                class="px-2.5 py-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                @click="pickAllForFile(activeConflict, 'ours')"
              >
                Chọn toàn bộ bản Local
              </button>
            </div>
            <div class="flex items-center justify-between px-3 py-2 rounded-md bg-purple-950/30 border border-purple-500/40">
              <span class="text-xs font-semibold text-purple-300">
                Bản từ xa (Remote)
              </span>
              <button
                type="button"
                data-test="pick-all-theirs-btn"
                class="px-2.5 py-1 rounded bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold cursor-pointer"
                @click="pickAllForFile(activeConflict, 'theirs')"
              >
                Chọn toàn bộ bản Remote
              </button>
            </div>
          </div>

          <!-- Case A: Delete vs Edit Conflict -->
          <div
            v-if="isDeleteConflict(activeConflict)"
            data-test="delete-edit-conflict-panel"
            class="p-4 rounded-lg bg-amber-950/30 border border-amber-500/50 space-y-4"
          >
            <div class="space-y-1">
              <h4 class="text-sm font-semibold text-amber-300 m-0">
                ⚠️ Xung đột Xoá vs. Chỉnh sửa file
              </h4>
              <p class="text-xs text-amber-100/90 m-0">
                <template v-if="activeConflict.conflict_type === 'delete_edit'">
                  Bạn đã <strong>xoá</strong> file này ở Local, nhưng trên Remote file này vừa được <strong>chỉnh sửa</strong>.
                </template>
                <template v-else>
                  Bạn đã <strong>chỉnh sửa</strong> file này ở Local, nhưng trên Remote file này đã bị <strong>xoá</strong>.
                </template>
                Vui lòng chọn giữ lại bản chỉnh sửa hoặc xác nhận xoá vĩnh viễn file này khỏi Collection:
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <button
                type="button"
                data-test="resolve-keep-file-btn"
                class="p-3 rounded-md border text-left transition-all cursor-pointer space-y-1"
                :class="
                  getDeleteChoice(activeConflict.file_path) === 'keep'
                    ? 'bg-emerald-950/50 border-emerald-400 ring-2 ring-emerald-500/40 text-emerald-200'
                    : 'bg-surface-base border-border-default hover:border-emerald-500/50 text-text-primary'
                "
                @click="pickDeleteResolution(activeConflict.file_path, 'keep')"
              >
                <div class="text-xs font-semibold flex items-center justify-between">
                  <span>Giữ lại file (Bản chỉnh sửa)</span>
                  <span v-if="getDeleteChoice(activeConflict.file_path) === 'keep'" class="text-emerald-400">✓ Đã chọn</span>
                </div>
                <p class="text-[11px] text-text-muted m-0">
                  Khôi phục và lưu nội dung chỉnh sửa của file vào Collection.
                </p>
              </button>

              <button
                type="button"
                data-test="resolve-delete-file-btn"
                class="p-3 rounded-md border text-left transition-all cursor-pointer space-y-1"
                :class="
                  getDeleteChoice(activeConflict.file_path) === 'delete'
                    ? 'bg-red-950/50 border-red-400 ring-2 ring-red-500/40 text-red-200'
                    : 'bg-surface-base border-border-default hover:border-red-500/50 text-text-primary'
                "
                @click="pickDeleteResolution(activeConflict.file_path, 'delete')"
              >
                <div class="text-xs font-semibold flex items-center justify-between">
                  <span>Xác nhận xoá file</span>
                  <span v-if="getDeleteChoice(activeConflict.file_path) === 'delete'" class="text-red-400">✓ Đã chọn</span>
                </div>
                <p class="text-[11px] text-text-muted m-0">
                  Xoá file này khỏi thư mục Collection và Git index.
                </p>
              </button>
            </div>
          </div>

          <!-- Case B: Field-by-Field Conflicts -->
          <div v-else class="space-y-3">
            <div
              v-for="(field, index) in activeConflict.fields"
              :key="field.field_path"
              class="p-3 rounded-lg bg-surface-base border border-border-default space-y-2"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-text-primary">
                    {{ field.label }}
                  </span>
                  <span class="text-[11px] font-mono text-text-muted">
                    ({{ field.field_path }})
                  </span>
                </div>
                <span
                  v-if="field.base_value !== undefined && field.base_value !== null"
                  class="text-[11px] font-mono text-text-muted truncate max-w-xs"
                  :title="formatConflictValue(field.base_value)"
                >
                  Gốc: {{ formatConflictValue(field.base_value) }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <!-- Local (OURS) Card -->
                <button
                  type="button"
                  :data-test="'pick-field-ours-' + index"
                  class="p-2.5 rounded-md border text-left font-mono text-xs transition-all cursor-pointer flex flex-col justify-between gap-2"
                  :class="
                    getFieldChoice(activeConflict.file_path, field.field_path) === 'ours'
                      ? 'bg-blue-950/50 border-blue-400 ring-2 ring-blue-500/40 text-blue-100'
                      : 'bg-surface-input border-border-default hover:border-blue-500/50 text-text-primary'
                  "
                  @click="pickField(activeConflict.file_path, field.field_path, 'ours')"
                >
                  <pre class="whitespace-pre-wrap break-all m-0 font-mono text-xs">{{ formatConflictValue(field.ours_value) }}</pre>
                  <div class="flex items-center justify-between text-[11px] pt-1 border-t border-border-default/60">
                    <span class="text-blue-300 font-sans font-medium">Bản Local</span>
                    <span
                      v-if="getFieldChoice(activeConflict.file_path, field.field_path) === 'ours'"
                      class="text-emerald-400 font-sans font-semibold"
                    >
                      ✓ Đã chọn
                    </span>
                    <span v-else class="text-text-muted font-sans">Click để chọn</span>
                  </div>
                </button>

                <!-- Remote (THEIRS) Card -->
                <button
                  type="button"
                  :data-test="'pick-field-theirs-' + index"
                  class="p-2.5 rounded-md border text-left font-mono text-xs transition-all cursor-pointer flex flex-col justify-between gap-2"
                  :class="
                    getFieldChoice(activeConflict.file_path, field.field_path) === 'theirs'
                      ? 'bg-purple-950/50 border-purple-400 ring-2 ring-purple-500/40 text-purple-100'
                      : 'bg-surface-input border-border-default hover:border-purple-500/50 text-text-primary'
                  "
                  @click="pickField(activeConflict.file_path, field.field_path, 'theirs')"
                >
                  <pre class="whitespace-pre-wrap break-all m-0 font-mono text-xs">{{ formatConflictValue(field.theirs_value) }}</pre>
                  <div class="flex items-center justify-between text-[11px] pt-1 border-t border-border-default/60">
                    <span class="text-purple-300 font-sans font-medium">Bản Remote</span>
                    <span
                      v-if="getFieldChoice(activeConflict.file_path, field.field_path) === 'theirs'"
                      class="text-emerald-400 font-sans font-semibold"
                    >
                      ✓ Đã chọn
                    </span>
                    <span v-else class="text-text-muted font-sans">Click để chọn</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State if no structured conflicts -->
      <div v-else class="p-8 text-center text-xs text-text-muted">
        Không có xung đột cấp trường nào cần giải quyết.
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-5 py-3.5 border-t border-border-default bg-surface-base gap-3">
        <button
          type="button"
          data-test="git-abort-merge-footer-btn"
          :disabled="collectionStore.gitSyncLoading"
          class="px-3 py-1.5 rounded bg-red-950/60 border border-red-500/50 hover:bg-red-900/60 text-xs font-semibold text-red-200 disabled:opacity-50 cursor-pointer"
          @click="onAbortMerge"
        >
          Huỷ merge
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            data-test="git-resolve-submit-btn"
            :disabled="!allResolved || collectionStore.gitSyncLoading"
            class="px-4 py-1.5 rounded bg-brand-primary text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            @click="onSubmitResolve"
          >
            Xác nhận &amp; Hoàn tất Đồng bộ
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
