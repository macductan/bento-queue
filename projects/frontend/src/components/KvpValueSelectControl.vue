<script lang="ts" setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '@/i18n'

const props = withDefaults(
  defineProps<{
    modelValue: string
    type?: string
    options?: string[]
    disabled?: boolean
    readonly?: boolean
    hideControls?: boolean
    compact?: boolean
    placeholder?: string
  }>(),
  {
    type: 'text',
    options: () => [],
    disabled: false,
    readonly: false,
    hideControls: false,
    compact: false
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:type', value: 'text' | 'select'): void
  (e: 'update:options', value: string[]): void
  (e: 'select', value: string): void
  (e: 'add-option', value: string): void
  (e: 'portal-mouseenter'): void
  (e: 'portal-mouseleave'): void
}>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const triggerBtnRef = ref<HTMLButtonElement | null>(null)
const editOptionsBtnRef = ref<HTMLButtonElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const optionsPopoverRef = ref<HTMLElement | null>(null)
const inlineAddInputRef = ref<HTMLInputElement | null>(null)
const popoverAddInputRef = ref<HTMLInputElement | null>(null)

const isDropdownOpen = ref(false)
const isOptionsOpen = ref(false)
const isAddingInline = ref(false)
const inlineNewOption = ref('')
const inlineError = ref('')
const popoverNewOption = ref('')
const popoverError = ref('')

const dropdownStyle = ref<Record<string, string>>({})
const optionsPopoverStyle = ref<Record<string, string>>({})

const isSelect = computed(() => props.type === 'select')
const isInteractive = computed(() => !props.disabled && !props.readonly && !props.hideControls)
const normalizedOptions = computed<string[]>(() =>
  Array.isArray(props.options) ? props.options : []
)

const isOutOfList = computed(
  () => isSelect.value && props.modelValue !== '' && !normalizedOptions.value.includes(props.modelValue)
)

const displayText = computed(() => {
  if (props.modelValue === '') {
    return props.placeholder || t('kvp.selectValuePlaceholder')
  }
  if (isOutOfList.value) {
    return `${props.modelValue} (${t('kvp.outOfList')})`
  }
  return props.modelValue
})

const computeFixedPosition = (
  anchorEl: HTMLElement | null,
  preferredWidth: number,
  estimatedHeight: number,
  alignRight = false
): Record<string, string> => {
  if (!anchorEl || typeof window === 'undefined') {
    return {
      top: '16px',
      left: '16px',
      minWidth: `${preferredWidth}px`
    }
  }
  const rect = anchorEl.getBoundingClientRect()
  const vw = window.innerWidth > 0 ? window.innerWidth : 1024
  const vh = window.innerHeight > 0 ? window.innerHeight : 768
  const gap = 4

  let top = rect.bottom + gap
  if (top + estimatedHeight > vh - 8 && rect.top - estimatedHeight - gap >= 8) {
    top = rect.top - estimatedHeight - gap
  }
  top = Math.max(8, Math.min(top, Math.max(8, vh - estimatedHeight - 8)))

  const width = Math.max(preferredWidth, Math.round(rect.width))
  let left = alignRight ? rect.right - width : rect.left
  if (left + width > vw - 8) {
    left = Math.max(8, vw - width - 8)
  }
  if (left < 8) {
    left = 8
  }

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: `${width}px`
  }
}

const closePortals = () => {
  isDropdownOpen.value = false
  isOptionsOpen.value = false
  isAddingInline.value = false
  inlineNewOption.value = ''
  inlineError.value = ''
  popoverNewOption.value = ''
  popoverError.value = ''
}

const toggleMode = () => {
  if (!isInteractive.value) return
  closePortals()
  if (isSelect.value) {
    emit('update:type', 'text')
  } else {
    if (normalizedOptions.value.length === 0 && props.modelValue !== '' && props.modelValue.trim() !== '') {
      emit('update:options', [props.modelValue])
    }
    emit('update:type', 'select')
  }
}

