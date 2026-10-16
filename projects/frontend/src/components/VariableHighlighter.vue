<script lang="ts" setup>
import {
  computed,
  ref,
  watch,
  inject,
  unref,
  onBeforeUnmount,
  type Ref,
  type ComputedRef
} from 'vue'
import { getActivePinia } from 'pinia'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useRequestStore } from '@/stores/requestStore'
import { parseVariables } from '@/utils/variables'
import {
  resolveHierarchyVariables,
  type FolderNodeLike
} from '@/utils/resolveHierarchyVariables'
import VariableHoverPopover, { type AnchorRectLike } from './VariableHoverPopover.vue'
import { tokenizeJsonTextSegment, type JsonSyntaxToken } from '@/utils/jsonEditor'
import { tokenizeXmlTextSegment, xmlTokenClass, type XmlSyntaxToken } from '@/utils/xmlUtils'

const HOVER_OPEN_DELAY_MS = 150
const HOVER_CLOSE_DELAY_MS = 200

const props = withDefaults(defineProps<{
  value: string;
  overlayClass?: string;
  singleLine?: boolean;
  wrap?: boolean;
  syntax?: 'plain' | 'json' | 'xml';
  enablePathParams?: boolean;
  variablesMap?: Map<string, string>;
  hierarchyFolders?: FolderNodeLike[];
}>(), {
  singleLine: false,
  wrap: true,
  syntax: 'plain',
  enablePathParams: false
})

const getJsonTokensForSegment = (idx: number, textVal: string): JsonSyntaxToken[] => {
  const list = segments.value
  const prevWasVar = idx > 0 && (list[idx - 1].type === 'resolved' || list[idx - 1].type === 'missing')
  const nextIsVar = idx + 1 < list.length && (list[idx + 1].type === 'resolved' || list[idx + 1].type === 'missing')
  return tokenizeJsonTextSegment(textVal, prevWasVar, nextIsVar)
}

const xmlSegmentStates = computed(() => {
  if (props.syntax !== 'xml') return []
  const list = segments.value
  let insideTag = false
  const states: boolean[] = []
  for (let i = 0; i < list.length; i++) {
    const seg = list[i]
    states.push(insideTag)
    if (seg.type === 'text') {
      const toks = tokenizeXmlTextSegment(seg.value, insideTag)
      insideTag = Boolean(toks.endsInsideTag)
    }
  }
  return states
})

const getXmlTokensForSegment = (idx: number, textVal: string): XmlSyntaxToken[] => {
  const startInside = xmlSegmentStates.value[idx] || false
  return tokenizeXmlTextSegment(textVal, startInside)
}

const jsonTokenClass = (type: JsonSyntaxToken['type']): string => {
  switch (type) {
    case 'key':
      return 'text-sky-300'
    case 'string':
      return 'text-emerald-300'
    case 'number':
      return 'text-amber-300'
    case 'boolean':
    case 'null':
      return 'text-purple-300'
    case 'punctuation':
      return 'text-text-secondary'
    default:
      return ''
  }
}

const instanceId = Symbol('variable-highlighter')
const hasPinia = Boolean(getActivePinia())
const envStore = hasPinia ? useEnvironmentStore() : null
const collectionStore = hasPinia ? useCollectionStore() : null
const requestStore = hasPinia ? useRequestStore() : null
const injectedVars = inject<Ref<Map<string, string>> | ComputedRef<Map<string, string>> | Map<string, string> | null>('effectiveVariables', null)
const injectedFolders = inject<Ref<FolderNodeLike[]> | ComputedRef<FolderNodeLike[]> | FolderNodeLike[] | null>('variableHierarchyFolders', null)

const isComposing = ref(false)
const liveInputValue = ref<string | null>(null)
const localRevision = ref(0)

const resolvedHierarchyFolders = computed<FolderNodeLike[]>(() => {
  void localRevision.value
  if (props.hierarchyFolders) {
    return props.hierarchyFolders
  }
  const fromInject = unref(injectedFolders)
  if (Array.isArray(fromInject)) {
    return fromInject
  }
  if (collectionStore?.activeRequestId) {
    const full = collectionStore.findFolderPath(collectionStore.tree, collectionStore.activeRequestId) || []
    return full.filter(n => n.type === 'folder')
  }
  if (collectionStore?.activeFolderId) {
    const full = collectionStore.findFolderPath(collectionStore.tree, collectionStore.activeFolderId) || []
    return full.filter(n => n.type === 'folder')
  }
  return []
})

