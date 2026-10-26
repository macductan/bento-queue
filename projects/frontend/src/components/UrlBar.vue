<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useUiStore } from '@/stores/uiStore'
import { isCurlCommand, parseCurlCommand } from '@/utils/curl'
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

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const customMethodInput = ref('')

const isFocused = ref(false)
const onFocus = () => {
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

const applyCustomMethod = () => {
  const normalized = customMethodInput.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
  if (!normalized || !req.value) return
  req.value.method = normalized
  customMethodInput.value = ''
  closeDropdown()
}

const onButtonKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
    e.preventDefault()
    isOpen.value = true
  }
}

const onListboxKeyDown = (e: KeyboardEvent) => {
  const activeEl = document.activeElement as HTMLElement | null
  const isCustomInput = activeEl?.getAttribute('data-test') === 'custom-method-input'
  if (e.key === 'Escape') {
    e.preventDefault()
    closeDropdown()
  } else if (isCustomInput) {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyCustomMethod()
    }
    return
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

const methodTextColors: Record<string, string> = {
  get: 'text-method-get',
  post: 'text-method-post',
  put: 'text-method-put',
  patch: 'text-method-patch',
  delete: 'text-method-delete',
  head: 'text-method-head',
  options: 'text-method-options'
}

const methodTriggerColors: Record<string, string> = {
  get: 'text-method-get method-badge-get',
  post: 'text-method-post method-badge-post',
  put: 'text-method-put method-badge-put',
  patch: 'text-method-patch method-badge-patch',
  delete: 'text-method-delete method-badge-delete',
  head: 'text-method-head method-badge-head',
  options: 'text-method-options method-badge-options'
}

const currentMethodColorClass = computed(() => {
  if (!req.value?.method) return 'text-method-get method-badge-get'
  return methodTriggerColors[req.value.method.toLowerCase()] || 'method-badge-options text-text-primary'
})

const getMethodColorClass = (method: string) => {
  return methodTextColors[method.toLowerCase()] || 'text-text-primary'
}

// Ensure unknown methods keep their case but we fallback gracefully
const displayMethod = computed(() => req.value?.method || 'GET')
const isUnknownMethod = computed(() => !methods.includes(req.value?.method || ''))

const autoResize = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  if (req.value && typeof target.value === 'string' && req.value.url !== target.value) {
    req.value.url = target.value;
  }
  target.style.height = 'auto';
  target.style.height = target.scrollHeight + 'px';
};
const initResize = (el: any) => {
  if (el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
};

const onUrlPaste = (e: ClipboardEvent) => {
  if (!req.value) return
  const pasted = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text') || ''
  if (!isCurlCommand(pasted)) return

  const parsed = parseCurlCommand(pasted)
  if (!parsed.url) return

  e.preventDefault()
  req.value.method = parsed.method || 'GET'
  req.value.url = parsed.url
  req.value.params = parsed.params
  if (parsed.path_params) {
    req.value.path_params = parsed.path_params
  }
  req.value.headers = parsed.headers
  req.value.body = {
    type: parsed.body.type,
    content: parsed.body.content,
    ...(parsed.body.form_data ? { form_data: parsed.body.form_data } : {}),
    ...(parsed.body.urlencoded ? { urlencoded: parsed.body.urlencoded } : {})
  }
  requestStore.setBodyType(parsed.body.type)
  req.value.auth = parsed.auth ? parsed.auth : { type: 'inherit' }

  nextTick(() => {
    if (urlInputRef.value) {
      urlInputRef.value.style.height = 'auto'
      urlInputRef.value.style.height = urlInputRef.value.scrollHeight + 'px'
    }
  })

  uiStore.showToast('Đã phân tích lệnh cURL')
}
</script>

<template>
  <div v-if="req" class="flex items-stretch bg-surface-base border rounded-md transition-all duration-200 h-[44px] focus-within:ring-2 focus-within:bg-surface-raised focus-within:shadow-lg focus-within:shadow-brand-primary/10 relative"
       :class="responseStore.urlInvalid ? 'border-error-border focus-within:border-error-border focus-within:ring-error-border ring-error-border ring-1' : 'border-border-default focus-within:border-brand-primary focus-within:ring-brand-primary/50'">
    
    <!-- Method Dropdown -->
    <button
      id="http-method-select"
      ref="buttonRef"
      type="button"
      data-test="method-selector"
      class="h-full px-3.5 flex items-center justify-between gap-2 font-mono text-xs font-bold tracking-wide shrink-0 rounded-l-[5px] border-t-0 border-b-0 border-l-0 border-r hover:bg-surface-hover cursor-pointer transition-colors outline-none"
      :class="[responseStore.urlInvalid ? 'border-error-border' : 'border-border-default', isUnknownMethod ? 'method-badge-options text-text-primary' : currentMethodColorClass]"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
      @keydown="onButtonKeyDown"
    >
      <span>{{ displayMethod }}</span>
      <!-- Minimal caret -->
      <svg
        class="w-3 h-3 opacity-60 transition-transform duration-150 shrink-0"
        :class="{ 'rotate-180': isOpen }"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Dropdown Listbox -->
    <div
      v-show="isOpen"
      ref="listboxRef"
      role="listbox"
      class="absolute top-full left-0 mt-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl z-30 min-w-44 py-1.5 outline-none"
      tabindex="-1"
      @keydown="onListboxKeyDown"
    >
      <div
        v-for="method in methods"
        :key="method"
        role="option"
        :aria-selected="req.method === method"
        :data-method="method"
        class="mx-1 px-2.5 py-1.5 rounded-md font-mono text-xs font-bold cursor-pointer flex items-center justify-between transition-colors hover:bg-zinc-800 focus:bg-zinc-800 outline-none"
        :class="[
          getMethodColorClass(method),
          req.method === method ? 'bg-zinc-800/70' : ''
        ]"
        tabindex="0"
        @click="selectMethod(method)"
      >
        <span>{{ method }}</span>
        <svg
          v-if="req.method === method"
          class="w-3.5 h-3.5 opacity-80 shrink-0"
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
      </div>
      <div class="border-t border-zinc-800 mt-1.5 pt-2 px-2 pb-0.5 flex items-center gap-1.5" @click.stop>
        <input
          v-model="customMethodInput"
          type="text"
          data-test="custom-method-input"
          placeholder="Custom (VD: PURGE)"
          aria-label="Custom HTTP Method"
          class="w-full min-w-0 px-2 py-1 bg-zinc-950 border border-zinc-700/80 rounded-md font-mono text-[11px] text-zinc-100 uppercase placeholder:normal-case placeholder:text-zinc-500 focus:border-indigo-500 outline-none transition-colors"
          @keydown.enter.prevent="applyCustomMethod"
        />
        <button
          type="button"
          data-test="custom-method-apply"
          class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[11px] font-semibold shrink-0 cursor-pointer transition-colors outline-none"
          @click="applyCustomMethod"
        >
          OK
        </button>
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
        :enable-path-params="true"
        :value="req.url" 
        style="font-variant-ligatures: none;"
        overlay-class="px-3 pt-2 pb-3 font-mono text-sm w-full h-full"
      >
        <textarea
          :ref="el => { urlInputRef = el as HTMLTextAreaElement; initResize(el) }"
          id="url-input"
          v-model="req.url"
          rows="1"
          class="transparent-selection w-full h-full bg-transparent px-3 pt-2 pb-3 font-mono text-sm text-transparent caret-text-primary outline-none resize-none overflow-hidden block whitespace-pre-wrap break-all"
          style="font-variant-ligatures: none;"
          spellcheck="false"
          autocomplete="off"
          placeholder="https://api.example.com/v1/..."
          aria-label="URL"
          @scroll="e => highlighterRef?.syncScroll(e)"
          @input="autoResize"
          @paste="onUrlPaste"
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
      data-test="abort-request-btn"
      class="h-full px-4 py-2 flex items-center justify-center gap-1.5 font-semibold shrink-0 rounded-r bg-rose-600 hover:bg-rose-500 text-white border-l border-rose-500 outline-none cursor-pointer transition-colors text-xs"
      @click="responseStore.abort"
    >
      <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>Hủy</span>
    </button>
    <button
      v-else
      type="button"
      data-test="send-request-btn"
      title="Gửi (Ctrl+Enter)"
      aria-label="Gửi"
      class="h-full px-4 py-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shrink-0 rounded-r border-l border-indigo-500 outline-none cursor-pointer transition-colors text-xs shadow-lg shadow-indigo-600/20"
      @click="responseStore.send"
    >
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      <span>Gửi</span>
      <kbd class="text-[10px] bg-indigo-700/80 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-400/30 font-mono">^Enter</kbd>
    </button>
  </div>
</template>
