<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { generateCurlCommand, isCurlCommand, parseCurlCommand } from '@/utils/curl'
import { resolveHierarchyVariables } from '@/utils/resolveHierarchyVariables'
import VariableHighlighter from '@/components/VariableHighlighter.vue'

const requestStore = useRequestStore()
const responseStore = useResponseStore()
const uiStore = useUiStore()
const collectionStore = useCollectionStore()
const envStore = useEnvironmentStore()

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

const methodColors: Record<string, string> = {
  get: 'text-method-get',
  post: 'text-method-post',
  put: 'text-method-put',
  patch: 'text-method-patch',
  delete: 'text-method-delete',
  head: 'text-cyan-400',
  options: 'text-purple-400'
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

const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback to execCommand if clipboard API fails
    }
  }

  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    return successful
  } catch {
    return false
  }
}

const copyAsCurl = async () => {
  if (!req.value) return
  if (!req.value.url || req.value.url.trim() === '') {
    responseStore.urlInvalid = true
    uiStore.showToast('Vui lòng nhập URL')
    return
  }

  const pathNodes = (collectionStore.findFolderPath(collectionStore.tree, req.value.id) || []).filter(n => n.type === 'folder')
  const vars = resolveHierarchyVariables({
    collectionVariables: collectionStore.activeCollection?.variables,
    activeEnvVariables: envStore.variablesMap,
    pathFolders: pathNodes,
    activeEnvId: envStore.activeEnvId
  })

  const curlCmd = generateCurlCommand(req.value, {
    vars,
    pathNodes,
    activeEnvId: envStore.activeEnvId,
    collection: collectionStore.activeCollection as any
  })

  const success = await copyToClipboard(curlCmd)
  if (success) {
    uiStore.showToast('Đã sao chép cURL vào clipboard')
  } else {
    uiStore.showToast('Không thể sao chép vào clipboard')
  }
}

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
      class="absolute top-full left-0 mt-1 bg-surface-overlay border border-border-default rounded-md shadow-lg z-10 min-w-44 py-1 outline-none"
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
      <div class="border-t border-border-default mt-1 pt-1.5 px-2 pb-1 flex items-center gap-1" @click.stop>
        <input
          v-model="customMethodInput"
          type="text"
          data-test="custom-method-input"
          placeholder="Custom (VD: PURGE)"
          aria-label="Custom HTTP Method"
          class="w-full min-w-0 px-2 py-1 bg-surface-input border border-border-default rounded font-mono text-xs text-text-primary uppercase placeholder:normal-case placeholder:text-text-muted focus:border-brand-primary outline-none"
          @keydown.enter.prevent="applyCustomMethod"
        />
        <button
          type="button"
          data-test="custom-method-apply"
          class="px-2 py-1 bg-brand-primary text-white rounded text-xs font-semibold hover:opacity-90 shrink-0 cursor-pointer outline-none"
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

    <!-- Copy as cURL Button -->
    <button
      type="button"
      id="copy-curl-btn"
      title="Copy as cURL"
      aria-label="Copy as cURL"
      class="h-full px-3 flex items-center justify-center gap-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover border-l border-border-default outline-none focus-visible:ring-1 focus-visible:ring-brand-primary text-xs font-semibold shrink-0 transition-colors"
      @click="copyAsCurl"
    >
      <svg class="w-3.5 h-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
      <span>cURL</span>
    </button>

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
