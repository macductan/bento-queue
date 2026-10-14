<script lang="ts" setup>
import { computed, provide } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useCollectionStore } from '@/stores/collectionStore'
import UrlBar from './UrlBar.vue'
import RequestTabs from './RequestTabs.vue'
import KvpEditor from './KvpEditor.vue'
import BodyEditor from './BodyEditor.vue'
import WarningBanner from './WarningBanner.vue'
import DefaultHeadersTable from './DefaultHeadersTable.vue'
import AuthEditor from './AuthEditor.vue'
import { getInheritedHeaders, getDefaultHeaders, type DefaultHeaderItem } from '@/utils/headers'
import { resolveEffectiveAuth, getAuthArtifacts } from '@/utils/auth'
import { useUiStore } from '@/stores/uiStore'

import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUrlParamsSync } from '@/composables/useUrlParamsSync'
import { useAutoSave } from '@/composables/useAutoSave'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'

const requestStore = useRequestStore()
const uiStore = useUiStore()
const collectionStore = useCollectionStore()
const envStore = useEnvironmentStore()

const pathNodes = computed(() => {
  if (!req.value) return []
  const full = collectionStore.findFolderPath(collectionStore.tree, req.value.id) || []
  return full.filter(n => n.type === 'folder')
})

const requestPath = computed(() => {
  if (!req.value) return []
  const full = collectionStore.findFolderPath(collectionStore.tree, req.value.id) || []
  return full.map(n => n.name)
})

const req = computed(() => requestStore.current)
const loading = computed(() => requestStore.loading)

useUrlParamsSync(req)
useAutoSave(req)

const effectiveVariables = computed(() => {
  return resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: pathNodes.value,
    activeEnvId: envStore.activeEnvId
  })
})

provide('effectiveVariables', effectiveVariables)

const defaultHeaders = computed(() => {
  if (!req.value) return []
  const inherited = getInheritedHeaders(pathNodes.value)
  const { auth: effectiveAuth, sourceNode } = resolveEffectiveAuth(req.value.auth, pathNodes.value)
  const { headers: authHeaders } = getAuthArtifacts(effectiveAuth, effectiveVariables.value)

  const isInherited = !req.value.auth || !req.value.auth.type || req.value.auth.type === 'inherit'
  const folderIdx = sourceNode ? pathNodes.value.findIndex(f => f.id === sourceNode.id) : -1
  const authFolderLevel = folderIdx !== -1 ? folderIdx + 1 : 1

  const taggedAuthHeaders = authHeaders.map(h => ({
    ...h,
    authSource: (isInherited && sourceNode ? 'folder' : 'request') as 'folder' | 'request',
    folderLevel: isInherited && sourceNode ? authFolderLevel : undefined,
    folderName: isInherited && sourceNode ? sourceNode.name : undefined
  }))

  return getDefaultHeaders(req.value, inherited, taggedAuthHeaders)
})

const toggleDefaultHeader = (item: DefaultHeaderItem) => {
  if (!req.value || item.overridden) return
  if (!req.value.headers) req.value.headers = []

  const lower = item.key.toLowerCase().trim()
  const idx = req.value.headers.findIndex(
    h => h && typeof h.key === 'string' && h.key.trim().toLowerCase() === lower
  )

  if (idx !== -1) {
    if (!req.value.headers[idx].enabled) {
      if (req.value.headers[idx]._isAuto) {
        req.value.headers[idx].enabled = true
      } else {
        req.value.headers.splice(idx, 1)
      }
    } else {
      req.value.headers[idx].enabled = false
    }
  } else {
    // Suppress default header without leaking sensitive auth secrets into request file on disk
    req.value.headers.push({
      key: item.key,
      value: item.source === 'auth' ? '' : (item.value || ''),
      enabled: false,
      ...(item.source === 'auto' ? { _isAuto: true } : {})
    })
  }
}
</script>

<template>
  <div class="h-full flex flex-col p-4 overflow-y-auto">
    <div v-if="loading" class="animate-pulse space-y-4">
      <div class="h-8 bg-surface-hover rounded w-1/3"></div>
      <div class="h-10 bg-surface-hover rounded w-full"></div>
      <div class="h-32 bg-surface-hover rounded w-full"></div>
    </div>
    <div v-else-if="req" class="space-y-6">
      <!-- Name and Breadcrumb -->
      <div>
        <div v-if="requestPath.length > 1" class="flex items-center gap-1.5 text-text-muted text-xs font-medium mb-1.5 opacity-80">
          <template v-for="(part, idx) in requestPath.slice(0, -1)" :key="idx">
            <span>{{ part }}</span>
            <span v-if="idx < requestPath.length - 2" class="opacity-50">/</span>
          </template>
        </div>
        <h1 class="heading-lg m-0 flex items-center gap-3">
          <span>{{ req.name }}</span>
          <span
            data-test="save-state-indicator"
            role="status"
            aria-live="polite"
            class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-surface-overlay border border-border-default select-none"
            :data-status="requestStore.saveStatus"
          >
            <!-- saving -->
            <template v-if="requestStore.saveStatus === 'saving'">
              <svg class="animate-spin w-3 h-3 text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class="text-text-secondary text-xs">Đang lưu...</span>
            </template>

            <!-- unsaved -->
            <template v-else-if="requestStore.saveStatus === 'unsaved'">
              <span class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0" title="Chưa lưu" aria-label="Chưa lưu"></span>
              <span class="text-amber-400 text-xs">Chưa lưu</span>
            </template>

            <!-- error -->
            <template v-else-if="requestStore.saveStatus === 'error'">
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
        </h1>
      </div>

      <UrlBar />
      <WarningBanner />

      <!-- Request Tabs and Content -->
      <div class="flex-1 flex flex-col min-h-0 mt-2">
        <RequestTabs />
        
        <div class="flex-1 overflow-y-auto mt-4 pb-4">
          <div v-show="uiStore.activeRequestTab === 'params'" role="tabpanel" id="panel-params" aria-labelledby="tab-params">
            <KvpEditor field="params" />
          </div>

          <div v-show="uiStore.activeRequestTab === 'auth'" role="tabpanel" id="panel-auth" aria-labelledby="tab-auth">
            <AuthEditor v-model="req.auth" :path-nodes="pathNodes" />
          </div>
          
          <div v-show="uiStore.activeRequestTab === 'headers'" role="tabpanel" id="panel-headers" aria-labelledby="tab-headers">
            <DefaultHeadersTable :items="defaultHeaders" @toggle="toggleDefaultHeader" />
            <KvpEditor field="headers" />
          </div>
          
          <div v-show="uiStore.activeRequestTab === 'body'" role="tabpanel" id="panel-body" aria-labelledby="tab-body" class="h-full flex flex-col">
            <BodyEditor />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
