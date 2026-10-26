<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'
import { executeScript } from '@/utils/scriptRunner'
import {
  tokenizeJavaScript,
  jsTokenClass,
  extractPrefixBeforeCursor,
  getScriptSuggestions,
  type ScriptSuggestionItem
} from '@/utils/jsHighlight'
import {
  applyEditorEnter,
  applyEditorToggleComment
} from '@/utils/editorShortcuts'
import { formatJavaScript } from '@/utils/jsFormatter'

const requestStore = useRequestStore()
const responseStore = useResponseStore()
const envStore = useEnvironmentStore()
const collectionStore = useCollectionStore()
const uiStore = useUiStore()

const selectedPhase = ref<'pre_request' | 'post_response'>('pre_request')
const showHints = ref(true)

const preTextareaRef = ref<HTMLTextAreaElement | null>(null)
const postTextareaRef = ref<HTMLTextAreaElement | null>(null)
const preOverlayRef = ref<HTMLElement | null>(null)
const postOverlayRef = ref<HTMLElement | null>(null)
const preGutterRef = ref<HTMLElement | null>(null)
const postGutterRef = ref<HTMLElement | null>(null)
const preGutterContentRef = ref<HTMLElement | null>(null)
const postGutterContentRef = ref<HTMLElement | null>(null)

const suggestions = ref<ScriptSuggestionItem[]>([])
const activeSuggestionIdx = ref(0)
const suggestionStartIdx = ref(0)
const isComposing = ref(false)

const preRequestCode = computed({
  get: () => requestStore.current?.scripts?.pre_request ?? '',
  set: (val: string) => {
    if (!requestStore.current) return
    if (!requestStore.current.scripts) {
      requestStore.current.scripts = { pre_request: '', post_response: '' }
    }
    requestStore.current.scripts.pre_request = val
  }
})

const postResponseCode = computed({
  get: () => requestStore.current?.scripts?.post_response ?? '',
  set: (val: string) => {
    if (!requestStore.current) return
    if (!requestStore.current.scripts) {
      requestStore.current.scripts = { pre_request: '', post_response: '' }
    }
    requestStore.current.scripts.post_response = val
  }
})

const hasPreRequestScript = computed(() => Boolean(preRequestCode.value.trim()))
const hasPostResponseScript = computed(() => Boolean(postResponseCode.value.trim()))

function resolveDefaultPhase(): 'pre_request' | 'post_response' {
  if (!hasPreRequestScript.value && hasPostResponseScript.value) {
    return 'post_response'
  }
  return 'pre_request'
}

function selectPhase(phase: 'pre_request' | 'post_response') {
  selectedPhase.value = phase
  suggestions.value = []
  nextTick(() => {
    const el = phase === 'pre_request' ? preTextareaRef.value : postTextareaRef.value
    if (el) {
      syncScroll({ target: el } as any, phase)
    }
  })
}

watch(
  () => requestStore.current?.id,
  () => {
    selectedPhase.value = resolveDefaultPhase()
    suggestions.value = []
    nextTick(() => {
      const el = selectedPhase.value === 'pre_request' ? preTextareaRef.value : postTextareaRef.value
      if (el) {
        syncScroll({ target: el } as any, selectedPhase.value)
      }
    })
  },
  { immediate: true }
)

const preTokens = computed(() => tokenizeJavaScript(preRequestCode.value))
const postTokens = computed(() => tokenizeJavaScript(postResponseCode.value))

const preLineCount = computed(() => {
  const code = preRequestCode.value
  return Math.max(1, code.split('\n').length)
})

const postLineCount = computed(() => {
  const code = postResponseCode.value
  return Math.max(1, code.split('\n').length)
})

function gutterWidth(count: number): string {
  const digits = Math.max(2, String(count).length)
  return `${digits * 0.55 + 1.25}rem`
}

function insertTemplate(template: string) {
  const isPre = selectedPhase.value === 'pre_request'
  const el = isPre ? preTextareaRef.value : postTextareaRef.value
  const currentVal = isPre ? preRequestCode.value : postResponseCode.value

  if (el) {
    const start = el.selectionStart ?? currentVal.length
    const end = el.selectionEnd ?? currentVal.length
    const before = currentVal.slice(0, start)
    const after = currentVal.slice(end)

    const needsPrefixNewline = before.length > 0 && !before.endsWith('\n')
    const textToInsert = (needsPrefixNewline ? '\n' : '') + template

    const nextVal = before + textToInsert + after
    if (isPre) {
      preRequestCode.value = nextVal
    } else {
      postResponseCode.value = nextVal
    }
    nextTick(() => {
      el.focus()
      const newPos = before.length + textToInsert.length
      el.setSelectionRange(newPos, newPos)
      syncScroll({ target: el } as any, isPre ? 'pre_request' : 'post_response')
    })
  } else {
    insertSnippet(isPre ? 'pre' : 'post', template)
  }
}

