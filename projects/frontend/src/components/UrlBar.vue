<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useUiStore } from '@/stores/uiStore'
import VariableHighlighter from '@/components/VariableHighlighter.vue'

const requestStore = useRequestStore()
const responseStore = useResponseStore()
const uiStore = useUiStore()

const req = computed(() => requestStore.current)
const urlInputRef = ref<HTMLTextAreaElement | null>(null)
const highlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)

watch(() => req.value?.url, () => {
  if (responseStore.urlInvalid) {
    responseStore.urlInvalid = false
  }
})

watch(() => uiStore.focusUrlRequested, () => {
  if (urlInputRef.value) {
    urlInputRef.value.focus()
    urlInputRef.value.select()
  }
})

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const isFocused = ref(false)
const onFocus = (e: Event) => {
  isFocused.value = true;
  nextTick(() => {
    if (urlInputRef.value) {
      urlInputRef.value.style.height = 'auto';
      urlInputRef.value.style.height = urlInputRef.value.scrollHeight + 'px';
    }
  });
}
const onBlur = () => {
  setTimeout(() => isFocused.value = false, 150)
}

const isOpen = ref(false)
const listboxRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const closeDropdown = () => {
  isOpen.value = false
  buttonRef.value?.focus()
}

const selectMethod = (method: string) => {
  if (req.value) {
    req.value.method = method
  }
  closeDropdown()
}

const onButtonKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault()
    isOpen.value = true
  }
}

const onListboxKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeDropdown()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    const focusable = getFocusableOptions()
    const index = focusable.findIndex(el => el === document.activeElement)
    const nextIndex = (index + 1) % focusable.length
    focusable[nextIndex]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const focusable = getFocusableOptions()
    const index = focusable.findIndex(el => el === document.activeElement)
    const nextIndex = index - 1 < 0 ? focusable.length - 1 : index - 1
    focusable[nextIndex]?.focus()
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const activeEl = document.activeElement as HTMLElement
    const method = activeEl?.dataset?.method
    if (method) {
      selectMethod(method)
    }
  }
}

const getFocusableOptions = () => {
  if (!listboxRef.value) return []
  return Array.from(listboxRef.value.querySelectorAll('[role="option"]')) as HTMLElement[]
}

const onClickOutside = (e: MouseEvent) => {
  if (isOpen.value && listboxRef.value && !listboxRef.value.contains(e.target as Node) && buttonRef.value && !buttonRef.value.contains(e.target as Node)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
})

const methodColors: Record<string, string> = {
  get: 'text-method-get',
  post: 'text-method-post',
  put: 'text-method-put',
  patch: 'text-method-patch',
  delete: 'text-method-delete'
}

const currentMethodColorClass = computed(() => {
  if (!req.value?.method) return ''
  return methodColors[req.value.method.toLowerCase()] || ''
})

const getMethodColorClass = (method: string) => {
  return methodColors[method.toLowerCase()] || ''
}

// Ensure unknown methods keep their case but we fallback gracefully
const displayMethod = computed(() => req.value?.method || 'GET')
const isUnknownMethod = computed(() => !methods.includes(req.value?.method || ''))

const autoResize = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  target.style.height = 'auto';
  target.style.height = target.scrollHeight + 'px';
};
const initResize = (el: any) => {
  if (el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
};

</script>

<template>
  <div v-if="req" class="flex items-stretch bg-surface-base border rounded-md transition-all duration-200 h-[44px] focus-within:ring-2 focus-within:bg-surface-raised focus-within:shadow-lg focus-within:shadow-brand-primary/10 relative"
       :class="responseStore.urlInvalid ? 'border-error-border focus-within:border-error-border focus-within:ring-error-border ring-error-border ring-1' : 'border-border-default focus-within:border-brand-primary focus-within:ring-brand-primary/50'">
    
    <!-- Method Dropdown -->
    <button
      ref="buttonRef"
      type="button"
      class="h-full px-3 pt-2 pb-3 font-mono text-sm font-bold shrink-0 border-r hover:bg-surface-hover outline-none"
      :class="[responseStore.urlInvalid ? 'border-error-border' : 'border-border-default', isUnknownMethod ? 'text-text-secondary' : currentMethodColorClass]"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
      @keydown="onButtonKeyDown"
    >
      {{ displayMethod }}
      <!-- Minimal caret -->
      <svg class="w-3 h-3 inline-block ml-1 opacity-50" viewBox="0 0 16 16" fill="none">
        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Dropdown Listbox -->
    <div
      v-show="isOpen"
      ref="listboxRef"
      role="listbox"
      class="absolute top-full left-0 mt-1 bg-surface-overlay border border-border-default rounded-md shadow-lg z-10 min-w-32 py-1 outline-none"
      tabindex="-1"
      @keydown="onListboxKeyDown"
    >
      <div
        v-for="method in methods"
        :key="method"
        role="option"
        :aria-selected="req.method === method"
        :data-method="method"
        class="px-3 pt-2 pb-3 font-mono text-sm font-bold cursor-pointer hover:bg-surface-hover outline-none focus:bg-surface-hover"
        :class="getMethodColorClass(method)"
        tabindex="0"
        @click="selectMethod(method)"
      >
        {{ method }}
      </div>
    </div>

    <!-- URL Input -->
    <div class="flex-1 min-w-0 relative">
      <div 
        class="absolute top-0 left-0 w-full transition-shadow duration-200"
        :class="isFocused ? 'z-50 bg-surface-raised rounded-b-md shadow-2xl ring-1 ring-brand-primary/50' : 'overflow-hidden h-full'"
      >
      <VariableHighlighter 
        ref="highlighterRef"
        :wrap="true"
        :single-line="false"
        :value="req.url" 
                style="font-variant-ligatures: none;"
        overlay-class="px-3 pt-2 pb-3 font-mono text-base w-full h-full"
      >
        <textarea
          :ref="el => { urlInputRef = el as HTMLTextAreaElement; initResize(el) }"
          id="url-input"
          v-model="req.url"
          rows="1"
          class="transparent-selection w-full h-full bg-transparent px-3 pt-2 pb-3 font-mono text-base text-transparent caret-text-primary outline-none resize-none overflow-hidden block whitespace-pre-wrap break-all"
          style="font-variant-ligatures: none;"
          spellcheck="false"
          autocomplete="off"
          placeholder="https://api.example.com/v1/..."
          aria-label="URL"
          @scroll="e => highlighterRef?.syncScroll(e)"
          @input="autoResize"
          @focus="onFocus"
          @blur="onBlur"
        ></textarea>
      </VariableHighlighter>
      </div>
    </div>

    <!-- Send/Abort Button -->
    <button
      v-if="responseStore.loading"
      type="button"
      class="h-full px-4 py-2 flex items-center justify-center font-semibold shrink-0 rounded-r bg-error-bg text-error-text border-l border-error-border outline-none"
      @click="responseStore.abort"
    >
      Hủy
    </button>
    <button
      v-else
      type="button"
      class="h-full px-4 py-2 flex items-center justify-center bg-brand-primary text-white font-semibold shrink-0 rounded-r border-l border-brand-primary hover:opacity-90 outline-none"
      @click="responseStore.send"
    >
      Gửi
    </button>
  </div>
</template>
