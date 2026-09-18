<script lang="ts" setup>
import { computed } from 'vue'
import { flattenHeaders } from '@/utils/responseHeaders'

const props = defineProps<{
  headers: Record<string, string[]> | null | undefined
}>()

const items = computed(() => flattenHeaders(props.headers))
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div v-if="items.length === 0" class="p-4 ui-sm text-text-muted">
      Không có header nào.
    </div>
    <div v-else class="flex flex-col">
      <div 
        v-for="(item, index) in items" 
        :key="`${item.key}-${index}`"
        class="flex border-b border-border-subtle hover:bg-surface-hover group"
      >
        <div class="w-1/3 p-2 mono-sm text-slate-300 transition-colors group-hover:text-blue-300 break-all">
          {{ item.key }}
        </div>
        <div class="w-2/3 p-2 mono-sm text-slate-400 break-all">
          {{ item.value }}
        </div>
      </div>
    </div>
  </div>
</template>
