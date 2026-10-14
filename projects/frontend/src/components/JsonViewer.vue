<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import type { ExecuteResponse } from '@/stores/responseStore'
import { isJsonContentType, tryParseJson, formatJsonHtml } from '@/utils/jsonHighlight'

const props = defineProps<{
  response: ExecuteResponse
  mode: 'pretty' | 'raw'
}>()

const hasRenderedPretty = ref(false)
const prettyEl = ref<HTMLElement | null>(null)
const rawEl = ref<HTMLElement | null>(null)


const PRETTY_DEFAULT_MAX_BYTES = 15 * 1024 * 1024 // 15MB — xem Implementation Notes spec 3.8

const isOversized = computed(() => props.response.size_bytes > PRETTY_DEFAULT_MAX_BYTES)
const isValidJson = computed(() => tryParseJson(props.response.body))

watch(() => props.response, (newRes) => {
  hasRenderedPretty.value = false
  if (!isOversized.value && isJsonContentType(newRes.headers) && isValidJson.value) {
    // mode is now a prop: 'pretty'
  } else {
    // mode is now a prop: 'raw'
  }
  
  if (props.mode === 'pretty') {
    hasRenderedPretty.value = true
  }

  nextTick(() => {
    for (const el of [prettyEl.value, rawEl.value]) {
      if (el) {
        el.scrollTop = 0
        el.scrollLeft = 0
      }
    }
  })
}, { immediate: true })


const formatted = computed(() => {
  if (!hasRenderedPretty.value) return { html: '', lines: 0, lineNumbers: '' }
  const res = formatJsonHtml(props.response.body)
  const lineNumbers = Array.from({ length: res.lines }, (_, i) => i + 1).join('\n')
  return { ...res, lineNumbers }
})

</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 bg-[#0b0f19]">
    <!-- Content -->
    <div class="flex-1 flex flex-row min-h-0 relative">
      <!-- Pretty View -->
      <div ref="prettyEl" v-show="props.mode === 'pretty'" class="absolute inset-0 flex flex-row overflow-auto">
        <div class="w-[48px] flex-shrink-0 bg-[#090d15] border-r border-border-default text-text-muted mono-base text-right pr-2 py-3 select-none sticky left-0 z-10">
          <pre class="mono-base m-0" style="margin: 0; line-height: 21px; font-size: 13px;">{{ formatted.lineNumbers }}</pre>
        </div>
        <div class="flex-1 p-3">
          <pre class="mono-base m-0 whitespace-pre text-text-primary" style="margin: 0; line-height: 21px; font-size: 13px;"><code style="line-height: inherit; font-size: inherit; font-family: inherit;" v-html="formatted.html"></code></pre>
        </div>
      </div>
      
      <!-- Raw View -->
      <div ref="rawEl" v-show="props.mode === 'raw'" class="absolute inset-0 overflow-auto p-3">
        <pre class="font-mono text-sm text-text-primary whitespace-pre-wrap break-all m-0">{{ response.body }}</pre>
      </div>
    </div>
  </div>
</template>