const toggleDropdown = () => {
  if (props.disabled || props.readonly) return
  if (isDropdownOpen.value) {
    isDropdownOpen.value = false
    isAddingInline.value = false
    inlineError.value = ''
    return
  }
  isOptionsOpen.value = false
  isAddingInline.value = false
  inlineNewOption.value = ''
  inlineError.value = ''
  dropdownStyle.value = computeFixedPosition(triggerBtnRef.value, 220, 240, false)
  isDropdownOpen.value = true
}

const toggleOptionsPopover = () => {
  if (!isInteractive.value) return
  if (isOptionsOpen.value) {
    isOptionsOpen.value = false
    popoverError.value = ''
    return
  }
  isDropdownOpen.value = false
  popoverNewOption.value = ''
  popoverError.value = ''
  optionsPopoverStyle.value = computeFixedPosition(editOptionsBtnRef.value, 260, 260, true)
  isOptionsOpen.value = true
  nextTick(() => popoverAddInputRef.value?.focus())
}

const selectOption = (opt: string) => {
  if (props.disabled || props.readonly) return
  emit('update:modelValue', opt)
  emit('select', opt)
  closePortals()
}

const startInlineAdd = () => {
  isAddingInline.value = true
  inlineNewOption.value = ''
  inlineError.value = ''
  nextTick(() => inlineAddInputRef.value?.focus())
}

const confirmInlineAdd = () => {
  const trimmed = inlineNewOption.value.trim()
  if (!trimmed) {
    inlineError.value = t('kvp.emptyOptionError')
    return
  }
  if (!normalizedOptions.value.includes(trimmed)) {
    emit('update:options', [...normalizedOptions.value, trimmed])
  }
  emit('update:modelValue', trimmed)
  emit('add-option', trimmed)
  emit('select', trimmed)
  closePortals()
}

const confirmPopoverAdd = () => {
  const trimmed = popoverNewOption.value.trim()
  if (!trimmed) {
    popoverError.value = t('kvp.emptyOptionError')
    return
  }
  if (normalizedOptions.value.includes(trimmed)) {
    popoverError.value = t('kvp.duplicateOption')
    return
  }
  emit('update:options', [...normalizedOptions.value, trimmed])
  popoverNewOption.value = ''
  popoverError.value = ''
  nextTick(() => popoverAddInputRef.value?.focus())
}

const updateOptionAt = (idx: number, rawVal: string, inputEl?: HTMLInputElement | null) => {
  const trimmed = rawVal.trim()
  if (!trimmed) {
    popoverError.value = t('kvp.emptyOptionError')
    if (inputEl) inputEl.value = normalizedOptions.value[idx] ?? ''
    return
  }
  const duplicate = normalizedOptions.value.some((o, i) => i !== idx && o === trimmed)
  if (duplicate) {
    popoverError.value = t('kvp.duplicateOption')
    if (inputEl) inputEl.value = normalizedOptions.value[idx] ?? ''
    return
  }
  popoverError.value = ''
  if (normalizedOptions.value[idx] === trimmed) return
  const next = [...normalizedOptions.value]
  next[idx] = trimmed
  emit('update:options', next)
}

const removeOptionAt = (idx: number) => {
  popoverError.value = ''
  const next = normalizedOptions.value.filter((_, i) => i !== idx)
  emit('update:options', next)
}

const handleWindowMousedown = (e: MouseEvent) => {
  const target = e.target as Node | null
  if (!target) return
  if (
    rootRef.value?.contains(target) ||
    dropdownRef.value?.contains(target) ||
    optionsPopoverRef.value?.contains(target)
  ) {
    return
  }
  if (
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement &&
    optionsPopoverRef.value?.contains(document.activeElement)
  ) {
    document.activeElement.blur()
  }
  closePortals()
}

const handleWindowKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && (isDropdownOpen.value || isOptionsOpen.value)) {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    if (
      isDropdownOpen.value &&
      isAddingInline.value &&
      typeof document !== 'undefined' &&
      document.activeElement === inlineAddInputRef.value
    ) {
      isAddingInline.value = false
      inlineError.value = ''
      return
    }
    closePortals()
  }
}

const updatePortalPositions = () => {
  if (isDropdownOpen.value) {
    dropdownStyle.value = computeFixedPosition(triggerBtnRef.value, 220, 240, false)
  }
  if (isOptionsOpen.value) {
    optionsPopoverStyle.value = computeFixedPosition(editOptionsBtnRef.value, 260, 260, true)
  }
}

let listenersAttached = false
const attachListeners = () => {
  if (typeof window === 'undefined' || listenersAttached) return
  listenersAttached = true
  window.addEventListener('mousedown', handleWindowMousedown, true)
  window.addEventListener('keydown', handleWindowKeydown, true)
  window.addEventListener('resize', updatePortalPositions)
  window.addEventListener('scroll', updatePortalPositions, true)
}

const detachListeners = () => {
  if (typeof window === 'undefined' || !listenersAttached) return
  listenersAttached = false
  window.removeEventListener('mousedown', handleWindowMousedown, true)
  window.removeEventListener('keydown', handleWindowKeydown, true)
  window.removeEventListener('resize', updatePortalPositions)
  window.removeEventListener('scroll', updatePortalPositions, true)
}

watch(
  () => isDropdownOpen.value || isOptionsOpen.value,
  (open) => {
    if (open) {
      attachListeners()
    } else {
      detachListeners()
    }
  }
)

watch(isSelect, (val) => {
  if (!val) {
    closePortals()
  }
})

onUnmounted(() => {
  detachListeners()
})
</script>

