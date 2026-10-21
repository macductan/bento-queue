<script lang="ts" setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'

const uiStore = useUiStore()
const requestStore = useRequestStore()

const req = computed(() => requestStore.current)

const paramsCount = computed(() => {
  const queryLen = req.value?.params ? req.value.params.filter(p => p.key.trim() !== '').length : 0
  const pathLen = req.value?.path_params ? req.value.path_params.filter(p => p.key.trim() !== '').length : 0
  return queryLen + pathLen
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

import CustomSelect from './CustomSelect.vue'

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
