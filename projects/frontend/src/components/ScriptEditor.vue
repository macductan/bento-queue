<script setup lang="ts">
import { computed } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'
import { executeScript } from '@/utils/scriptRunner'

const requestStore = useRequestStore()
const responseStore = useResponseStore()
const envStore = useEnvironmentStore()
const collectionStore = useCollectionStore()

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
}

async function runPreRequestPreview() {
  if (!requestStore.current) return
  responseStore.scriptLogs = []
  responseStore.scriptError = null
  const pathNodes = (
    collectionStore.findFolderPath(collectionStore.tree, requestStore.current.id) || []
  ).filter(n => n.type === 'folder')
  const vars = resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: pathNodes,
    activeEnvId: envStore.activeEnvId
  })
  const res = executeScript(preRequestCode.value, { variables: vars })
  if (res.logs.length > 0) {
    responseStore.scriptLogs.push(...res.logs.map(l => `[Pre-request] ${l}`))
  }
  if (Object.keys(res.envUpdates).length > 0) {
    await envStore.applyVariableUpdates(res.envUpdates)
  }
  if (!res.success) {
    responseStore.scriptError = res.error || 'Lỗi thực thi Pre-request Script'
  }
}
</script>

<template>
  <div class="flex flex-col gap-2 p-2.5 text-xs" data-test="script-editor">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <!-- Pre-request Script -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-1.5 min-h-[26px]">
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <span class="font-semibold text-text-primary whitespace-nowrap">Pre-request Script</span>
            <span class="text-[11px] text-text-muted truncate">(Trước khi gửi)</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="shrink-0 rounded border border-border-default bg-surface-base px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:bg-surface-hover whitespace-nowrap"
              data-test="snippet-pre-set-env"
              @click="insertSnippet('pre', `ha.environment.set('token', 'value');`)"
            >
              + ha.environment.set
            </button>
            <button
              type="button"
              class="shrink-0 rounded border border-brand-primary/50 bg-brand-primary/10 px-2 py-0.5 text-[11px] font-medium text-brand-primary hover:bg-brand-primary/20 whitespace-nowrap"
              data-test="run-pre-script-btn"
              @click="runPreRequestPreview"
            >
              Chạy thử
            </button>
          </div>
        </div>
        <textarea
          v-model="preRequestCode"
          data-test="pre-request-script-input"
          rows="4"
          spellcheck="false"
          placeholder="// Ví dụ: ha.environment.set('timestamp', Date.now());"
          class="w-full min-h-[88px] resize-y rounded border border-border-default bg-surface-input p-2 font-mono text-xs leading-relaxed text-text-primary focus:border-brand-primary focus:outline-none"
        />
      </div>

      <!-- Post-response Script -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-1.5 min-h-[26px]">
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <span class="font-semibold text-text-primary whitespace-nowrap">Post-response Script</span>
            <span class="text-[11px] text-text-muted truncate">(Sau khi nhận)</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="shrink-0 rounded border border-border-default bg-surface-base px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:bg-surface-hover whitespace-nowrap"
              data-test="snippet-post-json"
              @click="insertSnippet('post', `{\n  const body = ha.response.json();\n  ha.environment.set('auth_token', body.token);\n}`)"
            >
              + ha.response.json()
            </button>
            <button
              type="button"
              class="shrink-0 rounded border border-border-default bg-surface-base px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:bg-surface-hover whitespace-nowrap"
              data-test="snippet-post-set-env"
              @click="insertSnippet('post', `ha.environment.set('status_code', ha.response.code);`)"
            >
              + ha.environment.set
            </button>
          </div>
        </div>
        <textarea
          v-model="postResponseCode"
          data-test="post-response-script-input"
          rows="4"
          spellcheck="false"
          placeholder="// Ví dụ: const data = ha.response.json(); ha.environment.set('token', data.access_token);"
          class="w-full min-h-[88px] resize-y rounded border border-border-default bg-surface-input p-2 font-mono text-xs leading-relaxed text-text-primary focus:border-brand-primary focus:outline-none"
        />
      </div>
    </div>

    <!-- Execution Output & Logs -->
    <div
      class="flex flex-col gap-1 rounded border border-border-default bg-surface-base p-2"
      data-test="script-execution-output"
    >
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Console &amp; Script Output
        </span>
        <button
          v-if="responseStore.scriptLogs.length > 0 || responseStore.scriptError"
          type="button"
          class="text-[11px] text-text-muted hover:text-text-primary"
          data-test="clear-script-logs-btn"
          @click="responseStore.scriptLogs = []; responseStore.scriptError = null"
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
        class="max-h-36 overflow-y-auto space-y-1 p-1 font-mono text-[11px] leading-relaxed text-emerald-300"
      >
        <div v-for="(line, idx) in responseStore.scriptLogs" :key="idx" class="py-0.5">
          {{ line }}
        </div>
      </div>

      <div
        v-else-if="!responseStore.scriptError"
        class="font-mono text-[11px] text-text-muted"
      >
        Chưa có log thực thi. Hỗ trợ: ha.environment.get(k), ha.environment.set(k, v), ha.response.json(), ha.response.text(), ha.response.code, console.log(...).
      </div>
    </div>
  </div>
</template>