const fallbackVariablesMap = computed(() => {
  void localRevision.value
  const activeEnvObj = envStore?.activeEnvId
    ? envStore.environments.find(e => e.id === envStore.activeEnvId)
    : null
  return resolveHierarchyVariables({
    collectionVariables: collectionStore?.activeCollection?.variables,
    activeEnvVariables: activeEnvObj?.variables ?? envStore?.variablesMap,
    pathFolders: resolvedHierarchyFolders.value,
    activeEnvId: envStore?.activeEnvId
  })
})

const hoveredVarName = ref<string | null>(null)
const hoveredVarKind = ref<'template' | 'path'>('template')
const anchorRect = ref<AnchorRectLike | null>(null)
const isMouseInPopover = ref(false)

let pendingVarName: string | null = null
let pendingVarKind: 'template' | 'path' = 'template'
let pendingRect: AnchorRectLike | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
let windowListenersAttached = false

const isFocusInsidePopover = (): boolean => {
  if (typeof document === 'undefined' || !document.activeElement) return false
  return Boolean((document.activeElement as HTMLElement).closest?.('[data-test="variable-hover-popover"]'))
}

const clearHoverTimer = () => {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  pendingVarName = null
  pendingVarKind = 'template'
  pendingRect = null
}

const clearCloseTimer = () => {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

const handleWindowKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && (hoveredVarName.value !== null || hoverTimer !== null)) {
    closePopoverImmediately()
  }
}

const handleExternalPopoverOpen = (e: Event) => {
  const ce = e as CustomEvent
  if (ce?.detail?.instanceId !== instanceId) {
    closePopoverImmediately()
  }
}

const attachWindowListeners = () => {
  if (typeof window === 'undefined' || windowListenersAttached) return
  windowListenersAttached = true
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('hecto:variable-popover-open', handleExternalPopoverOpen)
}

const removeWindowListeners = () => {
  if (typeof window === 'undefined' || !windowListenersAttached) return
  windowListenersAttached = false
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('hecto:variable-popover-open', handleExternalPopoverOpen)
}

const closePopoverImmediately = () => {
  clearHoverTimer()
  clearCloseTimer()
  hoveredVarName.value = null
  hoveredVarKind.value = 'template'
  anchorRect.value = null
  isMouseInPopover.value = false
  removeWindowListeners()
}

const scheduleClosePopover = (delay = HOVER_CLOSE_DELAY_MS) => {
  clearHoverTimer()
  if (!hoveredVarName.value) return
  if (closeTimer !== null) return
  closeTimer = setTimeout(() => {
    closeTimer = null
    if (!isMouseInPopover.value && !isFocusInsidePopover()) {
      closePopoverImmediately()
    }
  }, delay)
}

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
  closePopoverImmediately()
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
  closePopoverImmediately()
  syncLiveValue(e)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closePopoverImmediately()
    return
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter') {
      closePopoverImmediately()
    }
  }
}

const handleBlur = () => {
  isComposing.value = false
  liveInputValue.value = null
}

const effectiveValue = computed(() => {
  return liveInputValue.value !== null ? liveInputValue.value : (props.value || '')
})

const segments = computed(() => {
  void localRevision.value
  const vars = props.variablesMap || unref(injectedVars) || fallbackVariablesMap.value
  if (props.enablePathParams) {
    return parseVariables(effectiveValue.value, vars, {
      enablePathParams: true,
      pathParams: requestStore?.current?.path_params || null
    })
  }
  return parseVariables(effectiveValue.value, vars)
})

watch(segments, (newSegments) => {
  if (hoveredVarName.value) {
    const stillExists = newSegments.some(
      s => (s.type === 'resolved' || s.type === 'missing') && s.key === hoveredVarName.value
    )
    if (!stillExists) {
      closePopoverImmediately()
    }
  }
  if (pendingVarName) {
    const pendingStillExists = newSegments.some(
      s => (s.type === 'resolved' || s.type === 'missing') && s.key === pendingVarName
    )
    if (!pendingStillExists) {
      closePopoverImmediately()
    }
  }
})

