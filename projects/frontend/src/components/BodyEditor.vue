<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRequestStore, type KVPair } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import VariableHighlighter from '@/components/VariableHighlighter.vue'
import KvpEditor from '@/components/KvpEditor.vue'
import { recordInputSnapshot } from '@/utils/inputUndo'
import {
  validateJsonWithPlaceholders,
  prettifyJsonWithPlaceholders,
  normalizeSmartChars
} from '@/utils/jsonEditor'
import {
  validateXmlWithPlaceholders,
  formatXmlText
} from '@/utils/xmlUtils'
import {
  applyEditorEnter,
  applyEditorToggleComment
} from '@/utils/editorShortcuts'

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
    return { valid: true, isJsonc: false }
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

const xmlValidation = computed(() => {
  if (bodyType.value !== 'xml') {
    return { valid: true }
  }
  return validateXmlWithPlaceholders(bodyContent.value)
})

const formatXml = () => {
  if (bodyType.value !== 'xml' || !bodyContent.value.trim()) return
  const check = validateXmlWithPlaceholders(bodyContent.value)
  if (!check.valid) {
    uiStore.showToast(check.error || 'XML không hợp lệ, không thể format')
    return
  }
  try {
    if (textareaRef.value) {
      recordInputSnapshot(textareaRef.value)
    }
    const formatted = formatXmlText(bodyContent.value)
    bodyContent.value = formatted
    if (textareaRef.value) {
      textareaRef.value.value = formatted
      recordInputSnapshot(textareaRef.value)
    }
  } catch (err: any) {
    uiStore.showToast(err instanceof Error ? err.message : String(err))
  }
}

const lineCount = computed(() => bodyContent.value.split('\n').length)

const lineNumbers = computed(() => {
  return Array.from({ length: lineCount.value }, (_, i) => i + 1).join('\n')
})

function gutterWidth(count: number): string {
  const digits = Math.max(2, String(count).length)
  return `${digits * 0.55 + 1.25}rem`
}

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const preRef = ref<HTMLElement | null>(null)
const highlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)

const handleTextareaInput = (e: Event) => {
  const el = e.target as HTMLTextAreaElement
  if ((e as InputEvent).isComposing) {
    bodyContent.value = el.value
    return
  }
  const normalized = normalizeSmartChars(el)
  bodyContent.value = normalized
}

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

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Tab' || e.key === 'tab') {
    return
  }

  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (!textareaRef.value) return
    e.preventDefault()
    const lang = bodyType.value === 'xml' ? 'xml' : bodyType.value === 'json' ? 'json' : 'text'
    const nextVal = applyEditorEnter(textareaRef.value, lang)
    if (nextVal !== null) {
      bodyContent.value = nextVal
    }
    return
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
    if (!textareaRef.value) return
    e.preventDefault()
    const lang = bodyType.value === 'xml' ? 'xml' : bodyType.value === 'json' ? 'json' : 'text'
    const nextVal = applyEditorToggleComment(textareaRef.value, lang)
    if (nextVal !== null) {
      bodyContent.value = nextVal
    }
    return
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col h-full min-h-0">
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
    
    <div v-else class="flex-1 h-full px-3 pt-0 pb-0 flex flex-col min-h-0 gap-1.5">
      <!-- Smart JSON Toolbar -->
      <div v-if="bodyType === 'json'" class="flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 text-xs min-w-0 flex-wrap">
          <span
            v-if="jsonValidation.valid && jsonValidation.isJsonc"
            data-test="json-valid-badge"
            title="Comments/trailing comma sẽ được xóa khi gửi"
            class="inline-flex items-center gap-1 text-emerald-300/90 font-medium"
          >
            ✓ JSONC
          </span>
          <span
            v-else-if="jsonValidation.valid"
            data-test="json-valid-badge"
            class="inline-flex items-center gap-1 text-emerald-400 font-medium"
          >
            ✓ JSON hợp lệ
          </span>
          <span
            v-else
            data-test="json-error-banner"
            role="alert"
            class="inline-flex items-center gap-1 text-amber-400/70 font-medium truncate"
            :title="jsonValidation.error"
          >
            ⚠ {{ jsonValidation.error || `JSON lỗi cú pháp (dòng ${jsonValidation.line}, cột ${jsonValidation.column})` }}
          </span>
        </div>
        <button
          type="button"
          data-test="prettify-json-btn"
          title="Format / Prettify JSON"
          class="px-2.5 py-1 rounded bg-surface-overlay border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors shrink-0"
          @click="formatJson"
        >
          Format JSON
        </button>
      </div>

      <!-- Smart XML Toolbar -->
      <div v-if="bodyType === 'xml'" class="flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 text-xs min-w-0 flex-wrap">
          <span
            v-if="bodyContent?.trim() && xmlValidation.valid"
            data-test="xml-valid-badge"
            class="inline-flex items-center gap-1 text-emerald-400 font-medium"
          >
            ✓ XML hợp lệ
          </span>
          <span
            v-else-if="bodyContent?.trim() && !xmlValidation.valid"
            data-test="xml-error-banner"
            role="alert"
            class="inline-flex items-center gap-1 text-amber-400/70 font-medium truncate"
            :title="xmlValidation.error"
          >
            ⚠ {{ xmlValidation.error || (xmlValidation.line ? `XML lỗi cú pháp (dòng ${xmlValidation.line}, cột ${xmlValidation.column})` : 'XML lỗi cú pháp') }}
          </span>
        </div>
        <button
          type="button"
          data-test="prettify-xml-btn"
          title="Format / Prettify XML"
          class="px-2.5 py-1 rounded bg-surface-overlay border border-border-default text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors shrink-0"
          @click="formatXml"
        >
          Format XML
        </button>
      </div>

      <div class="flex-1 h-full flex flex-row bg-surface-input border rounded-md overflow-hidden min-h-0"
           :class="[
             bodyType === 'json' && !jsonValidation.valid ? 'border-amber-500/40' :
             bodyType === 'xml' && !xmlValidation.valid ? 'border-amber-500/40' : 'border-default'
           ]">
        <!-- Line numbers -->
        <div 
          ref="lineNumbersRef"
          :style="{ width: gutterWidth(lineCount) }"
          class="flex-shrink-0 bg-surface-raised border-r border-default text-text-muted mono-base text-right pr-2 pt-2 pb-0 select-none overflow-hidden"
        >
          <pre ref="preRef" class="mono-base m-0" style="margin: 0; line-height: 21px; font-size: 13px;">{{ lineNumbers }}</pre>
        </div>
        <!-- Editor -->
        <VariableHighlighter
          ref="highlighterRef"
          :value="bodyContent"
          :wrap="false"
          :syntax="bodyType === 'json' ? 'json' : bodyType === 'xml' ? 'xml' : 'plain'"
          overlay-class="p-2 pb-2 mono-base w-full h-full" style="line-height: 21px; font-size: 13px;"
          class="flex-1 w-full h-full min-w-0 min-h-0"
        >
          <textarea 
            ref="textareaRef"
            :value="bodyContent"
            @input="handleTextareaInput"
            @compositionend="handleTextareaInput"
            @scroll="handleScroll"
            @keydown.tab="handleTab"
            @keydown="handleKeydown"
            class="flex-1 w-full h-full min-h-0 bg-transparent border-none outline-none resize-none p-2 pb-2 mono-base text-transparent caret-text-primary whitespace-pre overflow-auto" style="line-height: 21px; font-size: 13px;"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            wrap="off"
          ></textarea>
        </VariableHighlighter>
      </div>
    </div>
  </div>
</template>
