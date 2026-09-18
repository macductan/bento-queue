<script lang="ts" setup>
import { ref, computed, watch } from "vue"
import { useResponseStore } from '@/stores/responseStore'
import EmptyStateResponse from './EmptyStateResponse.vue'
import ResponseMetaBar from './ResponseMetaBar.vue'
import JsonViewer from './JsonViewer.vue'
import ResponseErrorState from './ResponseErrorState.vue'
import HeadersTable from './HeadersTable.vue'
import { formatSize } from '@/utils/responseMeta'
import { flattenHeaders } from '@/utils/responseHeaders'
import { isJsonContentType, tryParseJson, formatJsonText } from '@/utils/jsonHighlight'
import { ClipboardSetText } from '../../wailsjs/runtime/runtime'
import { useUiStore } from '@/stores/uiStore'

const responseStore = useResponseStore()
const uiStore = useUiStore()
const activeTab = ref<'body' | 'headers'>('body')

const headersCount = computed(() => flattenHeaders(responseStore.response?.headers).length)

const isEmptyResponse = computed(() => {
  const res = responseStore.response
  return res && (res.status_code === 204 || res.size_bytes === 0)
})


const mode = ref<'pretty' | 'raw'>('raw')
const copyStatus = ref<'idle' | 'copied'>('idle')

const PRETTY_DEFAULT_MAX_BYTES = 15 * 1024 * 1024
const isOversized = computed(() => (responseStore.response?.size_bytes || 0) > PRETTY_DEFAULT_MAX_BYTES)
const isValidJson = computed(() => tryParseJson(responseStore.response?.body || ''))
const canBePretty = computed(() => isValidJson.value)

watch(() => responseStore.response, (newRes: any) => {
  if (newRes && !isOversized.value && isJsonContentType(newRes.headers) && isValidJson.value) {
    mode.value = 'pretty'
  } else {
    mode.value = 'raw'
  }
}, { immediate: true })

const copyBody = async () => {
  const res = responseStore.response
  if (!res) return
  try {
    const textToCopy = mode.value === 'pretty' ? formatJsonText(res.body) : res.body
    const success = await ClipboardSetText(textToCopy)
    if (success) {
      copyStatus.value = 'copied'
      uiStore.showToast('Đã sao chép', 2000)
      setTimeout(() => { copyStatus.value = 'idle' }, 1500)
    } else {
      uiStore.showToast('Không thể sao chép')
    }
  } catch (err) {
    uiStore.showToast('Không thể sao chép')
  }
}

const isBinaryResponse = computed(() => {
  const res = responseStore.response
  return res && res.is_binary
})