function insertSnippet(target: 'pre' | 'post', snippet: string) {
  if (target === 'pre') {
    preRequestCode.value = preRequestCode.value
      ? `${preRequestCode.value}\n${snippet}`
      : snippet
  } else {
    postResponseCode.value = postResponseCode.value
      ? `${postResponseCode.value}\n${snippet}`
      : snippet
  }
  suggestions.value = []
}

function formatCurrentScript() {
  const isPre = selectedPhase.value === 'pre_request'
  const el = isPre ? preTextareaRef.value : postTextareaRef.value
  const code = isPre ? preRequestCode.value : postResponseCode.value
  if (!code.trim()) return

  const formatted = formatJavaScript(code)
  if (isPre) {
    preRequestCode.value = formatted
  } else {
    postResponseCode.value = formatted
  }
  if (el) {
    nextTick(() => {
      el.focus()
    })
  }
}

function updateSuggestionsFromTextarea(el: HTMLTextAreaElement, phase: 'pre_request' | 'post_response') {
  const cursor = el.selectionStart ?? el.value.length
  const { prefix, startIndex, isInsideObject } = extractPrefixBeforeCursor(el.value, cursor)
  if (!prefix || prefix.length < 2) {
    suggestions.value = []
    return
  }
  const matches = getScriptSuggestions(prefix, phase, isInsideObject)
  // Avoid showing if exact match is already typed
  if (matches.length === 1 && matches[0].insertText === prefix) {
    suggestions.value = []
    return
  }
  suggestions.value = matches
  activeSuggestionIdx.value = 0
  suggestionStartIdx.value = startIndex
}

function onCompositionStart() {
  isComposing.value = true
  suggestions.value = []
}

function onCompositionUpdate() {
  isComposing.value = true
}

function onCompositionEnd(e: CompositionEvent, phase: 'pre_request' | 'post_response') {
  isComposing.value = false
  const el = e.target as HTMLTextAreaElement
  if (el) {
    if (phase === 'pre_request') {
      preRequestCode.value = el.value
    } else {
      postResponseCode.value = el.value
    }
    updateSuggestionsFromTextarea(el, phase)
  }
}

function onEditorInput(e: Event, phase: 'pre_request' | 'post_response') {
  const ie = e as InputEvent
  const el = e.target as any
  if (ie?.isComposing || el?.composing) {
    isComposing.value = true
    return
  }
  if (el) {
    if (phase === 'pre_request') {
      preRequestCode.value = el.value
    } else {
      postResponseCode.value = el.value
    }
    updateSuggestionsFromTextarea(el as HTMLTextAreaElement, phase)
  }
}

function applySuggestion(item: ScriptSuggestionItem) {
  const isPre = selectedPhase.value === 'pre_request'
  const el = isPre ? preTextareaRef.value : postTextareaRef.value
  const currentCode = isPre ? preRequestCode.value : postResponseCode.value
  const cursor = el?.selectionStart ?? currentCode.length
  const start = Math.min(suggestionStartIdx.value, cursor)
  const before = currentCode.slice(0, start)
  const after = currentCode.slice(cursor)

  const insert = item.insertText
  const nextCode = `${before}${insert}${after}`

  if (isPre) {
    preRequestCode.value = nextCode
  } else {
    postResponseCode.value = nextCode
  }

  suggestions.value = []
  nextTick(() => {
    if (el) {
      el.focus()
      const quotePos = insert.indexOf("''")
      let newCursorPos = before.length + insert.length
      if (quotePos !== -1) {
        newCursorPos = before.length + quotePos + 1
      }
      el.setSelectionRange(newCursorPos, newCursorPos)
    }
  })
}

function onEditorDblClick(e: MouseEvent, _phase: 'pre_request' | 'post_response') {
  const el = e.target as HTMLTextAreaElement
  if (!el) return

  setTimeout(() => {
    const val = el.value
    const start = el.selectionStart ?? 0
    const pos = Math.min(start, val.length)
    if (pos >= val.length && val.length === 0) return

    const isIdChar = (c: string | undefined) => Boolean(c && /[a-zA-Z0-9_$]/.test(c))

    let targetPos = pos
    if (!isIdChar(val[targetPos]) && targetPos > 0 && isIdChar(val[targetPos - 1])) {
      targetPos = targetPos - 1
    }

    if (!isIdChar(val[targetPos])) return

    let wordStart = targetPos
    while (wordStart > 0 && isIdChar(val[wordStart - 1])) {
      wordStart--
    }

    let wordEnd = targetPos
    while (wordEnd < val.length && isIdChar(val[wordEnd])) {
      wordEnd++
    }

    if (wordStart < wordEnd) {
      el.setSelectionRange(wordStart, wordEnd)
    }
  }, 0)
}

