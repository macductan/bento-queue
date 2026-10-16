<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useCollectionStore } from '@/stores/collectionStore'
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

const requestStore = useRequestStore()
const responseStore = useResponseStore()
const envStore = useEnvironmentStore()
const collectionStore = useCollectionStore()

const selectedPhase = ref<'pre_request' | 'post_response'>('pre_request')
const showHints = ref(true)

const preTextareaRef = ref<HTMLTextAreaElement | null>(null)
const postTextareaRef = ref<HTMLTextAreaElement | null>(null)
const preOverlayRef = ref<HTMLElement | null>(null)
const postOverlayRef = ref<HTMLElement | null>(null)

const suggestions = ref<ScriptSuggestionItem[]>([])
const activeSuggestionIdx = ref(0)
const suggestionStartIdx = ref(0)

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

const preTokens = computed(() => tokenizeJavaScript(preRequestCode.value))
const postTokens = computed(() => tokenizeJavaScript(postResponseCode.value))

const preSnippets = [
  {
    id: 'snippet-pre-set-env',
    label: '+ Global Env',
    title: 'Gán biến vào Global Environment đang chọn (hoặc tên Env cụ thể)',
    code: `ha.environment.set('token', 'value');`
  },
  {
    id: 'snippet-pre-set-coll-env',
    label: '+ Collection Env',
    title: 'Gán biến dùng chung cho toàn Collection',
    code: `ha.collectionVariables.set('base_url', 'https://api.example.com');`
  },
  {
    id: 'snippet-pre-set-folder-env',
    label: '+ Folder Env',
    title: 'Gán biến cho Folder hiện tại (Dùng chung & theo Env)',
    code: `ha.folderVariables.set('folder_token', 'shared-val');\nha.folderEnv.set('folder_api', 'env-specific-val');`
  },
  {
    id: 'snippet-pre-query-params',
    label: '+ Set Query/Params',
    title: 'Đọc và gán tham số Query (?key=value) hoặc Path (:api_key)',
    code: `ha.request.query.set('timestamp', Date.now());\nha.request.pathParams.set('api_key', ha.environment.get('API_KEY') || 'demo-key');`
  },
  {
    id: 'snippet-pre-headers',
    label: '+ Set Header',
    title: 'Thêm hoặc ghi đè Header cho Request trước khi gửi',
    code: `ha.request.headers.set('X-Request-ID', 'req-' + Date.now());`
  },
  {
    id: 'snippet-pre-log',
    label: '+ console.log',
    title: 'Ghi log debug ra bảng Console / Logs',
    code: `console.log('Params hiện tại:', ha.request.params.toObject(), 'Path:', ha.request.pathParams.toObject());`
  }
]

const postSnippets = [
  {
    id: 'snippet-post-json',
    label: '+ ha.response.json()',
    title: 'Đọc JSON từ response và lưu token vào Environment',
    code: `{\n  const body = ha.response.json();\n  ha.environment.set('auth_token', body.token);\n}`
  },
  {
    id: 'snippet-post-set-env',
    label: '+ ha.environment.set',
    title: 'Lưu mã trạng thái HTTP vào biến môi trường',
    code: `ha.environment.set('status_code', ha.response.code);`
  },
  {
    id: 'snippet-post-all-envs',
    label: '+ Set All Scopes',
    title: 'Lưu dữ liệu từ Response vào Global Env, Collection Env hoặc Folder Env',
    code: `{\n  const data = ha.response.data;\n  ha.environment.set('env_token', data?.token);\n  ha.collectionVariables.set('shared_id', data?.id);\n  ha.folderEnv.set('folder_secret', data?.secret);\n}`
  },
  {
    id: 'snippet-post-log-response',
    label: '+ Log Response',
    title: 'Ghi log chi tiết status, thời gian và dữ liệu phản hồi',
    code: `console.info('Status:', ha.response.code, 'Time:', ha.response.responseTime + 'ms', 'Data:', ha.response.data);`
  }
]

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

function updateSuggestionsFromTextarea(el: HTMLTextAreaElement, phase: 'pre_request' | 'post_response') {
  const cursor = el.selectionStart ?? el.value.length
  const { prefix, startIndex } = extractPrefixBeforeCursor(el.value, cursor)
  if (!prefix || prefix.length < 2) {
    suggestions.value = []
    return
  }
  const matches = getScriptSuggestions(prefix, phase)
  // Avoid showing if exact match is already typed
  if (matches.length === 1 && matches[0].insertText === prefix) {
    suggestions.value = []
    return
  }
  suggestions.value = matches
  activeSuggestionIdx.value = 0
  suggestionStartIdx.value = startIndex
}

