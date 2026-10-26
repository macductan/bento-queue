<script lang="ts" setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { getInheritedHeaders, getDefaultHeaders } from '@/utils/headers'
import { resolveEffectiveAuth, getAuthArtifacts } from '@/utils/auth'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'
import { resolveVariables } from '@/utils/variables'
import CustomSelect from './CustomSelect.vue'

const props = defineProps<{
  defaultHeadersCount?: number
}>()

const uiStore = useUiStore()
const requestStore = useRequestStore()
const collectionStore = useCollectionStore()
const envStore = useEnvironmentStore()

const req = computed(() => requestStore.current)

const paramsCount = computed(() => {
  const queryLen = req.value?.params
    ? req.value.params.filter(p => p && p.enabled !== false && typeof p.key === 'string' && p.key.trim() !== '').length
    : 0
  const pathLen = req.value?.path_params
    ? req.value.path_params.filter(p => p && p.enabled !== false && typeof p.key === 'string' && p.key.trim() !== '').length
    : 0
  return queryLen + pathLen
})

const computedDefaultHeadersCount = computed(() => {
  if (typeof props.defaultHeadersCount === 'number') {
    return props.defaultHeadersCount
  }
  if (!req.value) return 0
  const full = collectionStore.findFolderPath(collectionStore.tree, req.value.id) || []
  const pathNodes = full.filter(n => n.type === 'folder')
  const effectiveVars = resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: pathNodes,
    activeEnvId: envStore.activeEnvId
  })
  const inherited = getInheritedHeaders(pathNodes).map(h => ({
    ...h,
    rawValue: h.value || '',
    value: resolveVariables(h.value || '', effectiveVars)
  }))
  const { auth: effectiveAuth, sourceNode } = resolveEffectiveAuth(req.value.auth, pathNodes, {
    activeEnvId: envStore.activeEnvId,
    requestAuthEnvs: req.value.auth_envs,
    collection: collectionStore.activeCollection as any
  })
  const { headers: authHeaders } = getAuthArtifacts(effectiveAuth, effectiveVars)
  const isInherited = !!sourceNode
  const folderIdx = sourceNode ? pathNodes.findIndex(f => f.id === sourceNode.id) : -1
  const authFolderLevel = folderIdx !== -1 ? folderIdx + 1 : 1
  const taggedAuthHeaders = authHeaders.map(h => ({
    ...h,
    authSource: (isInherited && sourceNode ? 'folder' : 'request') as 'folder' | 'request',
    folderLevel: isInherited && sourceNode ? authFolderLevel : undefined,
    folderName: isInherited && sourceNode ? sourceNode.name : undefined
  }))
  const defItems = getDefaultHeaders(req.value, inherited, taggedAuthHeaders)
  return defItems.filter(h => !h.disabled && !h.overridden && (h as any).enabled !== false).length
})

const headersCount = computed(() => {
  const customLen = req.value?.headers
    ? req.value.headers.filter(h => h && h.enabled !== false && !h._isAuto && typeof h.key === 'string' && h.key.trim() !== '').length
    : 0
  return customLen + computedDefaultHeadersCount.value
})

const authBadge = computed(() => {
  if (!req.value) return ''
  const envAuth = envStore.activeEnvId ? req.value.auth_envs?.[envStore.activeEnvId] : undefined
  if (envAuth?.type && envAuth.type !== 'inherit') {
    return envAuth.type
  }
  return req.value.auth?.type || 'inherit'
})

const bodyBadge = computed(() => {
  if (!req.value) return ''
  return req.value.body?.type || 'none'
})

const hasScripts = computed(() => {
  const s = req.value?.scripts
  if (!s) return false
  return Boolean(s.pre_request?.trim() || s.post_response?.trim())
})

const tabs = computed(() => [
  { id: 'params', label: 'Params' },
  { id: 'auth', label: 'Auth' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'curl', label: 'cURL' }
])

const activeTab = computed({
  get: () => uiStore.activeRequestTab,
  set: (val) => uiStore.activeRequestTab = val
})

const bodyType = computed(() => req.value?.body?.type || 'none')

const bodyTypeOptions = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'formdata', label: 'multipart/form-data' },
  { value: 'text', label: 'Text' }
]

const onBodyTypeSelect = (val: string) => {
  requestStore.setBodyType(val as any)
  if (uiStore.activeRequestTab !== 'body') {
    uiStore.activeRequestTab = 'body'
  }
}
</script>

<template>
  <div class="flex items-center justify-between border-b border-border-default">
    <div class="flex items-center" role="tablist" aria-label="Request tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`panel-${tab.id}`"
        :id="`tab-${tab.id}`"
        :data-test="`request-tab-${tab.id}`"
        @click="activeTab = tab.id as 'params' | 'auth' | 'headers' | 'body' | 'scripts' | 'curl'"
        class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm cursor-pointer transition-colors"
        :class="[
          activeTab === tab.id 
            ? 'border-brand-primary text-brand-primary' 
            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
        ]"
      >
        {{ tab.label }}
        <span 
          v-if="tab.id === 'params' && paramsCount > 0"
          data-test="tab-params-badge"
          class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
          :class="activeTab === tab.id ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
        >
          {{ paramsCount }}
        </span>
        <span
          v-else-if="tab.id === 'auth' && authBadge"
          data-test="tab-auth-badge"
          class="px-1.5 py-0.5 rounded text-[10px] font-mono"
          :class="authBadge === 'none' ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-500/15 text-emerald-400'"
        >
          {{ authBadge }}
        </span>
        <span 
          v-else-if="tab.id === 'headers' && headersCount > 0"
          data-test="tab-headers-badge"
          class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
          :class="activeTab === tab.id ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
        >
          {{ headersCount }}
        </span>
        <span
          v-else-if="tab.id === 'body' && bodyBadge"
          data-test="tab-body-badge"
          class="px-1.5 py-0.5 rounded text-[10px] font-mono"
          :class="bodyBadge === 'none' ? 'bg-zinc-800 text-zinc-500' : 'bg-indigo-500/15 text-indigo-400'"
        >
          {{ bodyBadge }}
        </span>
        <span
          v-else-if="tab.id === 'scripts' && hasScripts"
          data-test="tab-scripts-badge"
          class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
        ></span>
      </button>
    </div>

    <!-- Inline Body Type Dropdown -->
    <div class="ml-auto pr-2 flex items-center gap-2 shrink-0">
      <label for="body-type-select" class="text-[11px] font-medium text-text-muted select-none">
        Body:
      </label>
      <CustomSelect
        id="body-type-select"
        data-test="body-type-select"
        aria-label="Body type"
        :model-value="bodyType"
        :options="bodyTypeOptions"
        size="xs"
        align="right"
        @update:model-value="onBodyTypeSelect"
      />
    </div>
  </div>
</template>
