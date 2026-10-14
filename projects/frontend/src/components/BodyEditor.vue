<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import VariableHighlighter from '@/components/VariableHighlighter.vue'

const requestStore = useRequestStore()

const bodyType = computed(() => requestStore.current?.body?.type || 'none')
const bodyContent = computed({
  get: () => requestStore.current?.body?.content || '',
  set: (val) => {
    if (requestStore.current && requestStore.current.body) {
      requestStore.current.body.content = val
    }
  }
})

const setType = (type: 'none' | 'json' | 'text') => {
  requestStore.setBodyType(type)
}

const lineNumbers = computed(() => {
  const lines = bodyContent.value.split('\n').length
  return Array.from({ length: lines }, (_, i) => i + 1).join('\n')
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumbersRef = ref<HTMLDivElement | null>(null)
const preRef = ref<HTMLElement | null>(null)
const highlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)

const handleScroll = (e: Event) => {
  if (lineNumbersRef.value) {
    if (preRef.value) { preRef.value.style.transform = `translateY(-${(e.target as HTMLTextAreaElement).scrollTop}px)` }
  }
  highlighterRef.value?.syncScroll(e)
}

const handleTab = (e: KeyboardEvent) => {
  e.preventDefault()
  
  if (!textareaRef.value) return
  const el = textareaRef.value
  const start = el.selectionStart
  const end = el.selectionEnd
  const val = el.value

  el.value = val.substring(0, start) + '  ' + val.substring(end)
  el.selectionStart = el.selectionEnd = start + 2
  bodyContent.value = el.value
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header: Type selector -->
    <div class="px-3 py-2 flex gap-2" role="radiogroup" aria-label="Body type">
      <button 
        role="radio" 
        :aria-checked="bodyType === 'none'"
        @click="setType('none')"
        class="ui-xs rounded-full border border-default px-[10px] py-[4px] min-h-[32px]"
        :class="bodyType === 'none' ? 'bg-surface-overlay text-text-primary' : 'text-text-secondary hover:text-text-primary'"
      >None</button>
      <button 
        role="radio" 
        :aria-checked="bodyType === 'json'"
        @click="setType('json')"
        class="ui-xs rounded-full border border-default px-[10px] py-[4px] min-h-[32px]"
        :class="bodyType === 'json' ? 'bg-surface-overlay text-text-primary' : 'text-text-secondary hover:text-text-primary'"
      >JSON</button>
      <button 
        role="radio" 
        :aria-checked="bodyType === 'text'"
        @click="setType('text')"
        class="ui-xs rounded-full border border-default px-[10px] py-[4px] min-h-[32px]"
        :class="bodyType === 'text' ? 'bg-surface-overlay text-text-primary' : 'text-text-secondary hover:text-text-primary'"
      >Text</button>
    </div>

    <!-- Body content -->
    <div v-if="bodyType === 'none' || !['none', 'json', 'text'].includes(bodyType)" class="flex-1 p-3 text-text-secondary ui-sm">
      Request này không có body.
    </div>
    
    <div v-else class="flex-1 p-3 pt-0 flex flex-col min-h-0">
      <div class="flex-1 flex flex-row bg-surface-input border border-default rounded-md overflow-hidden min-h-0">
        <!-- Line numbers -->
        <div 
          ref="lineNumbersRef"
          class="w-[40px] flex-shrink-0 bg-surface-raised border-r border-default text-text-muted mono-base text-right pr-2 pt-2 pb-0 select-none overflow-hidden"
        >
          <pre ref="preRef" class="mono-base m-0" style="margin: 0; line-height: 21px; font-size: 13px;">{{ lineNumbers }}</pre>
        </div>
        <!-- Editor -->
        <VariableHighlighter
          ref="highlighterRef"
          :value="bodyContent"
          :wrap="false"
          overlay-class="p-2 pb-32 mono-base w-full h-full" style="line-height: 21px; font-size: 13px;"
          class="flex-1 w-full h-full min-w-0"
        >
          <textarea 
            ref="textareaRef"
            v-model="bodyContent"
            @input="e => { bodyContent = (e.target as HTMLTextAreaElement).value }"
            @scroll="handleScroll"
            @keydown.tab="handleTab"
            class="w-full h-full bg-transparent border-none outline-none resize-none p-2 pb-32 mono-base text-transparent caret-text-primary whitespace-pre overflow-auto" style="line-height: 21px; font-size: 13px;"
            spellcheck="false"
            autocomplete="off"
            wrap="off"
          ></textarea>
        </VariableHighlighter>
      </div>
    </div>
  </div>
</template>