<template>
  <div ref="rootRef" class="flex items-center w-full min-w-0 gap-1">
    <!-- Value Area: slot when text, 1-click dropdown trigger when select -->
    <div class="flex-1 min-w-0 flex items-center">
      <slot v-if="!isSelect" />

      <button
        v-else
        ref="triggerBtnRef"
        type="button"
        data-test="kvp-select-trigger"
        :disabled="disabled || readonly"
        :aria-expanded="isDropdownOpen"
        aria-haspopup="listbox"
        :class="[
          'w-full flex items-center justify-between gap-1.5 text-left mono-sm rounded transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand-primary',
          compact ? 'px-2.5 py-1.5 text-xs bg-surface-input border border-border-default min-h-[28px]' : 'px-3 py-1.5 min-h-[36px] bg-transparent',
          disabled || readonly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-hover/40',
          isOutOfList
            ? 'text-amber-300'
            : modelValue === ''
              ? 'text-text-muted/70'
              : 'text-text-primary'
        ]"
        @click.stop="toggleDropdown"
      >
        <span class="truncate flex-1 flex items-center gap-1.5 min-w-0">
          <span v-if="isOutOfList" class="truncate">{{ modelValue }}</span>
          <span
            v-if="isOutOfList"
            data-test="kvp-out-of-list-badge"
            class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0 font-sans"
          >({{ t('kvp.outOfList') }})</span>
          <span v-else class="truncate">{{ displayText }}</span>
        </span>
        <svg
          class="w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-150"
          :class="{ 'rotate-180 text-brand-primary': isDropdownOpen }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>

    <!-- Action Controls: Edit Options + Text <-> Select Toggle -->
    <div v-if="!hideControls && !readonly" class="flex items-center gap-1 shrink-0 pr-1.5">
      <button
        v-if="isSelect"
        ref="editOptionsBtnRef"
        type="button"
        data-test="kvp-edit-options-btn"
        :disabled="disabled"
        :title="t('kvp.editOptions')"
        :aria-label="t('kvp.editOptions')"
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
        :class="{ 'text-brand-primary bg-brand-primary/10': isOptionsOpen }"
        @click.stop="toggleOptionsPopover"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </button>

      <button
        type="button"
        data-test="kvp-mode-toggle-btn"
        :disabled="disabled"
        :title="isSelect ? t('kvp.switchToText') : t('kvp.switchToSelect')"
        :aria-label="isSelect ? t('kvp.switchToText') : t('kvp.switchToSelect')"
        :aria-pressed="isSelect"
        class="px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary select-none"
        :class="
          isSelect
            ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/40 hover:bg-brand-primary/25'
            : 'bg-surface-raised/60 text-text-muted border-border-default/70 hover:text-text-primary hover:border-border-default'
        "
        @click.stop="toggleMode"
      >
        {{ isSelect ? t('kvp.modeSelect') : t('kvp.modeText') }}
      </button>
    </div>

    <!-- 1-Click Dropdown (Teleported to body) -->
    <Teleport to="body">
      <div
        v-if="isDropdownOpen"
        ref="dropdownRef"
        data-kvp-portal="true"
        data-test="kvp-select-dropdown"
        role="listbox"
        :style="dropdownStyle"
        class="fixed z-[10000] max-w-[360px] rounded-md bg-surface-overlay border border-border-default shadow-2xl py-1 text-xs text-text-primary flex flex-col"
        @mousedown.stop
        @click.stop
        @mouseenter="emit('portal-mouseenter')"
        @mouseleave="emit('portal-mouseleave')"
      >
        <!-- Current out-of-list value preserved at top -->
        <button
          v-if="isOutOfList"
          type="button"
          data-test="kvp-dropdown-out-of-list"
          role="option"
          aria-selected="true"
          class="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left bg-amber-500/10 text-amber-300 border-b border-border-default cursor-pointer"
          @click="closePortals"
        >
          <span class="font-mono truncate">{{ modelValue }}</span>
          <span class="text-[10px] shrink-0">({{ t('kvp.outOfList') }})</span>
        </button>

        <!-- Defined Options -->
        <div class="max-h-48 overflow-y-auto divide-y divide-border-default/30">
          <button
            v-for="(opt, idx) in normalizedOptions"
            :key="`${idx}-${opt}`"
            type="button"
            role="option"
            :data-test="`kvp-select-option-${opt}`"
            :aria-selected="modelValue === opt"
            class="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left font-mono transition-colors cursor-pointer"
            :class="modelValue === opt ? 'bg-brand-primary/15 text-brand-primary font-semibold' : 'text-text-primary hover:bg-surface-hover'"
            @click="selectOption(opt)"
          >
            <span class="truncate">{{ opt }}</span>
            <svg
              v-if="modelValue === opt"
              class="w-3.5 h-3.5 text-brand-primary shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>

          <div v-if="normalizedOptions.length === 0" class="px-3 py-2 text-text-muted text-[11px] italic">
            {{ t('kvp.noOptions') }}
          </div>
        </div>

        <!-- Quick Add Option (+ Thêm lựa chọn...) -->
        <div class="border-t border-border-default mt-1 pt-1 px-2 pb-1">
          <button
            v-if="!isAddingInline"
            type="button"
            data-test="kvp-add-option-trigger"
            class="w-full text-left px-2 py-1 rounded text-brand-primary hover:bg-brand-primary/10 font-medium transition-colors cursor-pointer"
            @click="startInlineAdd"
          >
            {{ t('kvp.addOption') }}
          </button>

          <div v-else class="flex flex-col gap-1">
            <div class="flex items-center gap-1">
              <input
                ref="inlineAddInputRef"
                v-model="inlineNewOption"
                data-test="kvp-add-option-input"
                type="text"
                :placeholder="t('kvp.addOptionPlaceholder')"
                class="flex-1 min-w-0 bg-surface-input border border-border-default rounded px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary"
                spellcheck="false"
                autocomplete="off"
                @keydown.enter.prevent="confirmInlineAdd"
                @keydown.esc.stop.prevent="isAddingInline = false"
              />
              <button
                type="button"
                data-test="kvp-add-option-confirm"
                class="px-2 py-1 rounded bg-brand-primary text-white text-[11px] font-medium hover:bg-brand-hover cursor-pointer shrink-0"
                @click="confirmInlineAdd"
              >
                {{ t('common.add') }}
              </button>
            </div>
            <span v-if="inlineError" data-test="kvp-add-option-error" class="text-[10px] text-red-400 px-0.5">
              {{ inlineError }}
            </span>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Options Editor Popover (Teleported to body) -->
    <Teleport to="body">
      <div
        v-if="isOptionsOpen"
        ref="optionsPopoverRef"
        data-kvp-portal="true"
        data-test="kvp-options-popover"
        role="dialog"
        :aria-label="t('kvp.optionsTitle')"
        :style="optionsPopoverStyle"
        class="fixed z-[10000] w-72 rounded-lg bg-surface-overlay border border-border-default shadow-2xl p-3 text-xs text-text-primary flex flex-col gap-2"
        @mousedown.stop
        @click.stop
        @mouseenter="emit('portal-mouseenter')"
        @mouseleave="emit('portal-mouseleave')"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border-default pb-1.5">
          <span class="font-semibold text-text-primary">{{ t('kvp.optionsTitle') }}</span>
          <button
            type="button"
            data-test="kvp-options-close-btn"
            class="text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer"
            :aria-label="t('common.close')"
            @click="isOptionsOpen = false"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="max-h-44 overflow-y-auto flex flex-col gap-1.5">
          <div
            v-for="(opt, idx) in normalizedOptions"
            :key="idx"
            class="flex items-center gap-1"
          >
            <input
              type="text"
              :value="opt"
              :data-test="`kvp-option-item-input-${idx}`"
              :placeholder="t('kvp.optionPlaceholder')"
              class="flex-1 min-w-0 bg-surface-input border border-border-default rounded px-2 py-1 font-mono text-xs text-text-primary focus:outline-none focus:border-brand-primary"
              spellcheck="false"
              autocomplete="off"
              @change="e => updateOptionAt(idx, (e.target as HTMLInputElement).value, e.target as HTMLInputElement)"
              @blur="e => { const el = e.target as HTMLInputElement; if (el.value !== normalizedOptions[idx]) updateOptionAt(idx, el.value, el) }"
              @keydown.enter.prevent="e => updateOptionAt(idx, (e.target as HTMLInputElement).value, e.target as HTMLInputElement)"
            />
            <button
              type="button"
              :data-test="`kvp-remove-option-btn-${idx}`"
              :title="t('kvp.removeOption')"
              :aria-label="t('kvp.removeOption')"
              class="p-1 text-red-400 hover:bg-surface-hover rounded cursor-pointer shrink-0"
              @click="removeOptionAt(idx)"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div v-if="normalizedOptions.length === 0" class="text-text-muted text-[11px] italic py-1">
            {{ t('kvp.noOptions') }}
          </div>
        </div>

        <div class="flex flex-col gap-1 border-t border-border-default pt-2">
          <div class="flex items-center gap-1">
            <input
              ref="popoverAddInputRef"
              v-model="popoverNewOption"
              data-test="kvp-popover-add-option-input"
              type="text"
              :placeholder="t('kvp.addOptionPlaceholder')"
              class="flex-1 min-w-0 bg-surface-input border border-border-default rounded px-2 py-1 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary"
              spellcheck="false"
              autocomplete="off"
              @keydown.enter.prevent="confirmPopoverAdd"
            />
            <button
              type="button"
              data-test="kvp-popover-add-option-btn"
              class="px-2.5 py-1 rounded bg-brand-primary text-white text-xs font-medium hover:bg-brand-hover cursor-pointer shrink-0"
              @click="confirmPopoverAdd"
            >
              {{ t('common.add') }}
            </button>
          </div>
          <span v-if="popoverError" data-test="kvp-popover-option-error" class="text-[10px] text-red-400 px-0.5">
            {{ popoverError }}
          </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>