const overlayRef = ref<HTMLElement | null>(null)

const toAnchorRect = (r: {
  top: number
  left: number
  bottom: number
  right: number
  width: number
  height: number
}): AnchorRectLike => ({
  top: r.top,
  left: r.left,
  bottom: r.bottom,
  right: r.right,
  width: r.width,
  height: r.height
})

const findHoveredVarSpan = (
  e: MouseEvent
): { span: HTMLElement; varName: string; varKind: 'template' | 'path'; rect: AnchorRectLike } | null => {
  const container = overlayRef.value
  if (!container) return null

  const spans = Array.from(container.querySelectorAll<HTMLElement>('[data-var-name]'))
  if (spans.length === 0) return null

  const { clientX, clientY } = e
  let anyNonZeroRect = false

  for (const span of spans) {
    const varName = span.getAttribute('data-var-name')?.trim()
    if (!varName) continue
    const varKind: 'template' | 'path' = span.getAttribute('data-var-kind') === 'path' ? 'path' : 'template'

    const clientRects =
      typeof span.getClientRects === 'function' ? Array.from(span.getClientRects()) : []
    const nonZeroRects = clientRects.filter(r => r.width > 0 || r.height > 0)

    if (nonZeroRects.length > 0) {
      anyNonZeroRect = true
      for (const r of nonZeroRects) {
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return { span, varName, varKind, rect: toAnchorRect(r) }
        }
      }
    } else if (typeof span.getBoundingClientRect === 'function') {
      const bcr = span.getBoundingClientRect()
      if (bcr.width > 0 || bcr.height > 0) {
        anyNonZeroRect = true
        if (
          clientX >= bcr.left &&
          clientX <= bcr.right &&
          clientY >= bcr.top &&
          clientY <= bcr.bottom
        ) {
          return { span, varName, varKind, rect: toAnchorRect(bcr) }
        }
      }
    }
  }

  // Fallback for synthetic test events triggered directly on [data-var-name] when DOM has zero-sized layout rects
  if (!anyNonZeroRect) {
    const targetEl = e.target as HTMLElement | null
    const targetSpan = targetEl?.closest?.('[data-var-name]') as HTMLElement | null
    if (targetSpan && container.contains(targetSpan)) {
      const varName = targetSpan.getAttribute('data-var-name')?.trim()
      const varKind: 'template' | 'path' = targetSpan.getAttribute('data-var-kind') === 'path' ? 'path' : 'template'
      if (varName) {
        const bcr =
          typeof targetSpan.getBoundingClientRect === 'function'
            ? targetSpan.getBoundingClientRect()
            : { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }
        return { span: targetSpan, varName, varKind, rect: toAnchorRect(bcr) }
      }
    }
  }

  return null
}

const handleMouseMove = (e: MouseEvent) => {
  if (isComposing.value) return

  const hit = findHoveredVarSpan(e)
  if (hit) {
    clearCloseTimer()
    if (hoveredVarName.value === hit.varName && hoveredVarKind.value === hit.varKind) {
      anchorRect.value = hit.rect
      return
    }
    if (pendingVarName === hit.varName && pendingVarKind === hit.varKind && hoverTimer !== null) {
      pendingRect = hit.rect
      return
    }
    clearHoverTimer()
    pendingVarName = hit.varName
    pendingVarKind = hit.varKind
    pendingRect = hit.rect
    attachWindowListeners()
    hoverTimer = setTimeout(() => {
      hoverTimer = null
      const targetVar = pendingVarName
      const targetKind = pendingVarKind
      const targetRect = pendingRect
      pendingVarName = null
      pendingVarKind = 'template'
      pendingRect = null
      if (!targetVar) return
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('hecto:variable-popover-open', { detail: { instanceId } })
        )
      }
      hoveredVarName.value = targetVar
      hoveredVarKind.value = targetKind
      anchorRect.value = targetRect
    }, HOVER_OPEN_DELAY_MS)
  } else {
    clearHoverTimer()
    if (hoveredVarName.value && !isMouseInPopover.value) {
      scheduleClosePopover(HOVER_CLOSE_DELAY_MS)
    } else if (!hoveredVarName.value) {
      removeWindowListeners()
    }
  }
}

