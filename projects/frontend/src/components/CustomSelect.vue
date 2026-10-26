<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

export interface SelectOption {
  value: any
  label: string
  disabled?: boolean
  badge?: string
  icon?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: any
    options: SelectOption[]
    id?: string
    dataTest?: string
    ariaLabel?: string
    title?: string
    disabled?: boolean
    placeholder?: string
    size?: 'xs' | 'sm' | 'md'
    buttonClass?: string
    menuClass?: string
    align?: 'left' | 'right'
    dataScope?: string
    dataAuthType?: string
    fullWidth?: boolean
    containerClass?: string
    selectClass?: string
  }>(),
  {
    disabled: false,
    placeholder: 'Chọn...',
    size: 'sm',
    align: 'left',
    fullWidth: false
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
  (e: 'change', value: any): void
}>()

const isOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const triggerBtnRef = ref<HTMLButtonElement | null>(null)
const hiddenSelectRef = ref<HTMLSelectElement | null>(null)

watch(
  () => [props.modelValue, props.options],
  () => {
    if (hiddenSelectRef.value) {
      const val = props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)
      hiddenSelectRef.value.value = val
    }
  },
  { flush: 'post' }
)

const selectedOption = computed(() => {
  return props.options.find(opt => String(opt.value) === String(props.modelValue))
})

const displayLabel = computed(() => {
  return selectedOption.value?.label || props.placeholder
})

const toggleDropdown = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

const selectOption = (opt: SelectOption) => {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  isOpen.value = false
  triggerBtnRef.value?.focus()
}

const onNativeSelectChange = (e: Event) => {
  const target = e.target as HTMLSelectElement
  const found = props.options.find(opt => String(opt.value) === target.value)
  const val = found ? found.value : target.value
  emit('update:modelValue', val)
  emit('change', val)
}

const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
    triggerBtnRef.value?.focus()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', handleClickOutside)
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div
    ref="containerRef"
    :class="[
      'relative min-w-0',
      fullWidth ? 'w-full flex items-center' : 'inline-flex items-center',
      containerClass
    ]"
  >
    <!-- Native select hidden for test runners and accessibility -->
    <select
      :id="id"
      ref="hiddenSelectRef"
      :data-test="dataTest"
      :data-scope="dataScope"
      :data-auth-type="dataAuthType"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel || title"
      :class="['sr-only appearance-none bg-surface-overlay', selectClass]"
      aria-hidden="true"
      tabindex="-1"
      @change="onNativeSelectChange"
    >
      <option
        v-for="opt in options"
        :key="String(opt.value)"
        :value="opt.value"
        :disabled="opt.disabled"
      >
        {{ opt.label }}
      </option>
    </select>

    <!-- Custom Trigger Button -->
    <button
      ref="triggerBtnRef"
      type="button"
      :data-test="dataTest ? `${dataTest}-trigger` : undefined"
      :disabled="disabled"
      :title="title || displayLabel"
      :aria-label="ariaLabel || title || displayLabel"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :class="[
        'flex items-center justify-between gap-1.5 rounded border transition-colors select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary',
        fullWidth ? 'w-full' : '',
        disabled ? 'opacity-50 cursor-not-allowed bg-surface-base border-border-default text-text-muted' : 'bg-surface-overlay hover:bg-surface-hover border-border-default hover:border-border-hover text-text-primary',
        size === 'xs' ? 'h-[26px] px-2 text-[11px]' : (size === 'md' ? 'h-[36px] px-3 text-sm' : 'h-[32px] px-2.5 text-xs font-medium'),
        buttonClass
      ]"
      @click.stop="toggleDropdown"
      @keydown.down.prevent="isOpen = true"
    >
      <div class="flex items-center gap-1.5 min-w-0 truncate">
        <span class="truncate text-left leading-normal py-0.5">
          {{ displayLabel }}
        </span>
        <span v-if="selectedOption?.badge" class="ml-1 px-1.5 py-0.2 text-[10px] font-normal rounded bg-surface-base border border-border-subtle text-text-muted shrink-0">
          {{ selectedOption.badge }}
        </span>
      </div>

      <!-- Chevron Icon -->
      <svg
        class="w-3.5 h-3.5 text-text-muted transition-transform duration-150 shrink-0 ml-1"
        :class="{ 'rotate-180 text-brand-primary': isOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>

    <!-- Custom Dropdown Popover -->
    <div
      v-if="isOpen"
      :data-test="dataTest ? `${dataTest}-menu` : undefined"
      role="listbox"
      :class="[
        'absolute top-full mt-1 min-w-full max-h-60 overflow-y-auto bg-surface-raised border border-border-default rounded-md shadow-2xl py-1 z-50 flex flex-col text-xs select-none',
        align === 'right' ? 'right-0' : 'left-0',
        menuClass
      ]"
      @click.stop
    >
      <div
        v-for="opt in options"
        :key="String(opt.value)"
        role="option"
        :aria-selected="String(opt.value) === String(modelValue)"
        :class="[
          'px-3 py-1.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer',
          opt.disabled ? 'opacity-40 cursor-not-allowed' : (String(opt.value) === String(modelValue) ? 'bg-brand-primary/10 text-brand-primary font-semibold' : 'text-text-primary hover:bg-surface-hover')
        ]"
        @click="selectOption(opt)"
      >
        <div class="flex items-center gap-1.5 min-w-0 truncate flex-1">
          <span class="truncate leading-normal py-0.5">
            {{ opt.label }}
          </span>
          <span v-if="opt.badge" class="ml-1 px-1.5 py-0.2 text-[10px] font-normal rounded bg-surface-base border border-border-subtle text-text-muted shrink-0">
            {{ opt.badge }}
          </span>
        </div>

        <!-- Checkmark icon for selected item -->
        <svg
          v-if="String(opt.value) === String(modelValue)"
          class="w-3.5 h-3.5 text-brand-primary shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
    </div>
  </div>
</template>
