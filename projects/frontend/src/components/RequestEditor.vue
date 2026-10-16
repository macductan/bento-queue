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
import ScriptEditor from './ScriptEditor.vue'
import { getInheritedHeaders, getDefaultHeaders, type DefaultHeaderItem } from '@/utils/headers'
import { resolveEffectiveAuth, getAuthArtifacts } from '@/utils/auth'
import { useUiStore } from '@/stores/uiStore'

import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUrlParamsSync } from '@/composables/useUrlParamsSync'
import { useAutoSave } from '@/composables/useAutoSave'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'
import { resolveVariables } from '@/utils/variables'
import { generateCurlCommand } from '@/utils/curl'

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
provide('variableHierarchyFolders', pathNodes)

const resolvedCurlPreview = computed(() => {
  if (!req.value) return ''
  return generateCurlCommand(req.value, {
    vars: effectiveVariables.value,
    pathNodes: pathNodes.value,
    activeEnvId: envStore.activeEnvId,
    collection: collectionStore.activeCollection as any,
    multiline: true
  })
})

const copyPreviewCurl = async () => {
  if (!resolvedCurlPreview.value) return
  let copied = false
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(resolvedCurlPreview.value)
      copied = true
    } catch {
      // fallback below
    }
  }
  if (!copied) {
    try {
      const textArea = document.createElement('textarea')
      textArea.value = resolvedCurlPreview.value
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      copied = document.execCommand('copy')
      document.body.removeChild(textArea)
    } catch {
      copied = false
    }
  }
  if (copied) {
    uiStore.showToast('Đã sao chép cURL vào clipboard')
  } else {
    uiStore.showToast('Không thể sao chép vào clipboard')
  }
}

const defaultHeaders = computed(() => {
  if (!req.value) return []
  const inherited = getInheritedHeaders(pathNodes.value).map(h => ({
    ...h,
    rawValue: h.value || '',
    value: resolveVariables(h.value || '', effectiveVariables.value)
  }))
  const { auth: effectiveAuth, sourceNode } = resolveEffectiveAuth(req.value.auth, pathNodes.value, {
    activeEnvId: envStore.activeEnvId,
    requestAuthEnvs: req.value.auth_envs,
    collection: collectionStore.activeCollection as any
  })
  const { headers: authHeaders } = getAuthArtifacts(effectiveAuth, effectiveVariables.value)

  const isInherited = !!sourceNode
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
      value: item.source === 'auth' ? '' : (item.rawValue ?? item.value ?? ''),
      enabled: false,
      ...(item.source === 'auto' ? { _isAuto: true } : {})
    })
  }
}
</script>

<template>
  <div class="h-full flex flex-col px-3 pt-2 pb-0 overflow-y-auto">
    <div v-if="loading" class="animate-pulse space-y-4">
      <div class="h-8 bg-surface-hover rounded w-1/3"></div>
      <div class="h-10 bg-surface-hover rounded w-full"></div>
      <div class="h-32 bg-surface-hover rounded w-full"></div>
    </div>
    <div v-else-if="req" class="flex-1 flex flex-col min-h-0 space-y-2">
      <!-- Breadcrumb Header with Request Name & Save Status Indicator -->
      <div class="shrink-0 flex items-center justify-between gap-2 min-w-0 py-0.5">
        <div class="flex items-center gap-1.5 text-xs font-medium text-text-muted min-w-0 truncate">
          <template v-for="(part, idx) in requestPath.slice(0, -1)" :key="idx">
            <span class="opacity-80 shrink-0">{{ part }}</span>
            <span class="opacity-40 shrink-0">/</span>
          </template>
          <h1 class="inline-flex items-center gap-1.5 text-xs font-semibold text-text-primary min-w-0 truncate m-0 p-0 leading-none" :title="req.name">
            <span class="truncate">{{ req.name }}</span>
            <span
              v-if="requestStore.saveStatus === 'unsaved'"
              class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0"
              title="Chưa lưu"
              aria-label="Chưa lưu"
            />
          </h1>
        </div>
        <span
          data-test="save-state-indicator"
          role="status"
          aria-live="polite"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-surface-overlay border border-border-default select-none shrink-0"
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
      </div>

      <UrlBar />
      <WarningBanner />

      <!-- Request Tabs and Content -->
      <div class="flex-1 flex flex-col min-h-0">
        <RequestTabs />
        
        <div class="flex-1 flex flex-col min-h-0 overflow-y-auto mt-1.5">
          <div v-show="uiStore.activeRequestTab === 'params'" role="tabpanel" id="panel-params" aria-labelledby="tab-params" class="space-y-5">
            <div class="space-y-2" data-test="query-params-section">
              <div class="flex items-center justify-between px-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Query Params (?key=value)
                </span>
              </div>
              <KvpEditor field="params" />
            </div>

            <div
              v-if="req.path_params && req.path_params.length > 0"
              class="space-y-2 pt-3 border-t border-border-default"
              data-test="path-params-section"
            >
              <div class="flex items-center justify-between px-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-sky-400">
                  Biến Path (:param)
                </span>
                <span class="text-[11px] text-text-muted">
                  Tự động trích xuất từ các tham số <code class="font-mono text-sky-300">:tên_biến</code> trên URL
                </span>
              </div>
              <KvpEditor field="path_params" :readonly-keys="true" key-prefix=":" />
            </div>
          </div>

          <div v-show="uiStore.activeRequestTab === 'auth'" role="tabpanel" id="panel-auth" aria-labelledby="tab-auth">
            <AuthEditor v-model="req.auth" v-model:authEnvs="req.auth_envs" :path-nodes="pathNodes" />
          </div>
          
          <div v-show="uiStore.activeRequestTab === 'headers'" role="tabpanel" id="panel-headers" aria-labelledby="tab-headers">
            <DefaultHeadersTable :items="defaultHeaders" @toggle="toggleDefaultHeader" />
            <KvpEditor field="headers" />
          </div>
          
          <div v-show="uiStore.activeRequestTab === 'body'" role="tabpanel" id="panel-body" aria-labelledby="tab-body" class="flex-1 h-full min-h-0 flex flex-col">
            <BodyEditor />
          </div>

          <div v-show="uiStore.activeRequestTab === 'scripts'" role="tabpanel" id="panel-scripts" aria-labelledby="tab-scripts">
            <ScriptEditor />
          </div>

          <div v-show="uiStore.activeRequestTab === 'curl'" role="tabpanel" id="panel-curl" aria-labelledby="tab-curl" data-test="curl-preview-panel" class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-muted">
                Lệnh cURL đã phân giải đầy đủ biến môi trường, headers kế thừa và thông tin xác thực:
              </span>
              <button
                type="button"
                data-test="copy-preview-curl-btn"
                class="px-2.5 py-1 text-xs font-medium rounded bg-surface-overlay border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover flex items-center gap-1.5 cursor-pointer transition-colors"
                @click="copyPreviewCurl"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Sao chép cURL</span>
              </button>
            </div>
            <pre
              data-test="curl-preview-code"
              class="p-3 rounded-md bg-surface-input border border-border-default font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap break-all select-all"
            ><code>{{ resolvedCurlPreview }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