function onEditorKeydown(e: KeyboardEvent, phase: 'pre_request' | 'post_response') {
  const el = e.target as HTMLTextAreaElement

  // Ctrl+X / Cmd+X (Cut handler)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && el) {
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const val = el.value

    if (start !== end) {
      const cutText = val.slice(start, end)
      e.preventDefault()
      navigator.clipboard?.writeText(cutText).catch(() => {})
      const nextVal = val.slice(0, start) + val.slice(end)
      if (phase === 'pre_request') {
        preRequestCode.value = nextVal
      } else {
        postResponseCode.value = nextVal
      }
      nextTick(() => {
        el.selectionStart = el.selectionEnd = start
      })
      return
    } else {
      e.preventDefault()
      const lineStart = val.lastIndexOf('\n', start - 1) + 1
      const nextNewline = val.indexOf('\n', start)
      const lineEnd = nextNewline === -1 ? val.length : nextNewline + 1
      const cutText = val.slice(lineStart, lineEnd)
      navigator.clipboard?.writeText(cutText).catch(() => {})
      const nextVal = val.slice(0, lineStart) + val.slice(lineEnd)
      if (phase === 'pre_request') {
        preRequestCode.value = nextVal
      } else {
        postResponseCode.value = nextVal
      }
      nextTick(() => {
        el.selectionStart = el.selectionEnd = lineStart
      })
      return
    }
  }

  // Ctrl+Shift+F or Cmd+Shift+F or Alt+Shift+F (Format code shortcut)
  if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') || (e.altKey && e.shiftKey && e.key.toLowerCase() === 'f')) {
    e.preventDefault()
    formatCurrentScript()
    return
  }

  if (e.ctrlKey && e.key === ' ') {
    e.preventDefault()
    if (el) {
      const cursor = el.selectionStart ?? el.value.length
      const { prefix, startIndex, isInsideObject } = extractPrefixBeforeCursor(el.value, cursor)
      suggestionStartIdx.value = startIndex
      suggestions.value = getScriptSuggestions(prefix || (isInsideObject ? 'type' : 'ha.'), phase, isInsideObject)
      activeSuggestionIdx.value = 0
    }
    return
  }

  if (suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeSuggestionIdx.value = (activeSuggestionIdx.value + 1) % suggestions.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeSuggestionIdx.value =
        (activeSuggestionIdx.value - 1 + suggestions.value.length) % suggestions.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const picked = suggestions.value[activeSuggestionIdx.value]
      if (picked) {
        applySuggestion(picked)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      suggestions.value = []
      return
    }
  }

  if (e.key === 'Tab' && !e.shiftKey && el) {
    e.preventDefault()
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const val = el.value
    const nextVal = val.slice(0, start) + '  ' + val.slice(end)
    if (phase === 'pre_request') {
      preRequestCode.value = nextVal
    } else {
      postResponseCode.value = nextVal
    }
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + 2
    })
    return
  }

  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && el) {
    e.preventDefault()
    const nextVal = applyEditorEnter(el, 'javascript')
    if (nextVal !== null) {
      if (phase === 'pre_request') {
        preRequestCode.value = nextVal
      } else {
        postResponseCode.value = nextVal
      }
    }
    return
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash') && el) {
    e.preventDefault()
    const nextVal = applyEditorToggleComment(el, 'javascript')
    if (nextVal !== null) {
      if (phase === 'pre_request') {
        preRequestCode.value = nextVal
      } else {
        postResponseCode.value = nextVal
      }
    }
    return
  }
}

function syncScroll(e: Event, phase: 'pre_request' | 'post_response') {
  const target = e.target as HTMLElement
  const overlay = phase === 'pre_request' ? preOverlayRef.value : postOverlayRef.value
  const gutterContent = phase === 'pre_request' ? preGutterContentRef.value : postGutterContentRef.value
  if (target) {
    if (overlay) {
      overlay.scrollTop = target.scrollTop
      overlay.scrollLeft = target.scrollLeft
    }
    if (gutterContent) {
      gutterContent.style.transform = `translateY(-${target.scrollTop}px)`
    }
  }
}

function onGutterWheel(e: WheelEvent, phase: 'pre_request' | 'post_response') {
  const el = phase === 'pre_request' ? preTextareaRef.value : postTextareaRef.value
  if (el) {
    el.scrollTop += e.deltaY
    el.scrollLeft += e.deltaX
    syncScroll({ target: el } as any, phase)
    e.preventDefault()
  }
}

function onGutterLineClick(lineNum: number, phase: 'pre_request' | 'post_response') {
  const el = phase === 'pre_request' ? preTextareaRef.value : postTextareaRef.value
  const code = phase === 'pre_request' ? preRequestCode.value : postResponseCode.value
  if (!el) return
  const lines = code.split('\n')
  let pos = 0
  for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
    pos += lines[i].length + 1
  }
  el.focus()
  el.setSelectionRange(pos, pos)
}

function onEditorBlur() {
  isComposing.value = false
  setTimeout(() => {
    suggestions.value = []
  }, 150)
}

