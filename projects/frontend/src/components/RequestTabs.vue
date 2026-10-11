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

const authCount = computed(() => {
  const a = req.value?.auth
  if (!a || a.type === 'none' || a.type === 'inherit') return 0
  if (a.type === 'bearer') return a.bearer?.token?.trim() ? 1 : 0
  if (a.type === 'basic') return (a.basic?.username?.trim() || a.basic?.password?.trim()) ? 1 : 0
  if (a.type === 'apiKey') return a.apiKey?.key?.trim() ? 1 : 0
  return 0
})

const tabs = computed(() => [
  { id: 'params', label: 'Params', count: paramsCount.value },
  { id: 'auth', label: 'Auth', count: authCount.value },
  { id: 'headers', label: 'Headers', count: headersCount.value },
  { id: 'body', label: 'Body', count: 0 }
])

const activeTab = computed({
  get: () => uiStore.activeRequestTab,
  set: (val) => uiStore.activeRequestTab = val
})
</script>

<template>
  <div class="flex border-b border-border-default" role="tablist" aria-label="Request tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      role="tab"
      :aria-selected="activeTab === tab.id"
      :aria-controls="`panel-${tab.id}`"
      :id="`tab-${tab.id}`"
      @click="activeTab = tab.id as 'params' | 'auth' | 'headers' | 'body'"
      class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
      :class="[
        activeTab === tab.id 
          ? 'border-brand-primary text-blue-400' 
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
</template>
