<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import type { ExecuteResponse } from '@/stores/responseStore'
import { tryParseJson, formatJsonHtml, highlightHtmlWithSearch, splitHtmlLinesSafe } from '@/utils/jsonHighlight'
import { tryParseXml, formatXmlHtml, escapeHtml } from '@/utils/xmlUtils'

const props = withDefaults(
  defineProps<{
    response: ExecuteResponse
    mode: 'pretty' | 'raw'
    searchQuery?: string
    searchCaseSensitive?: boolean
    activeMatchIndex?: number
    wordWrap?: boolean
  }>(),
  {
    wordWrap: true
  }
)

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

const prettyLines = computed(() => {
  if ((!hasRenderedPretty.value && props.mode !== 'pretty') || !props.wordWrap) {
    return []
  }
  return splitHtmlLinesSafe(prettyHighlighted.value.html)
})

const wrappedGutterWidth = computed(() => {
  const lineCount = Math.max(1, formatted.value.lines || prettyLines.value.length)
  const digits = Math.max(2, String(lineCount).length)
  return `max(48px, calc(${digits}ch + 17px))`
})

const prettyWrappedHtml = computed(() => {
  if ((!hasRenderedPretty.value && props.mode !== 'pretty') || !props.wordWrap) {
    return ''
  }
  const lines = prettyLines.value
  const chunks: string[] = [
    `<div class="flex items-stretch w-full h-3" aria-hidden="true">` +
    `<div class="shrink-0 bg-[#090d15] border-r border-border-default select-none" style="width: var(--gutter-w);"></div>` +
    `<div class="flex-1"></div>` +
    `</div>`
  ]
  for (let i = 0; i < lines.length; i++) {
    const lineHtml = lines[i]
    chunks.push(
      `<div data-json-line="${i + 1}" class="flex items-stretch w-full">` +
      `<div class="shrink-0 bg-[#090d15] border-r border-border-default text-text-muted mono-base text-right px-2 select-none" style="width: var(--gutter-w);">${i + 1}</div>` +
      `<div class="flex-1 min-w-0 px-3 text-text-primary mono-base whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-h-[21px]"><code style="line-height: inherit; font-size: inherit; font-family: inherit;">${lineHtml}</code></div>` +
      `</div>`
    )
  }
  return chunks.join('')
})

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
  [
    () => props.response,
    () => props.searchQuery,
    () => props.searchCaseSensitive,
    () => props.activeMatchIndex,
    () => props.mode,
    () => props.wordWrap
  ],
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
      <div
        ref="prettyEl"
        v-show="props.mode === 'pretty'"
        class="absolute inset-0"
        :class="props.wordWrap ? 'flex flex-col overflow-y-auto overflow-x-hidden' : 'flex flex-row overflow-auto scroll-pl-14'"
        :style="props.wordWrap ? { '--gutter-w': wrappedGutterWidth } : { scrollPaddingLeft: '56px' }"
      >
        <template v-if="props.wordWrap">
          <div
            data-test="json-viewer-pretty-wrapped"
            class="w-full shrink-0 mono-base"
            style="line-height: 21px; font-size: 13px;"
            v-html="prettyWrappedHtml"
          ></div>
          <div class="flex flex-1 min-h-3 w-full">
            <div
              data-test="json-viewer-gutter-filler"
              class="bg-[#090d15] border-r border-border-default shrink-0 select-none"
              style="width: var(--gutter-w);"
              aria-hidden="true"
            ></div>
            <div class="flex-1" aria-hidden="true"></div>
          </div>
        </template>
        <template v-else>
          <div
            data-test="json-viewer-gutter"
            class="min-w-[48px] w-fit h-fit min-h-full flex-shrink-0 bg-[#090d15] border-r border-border-default text-text-muted mono-base text-right px-2 py-3 select-none sticky left-0 z-10"
          >
            <pre class="mono-base m-0" style="margin: 0; line-height: 21px; font-size: 13px;">{{ formatted.lineNumbers }}</pre>
          </div>
          <div class="flex-1 p-3 h-fit min-h-full">
            <pre class="mono-base m-0 whitespace-pre text-text-primary" style="margin: 0; line-height: 21px; font-size: 13px;"><code style="line-height: inherit; font-size: inherit; font-family: inherit;" v-html="prettyHighlighted.html"></code></pre>
          </div>
        </template>
      </div>
      
      <!-- Raw View -->
      <div
        ref="rawEl"
        v-show="props.mode === 'raw'"
        class="absolute inset-0 p-3"
        :class="props.wordWrap ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'"
      >
        <pre
          class="font-mono text-sm text-text-primary m-0"
          :class="props.wordWrap ? 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' : 'whitespace-pre'"
          v-html="rawHighlighted.html"
        ></pre>
      </div>
    </div>
  </div>
</template>
