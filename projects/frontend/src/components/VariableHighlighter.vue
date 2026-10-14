<script lang="ts" setup>
import { computed, ref, watch, inject, type Ref, type ComputedRef } from 'vue'
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

const isComposing = ref(false)
const liveInputValue = ref<string | null>(null)

watch(() => props.value, (newVal) => {
  if (!isComposing.value || liveInputValue.value === newVal) {
    liveInputValue.value = null
  }
})

const syncLiveValue = (e: Event) => {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | null
  if (target && typeof target.value === 'string') {
    liveInputValue.value = target.value
  }
}

const handleCompositionStart = (e: CompositionEvent) => {
  isComposing.value = true
  syncLiveValue(e)
}

const handleCompositionUpdate = (e: CompositionEvent) => {
  isComposing.value = true
  syncLiveValue(e)
}

const handleCompositionEnd = (e: CompositionEvent) => {
  isComposing.value = false
  syncLiveValue(e)
}

const handleInput = (e: Event) => {
  const ie = e as InputEvent
  const target = e.target as any
  if (ie?.isComposing || target?.composing) {
    isComposing.value = true
  }
  syncLiveValue(e)
}

const handleBlur = () => {
  isComposing.value = false
  liveInputValue.value = null
}

const effectiveValue = computed(() => {
  return liveInputValue.value !== null ? liveInputValue.value : (props.value || '')
})

const segments = computed(() => {
  const vars = props.variablesMap || injectedVars?.value || envStore.variablesMap
  return parseVariables(effectiveValue.value, vars)
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
  <div
    class="relative w-full h-full flex flex-col min-h-0 min-w-0 flex-1"
    :class="{ 'is-ime-composing': isComposing }"
    @compositionstart="handleCompositionStart"
    @compositionupdate="handleCompositionUpdate"
    @compositionend="handleCompositionEnd"
    @input="handleInput"
    @blur.capture="handleBlur"
  >
    <!-- Overlay -->
    <div 
      ref="overlayRef"
      class="absolute inset-0 pointer-events-none hide-scrollbar text-text-primary"
      :class="[
        overlayClass, 
        singleLine ? 'whitespace-pre overflow-hidden' : (wrap ? 'whitespace-pre-wrap break-all overflow-auto' : 'whitespace-pre overflow-auto hide-scrollbar'),
        { 'opacity-0': isComposing }
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
.is-ime-composing :slotted(input),
.is-ime-composing :slotted(textarea) {
  color: var(--color-text-primary) !important;
  -webkit-text-fill-color: var(--color-text-primary) !important;
}
</style>