function onEditorInput(e: Event, phase: 'pre_request' | 'post_response') {
  const el = e.target as HTMLTextAreaElement
  if (el) {
    updateSuggestionsFromTextarea(el, phase)
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
  const nextCode = `${before}${item.insertText}${after}`

  if (isPre) {
    preRequestCode.value = nextCode
  } else {
    postResponseCode.value = nextCode
  }

  suggestions.value = []
  nextTick(() => {
    if (el) {
      el.focus()
      const newCursorPos = before.length + item.insertText.length
      el.setSelectionRange(newCursorPos, newCursorPos)
    }
  })
}

function onEditorKeydown(e: KeyboardEvent, phase: 'pre_request' | 'post_response') {
  const el = e.target as HTMLTextAreaElement
  if (e.ctrlKey && e.key === ' ') {
    e.preventDefault()
    if (el) {
      const cursor = el.selectionStart ?? el.value.length
      const { prefix, startIndex } = extractPrefixBeforeCursor(el.value, cursor)
      suggestionStartIdx.value = startIndex
      suggestions.value = getScriptSuggestions(prefix || 'ha.', phase)
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
  if (overlay && target) {
    overlay.scrollTop = target.scrollTop
    overlay.scrollLeft = target.scrollLeft
  }
}

function onEditorBlur() {
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

  if (Object.keys(res.envUpdates).length > 0) {
    await envStore.applyVariableUpdates(res.envUpdates)
  }
  await envStore.applyScopedVariableUpdates(res.scopedEnvUpdates, pathNodes)
}
</script>

<template>
  <div class="flex flex-col gap-3 p-2.5 text-xs" data-test="script-editor">
    <!-- Top Bar: Script Phase Select + Actions -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-default pb-2.5">
      <div class="flex items-center gap-2">
        <label for="script-phase-select" class="text-xs font-semibold text-text-secondary whitespace-nowrap">
          Loại Script:
        </label>
        <div class="relative flex items-center">
          <select
            id="script-phase-select"
            v-model="selectedPhase"
            data-test="script-phase-select"
            class="appearance-none rounded border border-border-default bg-surface-overlay px-3 py-1.5 pr-8 text-xs font-semibold text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer"
            @change="suggestions = []"
          >
            <option value="pre_request" class="bg-surface-overlay text-text-primary">
              Pre-request Script (Trước khi gửi)
            </option>
            <option value="post_response" class="bg-surface-overlay text-text-primary">
              Post-response Script (Sau khi nhận phản hồi)
            </option>
          </select>
          <div class="pointer-events-none absolute right-2.5 flex items-center text-text-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <span
          v-if="selectedPhase === 'pre_request' ? preRequestCode.trim() : postResponseCode.trim()"
          class="rounded-full bg-brand-primary/15 px-2 py-0.5 text-[10px] font-medium text-brand-primary border border-brand-primary/30"
        >
          Đang có code
        </span>
      </div>

      <div class="flex items-center gap-1.5">
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
          class="rounded border border-brand-primary/50 bg-brand-primary/10 px-2.5 py-1 text-[11px] font-semibold text-brand-primary hover:bg-brand-primary/20 whitespace-nowrap cursor-pointer"
          data-test="run-pre-script-btn"
          @click="runScriptPreview"
        >
          Chạy thử Script
        </button>
      </div>
    </div>

    <!-- Snippets Bar (Context-aware + keeping both pre/post snippet buttons accessible) -->
    <div class="flex flex-wrap items-center gap-1.5" data-test="script-snippets-bar">
      <span class="text-[11px] font-medium text-text-muted mr-1">Snippets:</span>
      <template v-if="selectedPhase === 'pre_request'">
        <button
          v-for="snip in preSnippets"
          :key="snip.id"
          type="button"
          :data-test="snip.id"
          :title="snip.title"
          class="rounded border border-border-default bg-surface-base px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:bg-surface-hover hover:text-sky-300 cursor-pointer transition-colors"
          @click="insertSnippet('pre', snip.code)"
        >
          {{ snip.label }}
        </button>
      </template>
      <template v-else>
        <button
          v-for="snip in postSnippets"
          :key="snip.id"
          type="button"
          :data-test="snip.id"
          :title="snip.title"
          class="rounded border border-border-default bg-surface-base px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:bg-surface-hover hover:text-sky-300 cursor-pointer transition-colors"
          @click="insertSnippet('post', snip.code)"
        >
          {{ snip.label }}
        </button>
      </template>
      <!-- Hidden compatibility triggers for direct test invocation when in default tab -->
      <div v-show="false" aria-hidden="true">
        <button
          v-if="selectedPhase !== 'post_response'"
          type="button"
          data-test="snippet-post-json"
          @click="insertSnippet('post', postSnippets[0].code)"
        />
        <button
          v-if="selectedPhase !== 'post_response'"
          type="button"
          data-test="snippet-post-set-env"
          @click="insertSnippet('post', postSnippets[1].code)"
        />
      </div>
    </div>

    <!-- Single Active Editor Area with JS Syntax Highlighting Overlay + Code Suggestions -->
    <div class="relative flex flex-col">
      <!-- Pre-request Script Editor (shown when selectedPhase === 'pre_request') -->
      <div v-show="selectedPhase === 'pre_request'" data-test="pre-script-panel" class="relative w-full min-h-[160px] rounded border border-border-default bg-surface-input focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/40">
        <pre
          ref="preOverlayRef"
          data-test="pre-script-syntax-overlay"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-all p-2.5 font-mono text-xs leading-relaxed"
        ><template v-for="(tok, idx) in preTokens" :key="idx"><span :data-js-token="tok.type" :class="jsTokenClass(tok.type)">{{ tok.value }}</span></template><span v-if="!preRequestCode" class="text-text-muted">// Ví dụ: ha.environment.set('timestamp', Date.now()); ha.request.query.set('v', '1');</span></pre>
        <textarea
          ref="preTextareaRef"
          v-model="preRequestCode"
          data-test="pre-request-script-input"
          rows="7"
          spellcheck="false"
          autocomplete="off"
          class="transparent-selection relative z-10 w-full min-h-[160px] resize-y rounded bg-transparent p-2.5 font-mono text-xs leading-relaxed text-transparent caret-text-primary focus:outline-none"
          @input="e => onEditorInput(e, 'pre_request')"
          @keydown="e => onEditorKeydown(e, 'pre_request')"
          @scroll="e => syncScroll(e, 'pre_request')"
          @blur="onEditorBlur"
        />
      </div>

      <!-- Post-response Script Editor (shown when selectedPhase === 'post_response') -->
      <div v-show="selectedPhase === 'post_response'" data-test="post-script-panel" class="relative w-full min-h-[160px] rounded border border-border-default bg-surface-input focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/40">
        <pre
          ref="postOverlayRef"
          data-test="post-script-syntax-overlay"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-all p-2.5 font-mono text-xs leading-relaxed"
        ><template v-for="(tok, idx) in postTokens" :key="idx"><span :data-js-token="tok.type" :class="jsTokenClass(tok.type)">{{ tok.value }}</span></template><span v-if="!postResponseCode" class="text-text-muted">// Ví dụ: const data = ha.response.json(); ha.environment.set('token', data.access_token);</span></pre>
        <textarea
          ref="postTextareaRef"
          v-model="postResponseCode"
          data-test="post-response-script-input"
          rows="7"
          spellcheck="false"
          autocomplete="off"
          class="transparent-selection relative z-10 w-full min-h-[160px] resize-y rounded bg-transparent p-2.5 font-mono text-xs leading-relaxed text-transparent caret-text-primary focus:outline-none"
          @input="e => onEditorInput(e, 'post_response')"
          @keydown="e => onEditorKeydown(e, 'post_response')"
          @scroll="e => syncScroll(e, 'post_response')"
          @blur="onEditorBlur"
        />
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

    <!-- Built-in Hints & API Quick Reference -->
    <div
      v-if="showHints"
      data-test="script-hints-box"
      class="grid grid-cols-1 md:grid-cols-3 gap-2 rounded border border-border-default bg-surface-base/70 p-2.5 text-[11px]"
    >
      <div class="space-y-1">
        <div class="font-semibold text-sky-400">1. Biến môi trường (Đầy đủ 4 cấp)</div>
        <ul class="space-y-0.5 font-mono text-[10.5px] text-text-secondary">
          <li>• <span class="text-sky-300">ha.environment.set</span>('k', 'v', 'EnvName?')</li>
          <li>• <span class="text-sky-300">ha.collectionVariables.set</span>('k', 'v')</li>
          <li>• <span class="text-sky-300">ha.folderVariables.set</span>('k', 'v', 'Folder?')</li>
          <li>• <span class="text-sky-300">ha.folderEnv.set</span>('k', 'v', 'Folder?', 'Env?')</li>
        </ul>
      </div>
      <div class="space-y-1">
        <div class="font-semibold text-amber-400">2. Request Params, Query &amp; Path (:param)</div>
        <ul class="space-y-0.5 font-mono text-[10.5px] text-text-secondary">
          <li>• <span class="text-amber-300">ha.request.query.get/set</span>('page', 2)</li>
          <li>• <span class="text-amber-300">ha.request.params.toObject</span>()</li>
          <li>• <span class="text-amber-300">ha.request.pathParams.get/set</span>('api_key', 'v')</li>
          <li>• <span class="text-amber-300">ha.request.headers.set</span>('X-Key', 'v')</li>
        </ul>
      </div>
      <div class="space-y-1">
        <div class="font-semibold text-emerald-400">3. Response Data &amp; Debug Console</div>
        <ul class="space-y-0.5 font-mono text-[10.5px] text-text-secondary">
          <li>• <span class="text-emerald-300">ha.response.json</span>() / <span class="text-emerald-300">ha.response.data</span></li>
          <li>• <span class="text-emerald-300">ha.response.code</span> / <span class="text-emerald-300">ha.response.headers.get</span>('k')</li>
          <li>• <span class="text-emerald-300">console.log/info/warn/error</span>(...)</li>
        </ul>
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
