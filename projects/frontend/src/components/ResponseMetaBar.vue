<script lang="ts" setup>
import { computed } from 'vue'
import type { ExecuteResponse } from '@/stores/responseStore'
import { formatSize, statusTone, formatTimestamp } from '@/utils/responseMeta'

const props = defineProps<{
  response: ExecuteResponse
}>()

const toneClasses: Record<string, { badge: string; dot: string }> = {
  '2xx': {
    badge: 'bg-status-2xx-bg border-status-2xx-border text-status-2xx',
    dot: 'bg-status-2xx shadow-[0_0_8px_var(--color-status-2xx-glow)]'
  },
  '3xx': {
    badge: 'bg-status-3xx-bg border-status-3xx-border text-status-3xx',
    dot: 'bg-status-3xx'
  },
  '4xx': {
    badge: 'bg-status-4xx-bg border-status-4xx-border text-status-4xx',
    dot: 'bg-status-4xx'
  },
  '5xx': {
    badge: 'bg-status-5xx-bg border-status-5xx-border text-status-5xx',
    dot: 'bg-status-5xx'
  },
  'other': {
    badge: 'bg-surface-hover border-border-default text-text-secondary',
    dot: 'bg-text-secondary'
  }
}

const tone = computed(() => statusTone(props.response.status_code))
const badgeClass = computed(() => toneClasses[tone.value].badge)
const dotClass = computed(() => toneClasses[tone.value].dot)
const sizeText = computed(() => formatSize(props.response.size_bytes))
const timeText = computed(() => `${props.response.time_ms} ms`)
const timestampText = computed(() => formatTimestamp(props.response.timestamp))
</script>

<template>
  <div class="flex items-center font-mono text-xs" role="status">
    <div class="flex items-center gap-3 flex-1 overflow-hidden">
      <!-- Status Badge -->
      <div 
        class="flex items-center gap-1.5 border rounded-md px-2 py-1 font-bold shrink-0"
        :class="badgeClass"
      >
        
        <span class="truncate">
          {{ response.status_code }}{{ response.status_text ? ' ' + response.status_text : '' }}
        </span>
      </div>

      <!-- Time -->
      <div class="flex items-center gap-1.5 text-text-secondary shrink-0">
        <svg class="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
        </svg>
        <span>{{ timeText }}</span>
      </div>

      <!-- Size -->
      <div class="flex items-center gap-1.5 text-text-secondary shrink-0">
        <svg class="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M208,40H48A24,24,0,0,0,24,64v48a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V64A24,24,0,0,0,208,40Zm8,72a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8ZM208,120H48a24,24,0,0,0-24,24v48a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V144A24,24,0,0,0,208,120Zm8,72a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V144a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8ZM184,88a8,8,0,0,1-8,8H144a8,8,0,0,1,0-16h32A8,8,0,0,1,184,88Zm0,80a8,8,0,0,1-8,8H144a8,8,0,0,1,0-16h32A8,8,0,0,1,184,168Z" />
        </svg>
        <span>{{ sizeText }}</span>
      </div>
    </div>

    <!-- Timestamp -->
    <div v-if="timestampText" class="ui-xs text-text-muted shrink-0 ml-3 whitespace-nowrap font-sans">
      {{ timestampText }}
    </div>
  </div>
</template>