function collectAllFolders(nodes: any[]): any[] {
  const out: any[] = []
  const walk = (items: any[]) => {
    for (const item of items || []) {
      if (item && item.type === 'folder') {
        out.push(item)
        if (Array.isArray(item.children)) {
          walk(item.children)
        }
      }
    }
  }
  walk(nodes)
  return out
}

async function runScriptPreview() {
  if (!requestStore.current) return
  responseStore.scriptLogs = []
  responseStore.scriptError = null
  const req = requestStore.current
  const pathNodes = (
    collectionStore.findFolderPath(collectionStore.tree, req.id) || []
  ).filter(n => n.type === 'folder')
  const allFolders = collectAllFolders(collectionStore.tree)
  const vars = resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: pathNodes,
    activeEnvId: envStore.activeEnvId
  })

  const isPre = selectedPhase.value === 'pre_request'
  const codeToRun = isPre ? preRequestCode.value : postResponseCode.value
  const label = isPre ? 'Pre-request' : 'Post-response'

  const res = executeScript(codeToRun, {
    variables: vars,
    request: req,
    response: responseStore.response,
    collectionVariables: collectionStore.activeCollection?.variables,
    collectionAuth: collectionStore.activeCollection?.auth,
    collectionAuthEnvs: collectionStore.activeCollection?.auth_envs,
    environments: envStore.environments as any,
    activeEnvId: envStore.activeEnvId,
    pathFolders: pathNodes,
    allFolders
  })

  if (res.logs.length > 0) {
    responseStore.scriptLogs.push(...res.logs.map(l => `[${label}] ${l}`))
  }
  for (const entry of res.logEntries) {
    responseStore.appendExecutionLog({
      timestamp: entry.timestamp,
      phase: isPre ? 'pre-request' : 'post-response',
      level: entry.level,
      message: entry.message
    })
  }
  if (!res.success) {
    responseStore.scriptError = res.error || `Lỗi thực thi ${label} Script`
    uiStore.showToast(`Lỗi khi chạy ${label} Script`)
  } else {
    uiStore.showToast(`Đã chạy thử ${label} Script`)
  }

  // Apply request mutations if any
  const mut = res.requestMutations
  if (mut.url !== undefined) req.url = mut.url
  if (mut.method !== undefined) req.method = mut.method
  if (mut.params !== undefined) req.params = mut.params.map(p => ({ ...p }))
  if (mut.path_params !== undefined) req.path_params = mut.path_params.map(p => ({ ...p }))
  if (mut.headers !== undefined) req.headers = mut.headers.map(h => ({ ...h }))
  if (mut.body !== undefined) {
    if (!req.body) req.body = { type: 'none', content: '' }
    if (mut.body.type !== undefined) req.body.type = mut.body.type
    if (mut.body.content !== undefined) req.body.content = mut.body.content
  }
  if (mut.auth !== undefined) {
    req.auth = mut.auth
  }

  if (Object.keys(res.envUpdates).length > 0) {
    await envStore.applyVariableUpdates(res.envUpdates)
  }
  await envStore.applyScopedVariableUpdates(res.scopedEnvUpdates, pathNodes)
  if (res.scopedAuthUpdates) {
    await envStore.applyScopedAuthUpdates(res.scopedAuthUpdates, pathNodes)
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 p-2.5 text-xs" data-test="script-editor">
    <!-- Top Bar: Script Phase Tabs + Actions -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-default pb-2">
      <!-- Script Phase Tabs -->
      <div class="flex items-center gap-1 bg-surface-base p-1 rounded-lg border border-border-default" role="tablist" aria-label="Script phase tabs">
        <button
          type="button"
          role="tab"
          data-test="script-tab-pre-request"
          :aria-selected="selectedPhase === 'pre_request'"
          class="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer select-none"
          :class="[
            selectedPhase === 'pre_request'
              ? 'bg-surface-overlay text-brand-primary shadow-sm border border-border-default/60'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent'
          ]"
          @click="selectPhase('pre_request')"
        >
          <span>Pre-request</span>
          <span
            v-if="hasPreRequestScript"
            data-test="pre-script-badge"
            class="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold"
            title="Đang có Pre-request script"
          >
            ✓
          </span>
        </button>

        <button
          type="button"
          role="tab"
          data-test="script-tab-post-response"
          :aria-selected="selectedPhase === 'post_response'"
          class="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer select-none"
          :class="[
            selectedPhase === 'post_response'
              ? 'bg-surface-overlay text-brand-primary shadow-sm border border-border-default/60'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent'
          ]"
          @click="selectPhase('post_response')"
        >
          <span>Post-response</span>
          <span
            v-if="hasPostResponseScript"
            data-test="post-script-badge"
            class="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold"
            title="Đang có Post-response script"
          >
            ✓
          </span>
        </button>
      </div>

      <!-- Hidden select for compatibility with tests -->
      <select
        v-show="false"
        id="script-phase-select"
        v-model="selectedPhase"
        data-test="script-phase-select"
      >
        <option value="pre_request">Pre-request</option>
        <option value="post_response">Post-response</option>
      </select>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          data-test="format-script-btn"
          class="rounded border border-border-default bg-surface-base px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary cursor-pointer flex items-center gap-1"
          title="Định dạng thụt lề và khoảng cách mã lệnh (Ctrl+Shift+F)"
          @click="formatCurrentScript"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 7 4 4 20 4 20 7"></polyline>
            <line x1="9" y1="20" x2="15" y2="20"></line>
            <line x1="12" y1="4" x2="12" y2="20"></line>
          </svg>
          <span>Định dạng</span>
        </button>
        <button
          type="button"
          data-test="toggle-script-hints-btn"
          class="rounded border border-border-default bg-surface-base px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary cursor-pointer"
          @click="showHints = !showHints"
        >
          {{ showHints ? 'Ẩn gợi ý API' : 'Hiện gợi ý API' }}
        </button>
        <button
          type="button"
          class="px-2.5 py-1 text-xs rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer font-medium flex items-center gap-1 whitespace-nowrap"
          data-test="run-pre-script-btn"
          @click="runScriptPreview"
        >
          ▶ Chạy thử Script
        </button>
      </div>
    </div>

    <!-- Single Active Editor Area with Line Numbers Gutter + JS Syntax Highlighting Overlay + Code Suggestions -->
    <div class="relative flex flex-col">
      <!-- Pre-request Script Editor (shown when selectedPhase === 'pre_request') -->
      <div
        v-show="selectedPhase === 'pre_request'"
        data-test="pre-script-panel"
        class="relative flex w-full min-h-[160px] h-[220px] max-h-[600px] resize-y rounded border border-border-default bg-surface-input focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/40 overflow-hidden"
        :class="{ 'is-ime-composing': isComposing }"
      >
        <!-- Line Number Gutter -->
        <div
          ref="preGutterRef"
          data-test="pre-script-gutter"
          aria-hidden="true"
          class="select-none overflow-hidden bg-surface-base/80 border-r border-border-default/60 py-2.5 px-2 font-mono text-xs leading-relaxed text-text-muted/60 text-right shrink-0 h-full min-h-0"
          :style="{ minWidth: gutterWidth(preLineCount) }"
          @wheel="e => onGutterWheel(e, 'pre_request')"
        >
          <div ref="preGutterContentRef">
            <div
              v-for="line in preLineCount"
              :key="line"
              class="cursor-pointer hover:text-text-primary transition-colors"
              @click="onGutterLineClick(line, 'pre_request')"
            >
              {{ line }}
            </div>
          </div>
        </div>

        <div class="relative flex-1 min-w-0 h-full min-h-0">
          <pre
            ref="preOverlayRef"
            data-test="pre-script-syntax-overlay"
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre py-2.5 px-3 font-mono text-xs leading-relaxed"
            :class="{ 'opacity-0': isComposing }"
          ><template v-for="(tok, idx) in preTokens" :key="idx"><span :data-js-token="tok.type" :class="jsTokenClass(tok.type)">{{ tok.value }}</span></template></pre>
          <textarea
            ref="preTextareaRef"
            v-model="preRequestCode"
            data-test="pre-request-script-input"
            spellcheck="false"
            autocomplete="off"
            wrap="off"
            class="transparent-selection relative z-10 w-full h-full min-h-0 resize-none rounded-r bg-transparent py-2.5 px-3 font-mono text-xs leading-relaxed text-transparent caret-text-primary focus:outline-none whitespace-pre overflow-auto"
            @compositionstart="onCompositionStart"
            @compositionupdate="onCompositionUpdate"
            @compositionend="e => onCompositionEnd(e, 'pre_request')"
            @input="e => onEditorInput(e, 'pre_request')"
            @keydown="e => onEditorKeydown(e, 'pre_request')"
            @scroll="e => syncScroll(e, 'pre_request')"
            @dblclick="e => onEditorDblClick(e, 'pre_request')"
            @blur="onEditorBlur"
          />
        </div>
      </div>

      <!-- Post-response Script Editor (shown when selectedPhase === 'post_response') -->
      <div
        v-show="selectedPhase === 'post_response'"
        data-test="post-script-panel"
        class="relative flex w-full min-h-[160px] h-[220px] max-h-[600px] resize-y rounded border border-border-default bg-surface-input focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/40 overflow-hidden"
        :class="{ 'is-ime-composing': isComposing }"
      >
        <!-- Line Number Gutter -->
        <div
          ref="postGutterRef"
          data-test="post-script-gutter"
          aria-hidden="true"
          class="select-none overflow-hidden bg-surface-base/80 border-r border-border-default/60 py-2.5 px-2 font-mono text-xs leading-relaxed text-text-muted/60 text-right shrink-0 h-full min-h-0"
          :style="{ minWidth: gutterWidth(postLineCount) }"
          @wheel="e => onGutterWheel(e, 'post_response')"
        >
          <div ref="postGutterContentRef">
            <div
              v-for="line in postLineCount"
              :key="line"
              class="cursor-pointer hover:text-text-primary transition-colors"
              @click="onGutterLineClick(line, 'post_response')"
            >
              {{ line }}
            </div>
          </div>
        </div>

        <div class="relative flex-1 min-w-0 h-full min-h-0">
          <pre
            ref="postOverlayRef"
            data-test="post-script-syntax-overlay"
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre py-2.5 px-3 font-mono text-xs leading-relaxed"
            :class="{ 'opacity-0': isComposing }"
          ><template v-for="(tok, idx) in postTokens" :key="idx"><span :data-js-token="tok.type" :class="jsTokenClass(tok.type)">{{ tok.value }}</span></template></pre>
          <textarea
            ref="postTextareaRef"
            v-model="postResponseCode"
            data-test="post-response-script-input"
            spellcheck="false"
            autocomplete="off"
            wrap="off"
            class="transparent-selection relative z-10 w-full h-full min-h-0 resize-none rounded-r bg-transparent py-2.5 px-3 font-mono text-xs leading-relaxed text-transparent caret-text-primary focus:outline-none whitespace-pre overflow-auto"
            @compositionstart="onCompositionStart"
            @compositionupdate="onCompositionUpdate"
            @compositionend="e => onCompositionEnd(e, 'post_response')"
            @input="e => onEditorInput(e, 'post_response')"
            @keydown="e => onEditorKeydown(e, 'post_response')"
            @scroll="e => syncScroll(e, 'post_response')"
            @dblclick="e => onEditorDblClick(e, 'post_response')"
            @blur="onEditorBlur"
          />
        </div>
      </div>

      <!-- Code Completion / IntelliSense Popup -->
      <div
        v-if="suggestions.length > 0"
        data-test="script-autocomplete-list"
        class="z-30 mt-1 max-h-52 overflow-y-auto rounded-md border border-border-default bg-surface-overlay p-1 shadow-xl"
      >
        <div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center justify-between">
          <span>Gợi ý mã lệnh (Tab / Enter để chèn, Esc để đóng)</span>
          <span class="font-mono text-sky-400">Ctrl+Space</span>
        </div>
        <button
          v-for="(item, idx) in suggestions"
          :key="item.label"
          type="button"
          data-test="script-autocomplete-item"
          class="flex w-full flex-col gap-0.5 rounded px-2.5 py-1.5 text-left transition-colors cursor-pointer"
          :class="idx === activeSuggestionIdx ? 'bg-brand-primary/20 text-text-primary' : 'hover:bg-surface-hover text-text-secondary'"
          @mousedown.prevent="applySuggestion(item)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-xs font-semibold text-sky-300">{{ item.label }}</span>
            <span class="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-amber-300">{{ item.detail }}</span>
          </div>
          <span class="text-[11px] text-text-muted">{{ item.description }}</span>
        </button>
      </div>
    </div>

    <!-- Built-in Hints & API Quick Reference (Clickable Snippet Templates) -->
    <div
      v-if="showHints"
      data-test="script-hints-box"
      class="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-border-default bg-surface-base/80 p-3 text-[11px]"
    >
      <!-- 1. Environment -->
      <div class="space-y-1.5 p-2 rounded border border-border-default/50 bg-surface-raised/20">
        <div class="font-semibold text-sky-400 flex items-center justify-between">
          <span>1. Environment (<code class="text-sky-300">ha.env</code>)</span>
          <span class="text-[10px] text-text-muted font-normal">Click chèn template</span>
        </div>
        <div class="text-[10px] text-text-muted">ha.env('Dev') hoặc ha.env():</div>
        <div class="flex flex-wrap gap-1 font-mono text-[10.5px]">
          <button
            type="button"
            data-test="snippet-pre-set-env"
            title="Gán biến môi trường: ha.env().set({ token: 'value' })"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-sky-300 hover:border-sky-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.env().set({ token: \'value\' });')"
          >
            <strong class="text-sky-300">.set</strong>({ token: 'value' })
          </button>
          <button
            type="button"
            data-test="snippet-pre-get-env"
            title="Lấy biến môi trường: ha.env().get('key')"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-sky-300 hover:border-sky-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('const val = ha.env().get(\'key\');')"
          >
            <strong class="text-sky-300">.get</strong>('key')
          </button>
          <button
            type="button"
            data-test="snippet-pre-unset-env"
            title="Xóa biến môi trường: ha.env().unset('key')"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-sky-300 hover:border-sky-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.env().unset(\'key\');')"
          >
            <strong class="text-sky-300">.unset</strong>('key')
          </button>
          <button
            type="button"
            data-test="snippet-pre-env-name"
            title="Tên môi trường hiện tại: ha.environment.name"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-sky-300 hover:border-sky-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('const currentEnv = ha.environment.name;')"
          >
            <strong class="text-sky-300">ha.environment.name</strong>
          </button>
          <button
            type="button"
            data-test="snippet-pre-set-coll-env"
            title="Gán biến dùng chung toàn Collection: ha.collectionVariables.set('base_url', '...')"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-sky-300 hover:border-sky-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.collectionVariables.set(\'base_url\', \'https://api.example.com\');')"
          >
            <strong class="text-sky-300">ha.collectionVariables.set</strong>(...)
          </button>
        </div>
      </div>

      <!-- 2. Folder & Auth -->
      <div class="space-y-1.5 p-2 rounded border border-border-default/50 bg-surface-raised/20">
        <div class="font-semibold text-purple-400 flex items-center justify-between">
          <span>2. Folder &amp; Auth (<code class="text-purple-300">ha.folder</code>)</span>
          <span class="text-[10px] text-text-muted font-normal">Click chèn template</span>
        </div>
        <div class="text-[10px] text-text-muted">ha.folder('Name') hoặc ha.folder():</div>
        <div class="flex flex-wrap gap-1 font-mono text-[10.5px]">
          <button
            type="button"
            data-test="snippet-pre-set-folder-env"
            title="Gán biến Folder: ha.folder().set({ folder_var: 'val' })"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().set({ folder_var: \'val\' });')"
          >
            <strong class="text-purple-300">.set</strong>({ folder_var: 'val' })
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-env-set"
            title="Gán biến Folder theo Env: ha.folder().env('Dev').set('k', 'v')"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().env(\'Dev\').set(\'api_key\', \'secret-123\');')"
          >
            <strong class="text-purple-300">.env</strong>('Dev')<strong class="text-purple-300">.set</strong>(...)
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-auth"
            title="Gán Bearer Auth cho Folder bằng JSON"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder(\'FolderName\').auth.set({\n  type: \'bearer\',\n  value: \'token-xyz\'\n});')"
          >
            <strong class="text-purple-300">.auth.set</strong>(Bearer)
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-auth-apikey"
            title="Gán API Key Auth cho Folder bằng JSON"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().auth.set({\n  type: \'apiKey\',\n  key: \'X-API-KEY\',\n  value: \'my-secret-key\',\n  addTo: \'header\'\n});')"
          >
            <strong class="text-purple-300">.auth.set</strong>(API Key)
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-auth-basic"
            title="Gán Basic Auth cho Folder bằng JSON"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().auth.set({\n  type: \'basic\',\n  username: \'admin\',\n  password: \'password123\'\n});')"
          >
            <strong class="text-purple-300">.auth.set</strong>(Basic)
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-auth-inherit"
            title="Kế thừa Auth: ha.folder().auth.inherit()"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().auth.inherit();')"
          >
            <strong class="text-purple-300">.auth.inherit()</strong>
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-auth-none"
            title="Tắt xác thực: ha.folder().auth.none()"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().auth.none();')"
          >
            <strong class="text-purple-300">.auth.none()</strong>
          </button>
          <button
            type="button"
            data-test="snippet-pre-folder-auth-env"
            title="Gán Auth Folder theo Env: ha.folder().auth.env('Dev').set({...})"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-purple-300 hover:border-purple-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.folder().auth.env(\'Dev\').set({\n  type: \'bearer\',\n  value: \'dev-token\'\n});')"
          >
            <strong class="text-purple-300">.auth.env</strong>('Dev')<strong class="text-purple-300">.set</strong>(...)
          </button>
        </div>
      </div>

      <!-- 3. Request Params & Body -->
      <div class="space-y-1.5 p-2 rounded border border-border-default/50 bg-surface-raised/20">
        <div class="font-semibold text-amber-400 flex items-center justify-between">
          <span>3. Request (<code class="text-amber-300">ha.request</code>)</span>
          <span class="text-[10px] text-text-muted font-normal">Click chèn template</span>
        </div>
        <div class="flex flex-wrap gap-1 font-mono text-[10.5px]">
          <button
            type="button"
            data-test="snippet-pre-request-auth"
            title="Gán hoặc ghi đè Auth cho Request"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-amber-300 hover:border-amber-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.request.auth.set({\n  type: \'bearer\',\n  value: ha.env().get(\'ACCESS_TOKEN\') || \'my-token\'\n});')"
          >
            <strong class="text-amber-300">.auth.set</strong>(...)
          </button>
          <button
            type="button"
            data-test="snippet-pre-query-params"
            title="Gán Query Param: ha.request.query.set('timestamp', Date.now())"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-amber-300 hover:border-amber-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.request.query.set(\'timestamp\', Date.now());')"
          >
            <strong class="text-amber-300">.query.set</strong>('key', val)
          </button>
          <button
            type="button"
            data-test="snippet-pre-path-params"
            title="Gán Path Param: ha.request.pathParams.set('id', '123')"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-amber-300 hover:border-amber-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.request.pathParams.set(\'id\', \'123\');')"
          >
            <strong class="text-amber-300">.pathParams.set</strong>('id', '123')
          </button>
          <button
            type="button"
            data-test="snippet-pre-headers"
            title="Gán Header: ha.request.headers.set('X-Request-ID', ...)"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-amber-300 hover:border-amber-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.request.headers.set(\'X-Request-ID\', \'req-\' + Date.now());')"
          >
            <strong class="text-amber-300">.headers.set</strong>('Key', val)
          </button>
          <button
            type="button"
            data-test="snippet-pre-body-set"
            title="Cập nhật Body: ha.request.body.set({ updated_at: Date.now() })"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-amber-300 hover:border-amber-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.request.body.set({ updated_at: Date.now() });')"
          >
            <strong class="text-amber-300">.body.set</strong>({ ok: true })
          </button>
          <button
            type="button"
            data-test="snippet-pre-body-json"
            title="Đọc JSON Body: ha.request.body.json()"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-amber-300 hover:border-amber-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('const reqBody = ha.request.body.json();')"
          >
            <strong class="text-amber-300">.body.json()</strong>
          </button>
        </div>
      </div>

      <!-- 4. Response & Debug -->
      <div class="space-y-1.5 p-2 rounded border border-border-default/50 bg-surface-raised/20">
        <div class="font-semibold text-emerald-400 flex items-center justify-between">
          <span>4. Response &amp; Debug (<code class="text-emerald-300">ha.response</code>)</span>
          <span class="text-[10px] text-text-muted font-normal">Click chèn template</span>
        </div>
        <div class="flex flex-wrap gap-1 font-mono text-[10.5px]">
          <button
            type="button"
            data-test="snippet-post-json"
            title="Parse nội dung JSON body: ha.response.json()"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.response.json()')"
          >
            <strong class="text-emerald-300">.json()</strong>
          </button>
          <button
            type="button"
            data-test="snippet-post-folder-auth"
            title="Dữ liệu response (tự động parse JSON): ha.response.data"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.response.data')"
          >
            <strong class="text-emerald-300">.data</strong>
          </button>
          <button
            type="button"
            data-test="snippet-post-text"
            title="Lấy body dạng text: ha.response.text()"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.response.text()')"
          >
            <strong class="text-emerald-300">.text()</strong>
          </button>
          <button
            type="button"
            data-test="snippet-post-set-env"
            title="Mã trạng thái HTTP: ha.response.code"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.response.code')"
          >
            <strong class="text-emerald-300">.code</strong>
          </button>
          <button
            type="button"
            data-test="snippet-post-response-time"
            title="Thời gian phản hồi (ms): ha.response.responseTime"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.response.responseTime')"
          >
            <strong class="text-emerald-300">.responseTime</strong>
          </button>
          <button
            type="button"
            data-test="snippet-post-headers-get"
            title="Lấy response header: ha.response.headers.get('content-type')"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('ha.response.headers.get(\'content-type\')')"
          >
            <strong class="text-emerald-300">.headers.get</strong>(...)
          </button>
          <button
            type="button"
            data-test="snippet-pre-log"
            title="Ghi log dữ liệu ra bảng Console / Logs: console.log(ha.response.data)"
            class="px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-emerald-300 hover:border-emerald-400/50 cursor-pointer transition-colors"
            @click="insertTemplate('console.log(ha.response.data);')"
          >
            <strong class="text-emerald-300">console.log</strong>(...)
          </button>
        </div>
      </div>
    </div>

    <!-- Execution Output & Logs -->
    <div
      class="flex flex-col gap-1.5 rounded border border-border-default bg-surface-base p-2.5"
      data-test="script-execution-output"
    >
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Console &amp; Script Output
        </span>
        <button
          v-if="responseStore.scriptLogs.length > 0 || responseStore.executionLogs.length > 0 || responseStore.scriptError"
          type="button"
          class="text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
          data-test="clear-script-logs-btn"
          @click="responseStore.clearLogs()"
        >
          Xóa log
        </button>
      </div>

      <div
        v-if="responseStore.scriptError"
        class="rounded bg-red-950/50 border border-red-500/40 px-2.5 py-1.5 font-mono text-[11px] text-red-300"
        data-test="script-error-banner"
      >
        {{ responseStore.scriptError }}
      </div>

      <div
        v-if="responseStore.scriptLogs.length > 0"
        class="max-h-40 overflow-y-auto space-y-1 p-1 font-mono text-[11px] leading-relaxed text-emerald-300"
      >
        <div v-for="(line, idx) in responseStore.scriptLogs" :key="idx" class="py-0.5 border-b border-border-subtle/40 last:border-0">
          {{ line }}
        </div>
      </div>

      <div
        v-else-if="!responseStore.scriptError"
        class="font-mono text-[11px] text-text-muted"
      >
        Chưa có log thực thi. Hỗ trợ: ha.environment.set, ha.collectionVariables.set, ha.folderVariables.set, ha.folderEnv.set, ha.request.query.set, ha.request.pathParams.set, ha.response.json(), console.log(...).
      </div>
    </div>
  </div>
</template>