const handleMouseLeave = () => {
  clearHoverTimer()
  if (hoveredVarName.value && !isMouseInPopover.value) {
    scheduleClosePopover(HOVER_CLOSE_DELAY_MS)
  } else if (!hoveredVarName.value) {
    removeWindowListeners()
  }
}

const handlePopoverMouseEnter = () => {
  isMouseInPopover.value = true
  clearCloseTimer()
}

const handlePopoverMouseLeave = () => {
  isMouseInPopover.value = false
  scheduleClosePopover(HOVER_CLOSE_DELAY_MS)
}

const handlePopoverFocusOut = () => {
  setTimeout(() => {
    if (hoveredVarName.value && !isMouseInPopover.value && !isFocusInsidePopover()) {
      scheduleClosePopover(HOVER_CLOSE_DELAY_MS)
    }
  }, 0)
}

const handlePopoverSaved = () => {
  localRevision.value++
}

const syncScroll = (e: Event) => {
  closePopoverImmediately()
  if (overlayRef.value) {
    const target = e.target as HTMLElement
    overlayRef.value.scrollTop = target.scrollTop
    overlayRef.value.scrollLeft = target.scrollLeft
  }
}

onBeforeUnmount(() => {
  closePopoverImmediately()
})

defineExpose({
  syncScroll,
  closePopoverImmediately
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
    @keydown="handleKeydown"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
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
      <div v-if="singleLine" class="flex items-center h-full min-h-full">
        <span>
          <template v-for="(seg, idx) in segments" :key="idx">
            <span v-if="seg.type === 'text'">{{ seg.value }}</span>
            <span
              v-else-if="seg.type === 'resolved'"
              :data-var-name="seg.key"
              :data-var-kind="seg.kind || undefined"
              class="text-variable-valid"
              style="color: var(--color-variable-valid)"
            >{{ seg.original }}</span>
            <span
              v-else-if="seg.type === 'missing'"
              :data-var-name="seg.key"
              :data-var-kind="seg.kind || undefined"
              style="color: var(--color-variable-missing)"
              class="italic text-variable-missing"
            >{{ seg.original || seg.value }}</span>
          </template>
        </span>
      </div>
      <template v-else>
        <template v-for="(seg, idx) in segments" :key="idx">
          <template v-if="seg.type === 'text'">
            <template v-if="syntax === 'json'">
              <span
                v-for="(tok, tIdx) in getJsonTokensForSegment(idx, seg.value)"
                :key="tIdx"
                :data-json-token="tok.type !== 'plain' ? tok.type : undefined"
                :class="jsonTokenClass(tok.type)"
              >{{ tok.value }}</span>
            </template>
            <template v-else-if="syntax === 'xml'">
              <span
                v-for="(tok, tIdx) in getXmlTokensForSegment(idx, seg.value)"
                :key="tIdx"
                :data-xml-token="tok.type !== 'plain' ? tok.type : undefined"
                :class="xmlTokenClass(tok.type)"
              >{{ tok.value }}</span>
            </template>
            <span v-else>{{ seg.value }}</span>
          </template>
          <span
            v-else-if="seg.type === 'resolved'"
            :data-var-name="seg.key"
            :data-var-kind="seg.kind || undefined"
            class="text-variable-valid"
            style="color: var(--color-variable-valid)"
          >{{ seg.original }}</span>
          <span
            v-else-if="seg.type === 'missing'"
            :data-var-name="seg.key"
            :data-var-kind="seg.kind || undefined"
            style="color: var(--color-variable-missing)"
            class="italic text-variable-missing"
          >{{ seg.original || seg.value }}</span>
        </template>
      </template>
    </div>
    
    <!-- Input/Textarea Slot -->
    <slot></slot>

    <!-- Hover Popover -->
    <VariableHoverPopover
      v-if="hoveredVarName"
      :variable-name="hoveredVarName"
      :variable-kind="hoveredVarKind"
      :anchor-rect="anchorRect"
      :hierarchy-folders="resolvedHierarchyFolders"
      @mouseenter="handlePopoverMouseEnter"
      @mouseleave="handlePopoverMouseLeave"
      @focusout="handlePopoverFocusOut"
      @close="closePopoverImmediately"
      @saved="handlePopoverSaved"
    />
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