const handleBodyKeydown = async (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    // Let user copy their selection if they have highlighted text
    const selection = window.getSelection()?.toString()
    if (selection && selection.length > 0) return

    const body = responseStore.response?.body
    if (body) {
      e.preventDefault()
      try {
        const success = await ClipboardSetText(body)
        if (success) {
          uiStore.showToast('Đã sao chép')
        }
      } catch (err) {
        // ignore
      }
    }
  }
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div v-if="responseStore.loading" class="flex-1 flex flex-col items-center justify-center gap-3 p-4" aria-live="polite">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      <div class="text-text-secondary text-sm">Đang tải...</div>
    </div>
    
    <ResponseErrorState v-else-if="responseStore.error" :error="responseStore.error" />
    
    <div v-else-if="responseStore.response" class="flex-1 flex flex-col overflow-hidden">
      
      <div class="flex items-center justify-between border-b border-border-default shrink-0 h-10 pr-4">
        <!-- Left: Tabs + Format -->
        <div class="flex items-center h-full">
          <div class="flex h-full" role="tablist" aria-label="Response tabs">
            <button
              role="tab"
              :aria-selected="activeTab === 'body'"
              aria-controls="panel-body"
              id="tab-body"
              @click="activeTab = 'body'"
              class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
              :class="[
                activeTab === 'body' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              ]"
            >
              Body
            </button>
            <button
              role="tab"
              :aria-selected="activeTab === 'headers'"
              aria-controls="panel-headers"
              id="tab-headers"
              @click="activeTab = 'headers'"
              class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
              :class="[
                activeTab === 'headers' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              ]"
            >
              Headers
              <span 
                v-if="headersCount > 0" 
                class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
                :class="activeTab === 'headers' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-raised text-text-secondary'"
              >
                {{ headersCount }}
              </span>
            </button>
          </div>
          
          <div v-if="activeTab === 'body' && !isEmptyResponse && !isBinaryResponse" class="ml-4 flex items-center">
            <div class="flex bg-surface-base border border-border-default rounded-md overflow-hidden" role="radiogroup" aria-label="View mode">
              <button 
                role="radio" 
                :aria-checked="mode === 'pretty'"
                @click="canBePretty && (mode = 'pretty')"
                class="ui-xs px-[10px] py-[4px] min-h-[28px] min-w-[60px] transition-colors outline-none"
                :class="[
                  mode === 'pretty' ? 'bg-surface-overlay text-white' : 'text-text-secondary hover:text-text-primary',
                  !canBePretty ? 'opacity-50 cursor-not-allowed' : ''
                ]"
                :disabled="!canBePretty"
                :title="!isValidJson ? 'Không phải JSON hợp lệ' : ''"
              >
                Pretty
              </button>
              <div class="w-px bg-border-default"></div>
              <button 
                role="radio" 
                :aria-checked="mode === 'raw'"
                @click="mode = 'raw'"
                class="ui-xs px-[10px] py-[4px] min-h-[28px] min-w-[60px] transition-colors outline-none"
                :class="mode === 'raw' ? 'bg-surface-overlay text-white' : 'text-text-secondary hover:text-text-primary'"
              >
                Raw
              </button>
            </div>
          </div>
        </div>

        <!-- Right: Meta + Copy -->
        <div class="flex items-center gap-4">
          <ResponseMetaBar :response="responseStore.response" />
          
          <button 
            v-if="activeTab === 'body' && !isEmptyResponse && !isBinaryResponse"
            @click="copyBody" 
            class="flex items-center gap-2 ui-sm text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-surface-hover outline-none"
          >
            <svg v-if="copyStatus === 'idle'" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
            </svg>
            <svg v-else class="w-4 h-4 text-status-2xx" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
            </svg>
            Sao chép
          </button>
        </div>
      </div>

      
      <div class="flex-1 flex flex-col min-h-0 relative">
        <div 
          v-show="activeTab === 'body'" 
          class="absolute inset-0 flex flex-col focus:outline-none" 
          id="panel-body" 
          role="tabpanel" 
          aria-labelledby="tab-body"
          tabindex="0"
          @keydown="handleBodyKeydown"
        >
          <div v-if="responseStore.response.truncated" class="mx-4 mt-4 mb-3 p-3 bg-warning-bg border border-warning-border rounded text-warning-text text-sm shrink-0">
            Phản hồi quá lớn và đã bị cắt bớt (tối đa 10MB).
          </div>
          
          <div v-if="isEmptyResponse" class="flex-1 flex items-center justify-center text-text-secondary ui-sm">
            Response không có body.
          </div>
          <div v-else-if="isBinaryResponse" class="flex-1 flex flex-col items-center justify-center text-text-secondary gap-2 p-4">
            <svg class="w-12 h-12 text-text-muted" viewBox="0 0 256 256" fill="currentColor">
              <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>
              <path d="M96,128a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,128Zm0,32a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,160Zm0,32a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H104A8,8,0,0,1,96,192Z" opacity="0.2"/>
            </svg>
            <div class="ui-sm font-medium">Response dạng nhị phân ({{ formatSize(responseStore.response?.size_bytes ?? 0) }}) — không hiển thị nội dung.</div>
          </div>
          <JsonViewer v-else :response="responseStore.response" :mode="mode" />
        </div>
        <div v-show="activeTab === 'headers'" class="absolute inset-0" id="panel-headers" role="tabpanel" aria-labelledby="tab-headers">
          <HeadersTable :headers="responseStore.response.headers" />
        </div>
      </div>
    </div>
    
    <div v-else class="flex-1 p-4">
      <EmptyStateResponse />
    </div>
  </div>
</template>
