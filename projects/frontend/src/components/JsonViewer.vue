<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import type { ExecuteResponse } from '@/stores/responseStore'
import { tryParseJson, formatJsonHtml, highlightHtmlWithSearch } from '@/utils/jsonHighlight'
import { tryParseXml, formatXmlHtml, escapeHtml } from '@/utils/xmlUtils'

const props = defineProps<{
  response: ExecuteResponse
  mode: 'pretty' | 'raw'
  searchQuery?: string
  searchCaseSensitive?: boolean
  activeMatchIndex?: number
}>()

const emit = defineEmits<{
  (e: 'update:matchCount', count: number): void
}>()

const hasRenderedPretty = ref(false)
const prettyEl = ref<HTMLElement | null>(null)
const rawEl = ref<HTMLElement | null>(null)

const isValidJson = computed(() => tryParseJson(props.response.body))
const isValidXml = computed(() => tryParseXml(props.response.body))

watch(() => props.response, () => {
  hasRenderedPretty.value = false
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

watch(() => props.mode, (newMode) => {
  if (newMode === 'pretty') {
    hasRenderedPretty.value = true
  }
})

const formatted = computed(() => {
  if (!hasRenderedPretty.value && props.mode !== 'pretty') return { html: '', lines: 0, lineNumbers: '' }
  let res: { html: string; lines: number }
  if (isValidJson.value) {
    res = formatJsonHtml(props.response.body)
  } else if (isValidXml.value) {
    res = formatXmlHtml(props.response.body)
  } else {
    res = { html: escapeHtml(props.response.body), lines: props.response.body.split('\n').length }
  }
  const lineNumbers = Array.from({ length: res.lines }, (_, i) => i + 1).join('\n')
  return { ...res, lineNumbers }
})

const prettyHighlighted = computed(() => {
  if (props.mode !== 'pretty') {
    return { html: formatted.value.html, matchCount: 0 }
  }
  return highlightHtmlWithSearch(
    formatted.value.html,
    props.searchQuery || '',
    Boolean(props.searchCaseSensitive),
    props.activeMatchIndex ?? 0
  )
})

const rawHighlighted = computed(() => {
  if (props.mode !== 'raw') {
    return { html: '', matchCount: 0 }
  }
  const baseHtml = escapeHtml(props.response.body || '')
  return highlightHtmlWithSearch(
    baseHtml,
    props.searchQuery || '',
    Boolean(props.searchCaseSensitive),
    props.activeMatchIndex ?? 0
  )
})

const currentMatchCount = computed(() =>
  props.mode === 'pretty' ? prettyHighlighted.value.matchCount : rawHighlighted.value.matchCount
)

watch(currentMatchCount, (count) => {
  emit('update:matchCount', count)
}, { immediate: true })

const scrollToActiveMatch = () => {
  if (!props.searchQuery || currentMatchCount.value === 0) return
  nextTick(() => {
    const container = props.mode === 'pretty' ? prettyEl.value : rawEl.value
    if (!container) return
    const activeMark = container.querySelector('mark[data-active-match="true"]') as HTMLElement | null
    if (activeMark && typeof activeMark.scrollIntoView === 'function') {
      activeMark.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  })
}

watch(
  [() => props.response, () => props.searchQuery, () => props.searchCaseSensitive, () => props.activeMatchIndex, () => props.mode],
  () => {
    scrollToActiveMatch()
  }
)

defineExpose({
  scrollToActiveMatch
})
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 bg-[#0b0f19]">
    <!-- Content -->
    <div class="flex-1 flex flex-row min-h-0 relative">
      <!-- Pretty View -->
      <div ref="prettyEl" v-show="props.mode === 'pretty'" class="absolute inset-0 flex flex-row overflow-auto scroll-pl-14" style="scroll-padding-left: 56px;">
        <div
          data-test="json-viewer-gutter"
          class="min-w-[48px] w-fit h-fit min-h-full flex-shrink-0 bg-[#090d15] border-r border-border-default text-text-muted mono-base text-right px-2 py-3 select-none sticky left-0 z-10"
        >
          <pre class="mono-base m-0" style="margin: 0; line-height: 21px; font-size: 13px;">{{ formatted.lineNumbers }}</pre>
        </div>
        <div class="flex-1 p-3 h-fit min-h-full">
          <pre class="mono-base m-0 whitespace-pre text-text-primary" style="margin: 0; line-height: 21px; font-size: 13px;"><code style="line-height: inherit; font-size: inherit; font-family: inherit;" v-html="prettyHighlighted.html"></code></pre>
        </div>
      </div>
      
      <!-- Raw View -->
      <div ref="rawEl" v-show="props.mode === 'raw'" class="absolute inset-0 overflow-auto p-3">
        <pre class="font-mono text-sm text-text-primary whitespace-pre-wrap break-all m-0" v-html="rawHighlighted.html"></pre>
      </div>
    </div>
  </div>
</template>
