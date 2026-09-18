<script lang="ts" setup>
import { computed } from 'vue'
import { useRequestStore } from '@/stores/requestStore'

const requestStore = useRequestStore()

const showWarning = computed(() => {
  const req = requestStore.current
  if (!req) return false
  return req.method === 'GET' && req.body && ['json', 'text'].includes(req.body.type)
})
</script>

<template>
  <div v-if="showWarning" role="status" class="bg-warning-bg border border-warning-border rounded-md px-3 py-2 flex items-start gap-2 mx-3 mt-3">
    <svg class="w-4 h-4 text-warning-text flex-shrink-0 mt-0.5" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z"></path>
    </svg>
    <span class="text-warning-text ui-xs">Cảnh báo: Request GET không nên đi kèm Body. Body vẫn được gửi nhưng nhiều server sẽ bỏ qua.</span>
  </div>
</template>
