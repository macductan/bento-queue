<script lang="ts" setup>
import { computed } from 'vue'
import { flattenHeaders } from '@/utils/responseHeaders'

const props = defineProps<{
  headers: Record<string, string[]> | null | undefined
}>()

const items = computed(() => flattenHeaders(props.headers))
</script>

<template>
  <div class="h-full overflow-y-auto p-3">
    <div v-if="items.length === 0" class="p-4 ui-sm text-text-muted">
      Không có header nào.
    </div>
    <div v-else class="border border-border-default rounded-md overflow-hidden bg-surface-base">
      <!-- Table Header -->
      <div class="flex items-center bg-surface-raised border-b border-border-default text-text-muted text-[11px] font-semibold uppercase tracking-wider select-none">
        <div class="w-1/3 px-3 py-2 border-r border-border-default">Key</div>
        <div class="w-2/3 px-3 py-2">Value</div>
      </div>
      <!-- Rows -->
      <div class="divide-y divide-border-default">
        <div 
          v-for="(item, index) in items" 
          :key="`${item.key}-${index}`"
          class="flex hover:bg-surface-hover/20 transition-colors group"
        >
          <div class="w-1/3 px-3 py-2 border-r border-border-default mono-sm text-slate-300 transition-colors group-hover:text-blue-300 break-all select-text">
            {{ item.key }}
          </div>
          <div class="w-2/3 px-3 py-2 mono-sm text-slate-400 break-all select-text">
            {{ item.value }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
