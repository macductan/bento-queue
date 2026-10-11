<script lang="ts" setup>
import { computed, ref, inject, type Ref, type ComputedRef } from 'vue'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { parseVariables } from '@/utils/variables'

const props = withDefaults(defineProps<{
  value: string;
  overlayClass?: string;
  singleLine?: boolean;
  wrap?: boolean;
  variablesMap?: Map<string, string>;
}>(), {
  singleLine: false,
  wrap: true
})

const envStore = useEnvironmentStore()
const injectedVars = inject<Ref<Map<string, string>> | ComputedRef<Map<string, string>> | null>('effectiveVariables', null)

const segments = computed(() => {
  const vars = props.variablesMap || injectedVars?.value || envStore.variablesMap
  return parseVariables(props.value || '', vars)
})

const overlayRef = ref<HTMLElement | null>(null)

const syncScroll = (e: Event) => {
  if (overlayRef.value) {
    const target = e.target as HTMLElement
    overlayRef.value.scrollTop = target.scrollTop
    overlayRef.value.scrollLeft = target.scrollLeft
  }
}

defineExpose({
  syncScroll
})
</script>

<template>
  <div class="relative w-full h-full flex flex-col min-h-0 min-w-0 flex-1">
    <!-- Overlay -->
    <div 
      ref="overlayRef"
      class="absolute inset-0 pointer-events-none hide-scrollbar text-text-primary"
      :class="[
        overlayClass, 
        singleLine ? 'whitespace-pre overflow-hidden' : (wrap ? 'whitespace-pre-wrap break-all overflow-auto' : 'whitespace-pre overflow-auto hide-scrollbar')
      ]"
      aria-hidden="true"
    >
      <div v-if="singleLine" class="flex items-center h-full">
        <span>
          <template v-for="(seg, idx) in segments" :key="idx">
            <span v-if="seg.type === 'text'">{{ seg.value }}</span>
            <span v-else-if="seg.type === 'resolved'" class="text-variable-valid" style="color: var(--color-variable-valid)">{{ seg.original }}</span>
            <span v-else-if="seg.type === 'missing'" style="color: var(--color-variable-missing)" class="italic text-variable-missing">{{ seg.original || seg.value }}</span>
          </template>
        </span>
      </div>
      <template v-else>
        <template v-for="(seg, idx) in segments" :key="idx">
          <span v-if="seg.type === 'text'">{{ seg.value }}</span>
          <span v-else-if="seg.type === 'resolved'" class="text-variable-valid" style="color: var(--color-variable-valid)">{{ seg.original }}</span>
          <span v-else-if="seg.type === 'missing'" style="color: var(--color-variable-missing)" class="italic text-variable-missing">{{ seg.original || seg.value }}</span>
        </template>
      </template>
    </div>
    
    <!-- Input/Textarea Slot -->
    <slot></slot>
  </div>
</template>

<style scoped>
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
