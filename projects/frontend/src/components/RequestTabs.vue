<script lang="ts" setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'

const uiStore = useUiStore()
const requestStore = useRequestStore()

const req = computed(() => requestStore.current)

const paramsCount = computed(() => {
  if (!req.value?.params) return 0
  return req.value.params.filter(p => p.key.trim() !== '').length
})

const headersCount = computed(() => {
  if (!req.value?.headers) return 0
  return req.value.headers.filter(h => h && h.enabled && !h._isAuto && typeof h.key === 'string' && h.key.trim() !== '').length
})

const isConfiguredAuth = (a: any): boolean => {
  if (!a || a.type === 'none' || a.type === 'inherit') return false
  if (a.type === 'bearer') return !!a.bearer?.token?.trim()
  if (a.type === 'basic') return !!(a.basic?.username?.trim() || a.basic?.password?.trim())
  if (a.type === 'apiKey') return !!a.apiKey?.key?.trim()
  return false
}

const authCount = computed(() => {
  let count = isConfiguredAuth(req.value?.auth) ? 1 : 0
  if (req.value?.auth_envs) {
    for (const envAuth of Object.values(req.value.auth_envs)) {
      if (isConfiguredAuth(envAuth)) count++
    }
  }
  return count
})

const scriptsCount = computed(() => {
  const s = req.value?.scripts
  if (!s) return 0
  let count = 0
  if (s.pre_request?.trim()) count++
  if (s.post_response?.trim()) count++
  return count
})

const tabs = computed(() => [
  { id: 'params', label: 'Params', count: paramsCount.value },
  { id: 'auth', label: 'Auth', count: authCount.value },
  { id: 'headers', label: 'Headers', count: headersCount.value },
  { id: 'body', label: 'Body', count: 0 },
  { id: 'scripts', label: 'Scripts', count: scriptsCount.value },
  { id: 'curl', label: 'cURL', count: 0 }
])

const activeTab = computed({
  get: () => uiStore.activeRequestTab,
  set: (val) => uiStore.activeRequestTab = val
})

const bodyType = computed(() => req.value?.body?.type || 'none')

const onBodyTypeChange = (e: Event) => {
  const val = (e.target as HTMLSelectElement).value as 'none' | 'json' | 'text' | 'xml' | 'urlencoded' | 'formdata'
  requestStore.setBodyType(val)
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
        @click="activeTab = tab.id as 'params' | 'auth' | 'headers' | 'body' | 'scripts' | 'curl'"
        class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
        :class="[
          activeTab === tab.id 
            ? 'border-brand-primary text-brand-primary' 
            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
        ]"
      >
        {{ tab.label }}
        <span 
          v-if="tab.count > 0" 
          class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
          :class="activeTab === tab.id ? 'bg-brand-primary text-white' : 'bg-surface-raised text-text-secondary'"
        >
          {{ tab.count }}
        </span>
      </button>
    </div>

    <!-- Inline Body Type Dropdown -->
    <div class="ml-auto pr-2 flex items-center gap-2 shrink-0">
      <label for="body-type-select" class="text-[11px] font-medium text-text-muted select-none">
        Body:
      </label>
      <div class="relative flex items-center">
        <select
          id="body-type-select"
          data-test="body-type-select"
          aria-label="Body type"
          :value="bodyType"
          @change="onBodyTypeChange"
          class="peer appearance-none bg-surface-overlay border border-border-default rounded px-2.5 py-1 pr-7 text-xs font-medium text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary cursor-pointer"
        >
          <option value="none" class="bg-surface-overlay text-text-primary">None</option>
          <option value="json" class="bg-surface-overlay text-text-primary">JSON</option>
          <option value="xml" class="bg-surface-overlay text-text-primary">XML</option>
          <option value="urlencoded" class="bg-surface-overlay text-text-primary">x-www-form-urlencoded</option>
          <option value="formdata" class="bg-surface-overlay text-text-primary">multipart/form-data</option>
          <option value="text" class="bg-surface-overlay text-text-primary">Text</option>
        </select>
        <div class="absolute right-2 pointer-events-none text-text-muted peer-focus:text-brand-primary flex items-center justify-center">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
