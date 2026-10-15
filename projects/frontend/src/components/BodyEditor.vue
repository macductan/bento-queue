<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRequestStore, type KVPair } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import VariableHighlighter from '@/components/VariableHighlighter.vue'
import KvpEditor from '@/components/KvpEditor.vue'
import { recordInputSnapshot } from '@/utils/inputUndo'
import { validateJsonWithPlaceholders, prettifyJsonWithPlaceholders } from '@/utils/jsonEditor'

const requestStore = useRequestStore()
const uiStore = useUiStore()

const bodyType = computed(() => requestStore.current?.body?.type || 'none')
const bodyContent = computed({
  get: () => requestStore.current?.body?.content || '',
  set: (val) => {
    if (requestStore.current && requestStore.current.body) {
      requestStore.current.body.content = val
    }
  }
})

const urlencodedRows = computed<KVPair[]>({
  get: () => {
    if (!requestStore.current?.body) return []
    return Array.isArray(requestStore.current.body.urlencoded) ? requestStore.current.body.urlencoded : []
  },
  set: (val) => {
    if (requestStore.current?.body) {
      requestStore.current.body.urlencoded = val
    }
  }
})

const formDataRows = computed<KVPair[]>({
  get: () => {
    if (!requestStore.current?.body) return []
    return Array.isArray(requestStore.current.body.form_data) ? requestStore.current.body.form_data : []
  },
  set: (val) => {
    if (requestStore.current?.body) {
      requestStore.current.body.form_data = val
    }
  }
})

const jsonValidation = computed(() => {
  if (bodyType.value !== 'json') {
    return { valid: true }
  }
  return validateJsonWithPlaceholders(bodyContent.value)
})

const formatJson = () => {
  if (bodyType.value !== 'json' || !bodyContent.value.trim()) return
  const check = validateJsonWithPlaceholders(bodyContent.value)
  if (!check.valid) {
    uiStore.showToast(check.error || 'JSON không hợp lệ, không thể format')
    return
  }
  try {
    if (textareaRef.value) {
      recordInputSnapshot(textareaRef.value)
    }
    const formatted = prettifyJsonWithPlaceholders(bodyContent.value)
    bodyContent.value = formatted
    if (textareaRef.value) {
      textareaRef.value.value = formatted
      recordInputSnapshot(textareaRef.value)
    }
  } catch (err: any) {
    uiStore.showToast(err instanceof Error ? err.message : String(err))
  }
}

const lineNumbers = computed(() => {
  const lines = bodyContent.value.split('\n').length
  return Array.from({ length: lines }, (_, i) => i + 1).join('\n')
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const preRef = ref<HTMLElement | null>(null)
const highlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)

const handleScroll = (e: Event) => {
  if (lineNumbersRef.value) {
    if (preRef.value) { preRef.value.style.transform = `translateY(-${(e.target as HTMLTextAreaElement).scrollTop}px)` }
  }
  highlighterRef.value?.syncScroll(e)
}

const handleTab = (e: KeyboardEvent) => {
  e.preventDefault()
  
  if (!textareaRef.value) return
  const el = textareaRef.value
  recordInputSnapshot(el)
  const start = el.selectionStart
  const end = el.selectionEnd
  const val = el.value

  el.value = val.substring(0, start) + '  ' + val.substring(end)
  el.selectionStart = el.selectionEnd = start + 2
  bodyContent.value = el.value
  recordInputSnapshot(el)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Body content -->
    <div v-if="bodyType === 'none' || !['none', 'json', 'text', 'xml', 'urlencoded', 'formdata'].includes(bodyType)" class="flex-1 p-3 text-text-secondary ui-sm">
      Request này không có body.
    </div>

    <div v-else-if="bodyType === 'urlencoded'" data-test="body-urlencoded-editor" class="flex-1 p-3 pt-0">
      <KvpEditor v-model="urlencodedRows" />
    </div>

    <div v-else-if="bodyType === 'formdata'" data-test="body-formdata-editor" class="flex-1 p-3 pt-0">
      <KvpEditor v-model="formDataRows" />
    </div>
    
    <div v-else class="flex-1 p-3 pt-0 flex flex-col min-h-0 gap-2">
      <!-- Smart JSON Toolbar -->
      <div v-if="bodyType === 'json'" class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-xs">
          <span
            v-if="jsonValidation.valid"
            data-test="json-valid-badge"
            class="inline-flex items-center gap-1 text-emerald-400 font-medium"
          >
            ✓ JSON hợp lệ
          </span>
          <span
            v-else
            class="inline-flex items-center gap-1 text-red-400 font-medium"
          >
            ⚠ JSON lỗi cú pháp (dòng {{ jsonValidation.line }}, cột {{ jsonValidation.column }})
          </span>
        </div>
        <button
          type="button"
          data-test="prettify-json-btn"
          title="Format / Prettify JSON"
          class="px-2.5 py-1 rounded bg-surface-overlay border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors"
          @click="formatJson"
        >
          Format JSON
        </button>
      </div>

      <!-- JSON Syntax Error Banner -->
      <div
        v-if="bodyType === 'json' && !jsonValidation.valid"
        data-test="json-error-banner"
        role="alert"
        class="px-3 py-1.5 rounded bg-red-950/50 border border-red-500/50 text-red-300 text-xs font-mono"
      >
        {{ jsonValidation.error }}
      </div>

      <div class="flex-1 flex flex-row bg-surface-input border rounded-md overflow-hidden min-h-0"
           :class="bodyType === 'json' && !jsonValidation.valid ? 'border-red-500/60' : 'border-default'">
        <!-- Line numbers -->
        <div 
          ref="lineNumbersRef"
          class="w-[40px] flex-shrink-0 bg-surface-raised border-r border-default text-text-muted mono-base text-right pr-2 pt-2 pb-0 select-none overflow-hidden"
        >
          <pre ref="preRef" class="mono-base m-0" style="margin: 0; line-height: 21px; font-size: 13px;">{{ lineNumbers }}</pre>
        </div>
        <!-- Editor -->
        <VariableHighlighter
          ref="highlighterRef"
          :value="bodyContent"
          :wrap="false"
          :syntax="bodyType === 'json' ? 'json' : bodyType === 'xml' ? 'xml' : 'plain'"
          overlay-class="p-2 pb-32 mono-base w-full h-full" style="line-height: 21px; font-size: 13px;"
          class="flex-1 w-full h-full min-w-0"
        >
          <textarea 
            ref="textareaRef"
            v-model="bodyContent"
            @input="e => { bodyContent = (e.target as HTMLTextAreaElement).value }"
            @scroll="handleScroll"
            @keydown.tab="handleTab"
            class="w-full h-full bg-transparent border-none outline-none resize-none p-2 pb-32 mono-base text-transparent caret-text-primary whitespace-pre overflow-auto" style="line-height: 21px; font-size: 13px;"
            spellcheck="false"
            autocomplete="off"
            wrap="off"
          ></textarea>
        </VariableHighlighter>
      </div>
    </div>
  </div>
</template>
