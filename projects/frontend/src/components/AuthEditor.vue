<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import type { AuthConfig, TreeNode } from '@/stores/collectionStore'
import { resolveEffectiveAuth } from '@/utils/auth'

const showBearerToken = ref(false)
const showBasicPassword = ref(false)
const showApiKeyValue = ref(false)

const props = withDefaults(
  defineProps<{
    modelValue?: AuthConfig
    pathNodes?: TreeNode[]
    isFolder?: boolean
  }>(),
  {
    modelValue: () => ({ type: 'inherit' }),
    pathNodes: () => [],
    isFolder: false
  }
)

watch(() => props.modelValue, () => {
  showBearerToken.value = false
  showBasicPassword.value = false
  showApiKeyValue.value = false
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: AuthConfig): void
}>()

const authType = computed({
  get: () => props.modelValue?.type || 'inherit',
  set: (newType: AuthConfig['type']) => {
    let updated: AuthConfig = { type: newType }
    if (newType === 'bearer') {
      updated.bearer = { token: props.modelValue?.bearer?.token || '' }
    } else if (newType === 'basic') {
      updated.basic = {
        username: props.modelValue?.basic?.username || '',
        password: props.modelValue?.basic?.password || ''
      }
    } else if (newType === 'apiKey') {
      updated.apiKey = {
        key: props.modelValue?.apiKey?.key || '',
        value: props.modelValue?.apiKey?.value || '',
        addTo: props.modelValue?.apiKey?.addTo || 'header'
      }
    }
    emit('update:modelValue', updated)
  }
})

// Inherited auth preview when type is 'inherit'
const inheritedPreview = computed(() => {
  if (authType.value !== 'inherit') return null
  const result = resolveEffectiveAuth({ type: 'inherit' }, props.pathNodes)
  return result
})

const inheritedFolderLevel = computed(() => {
  if (!inheritedPreview.value?.sourceNode) return null
  const folderNodes = (props.pathNodes || []).filter(n => n && n.type === 'folder')
  const idx = folderNodes.findIndex(f => f.id === inheritedPreview.value?.sourceNode?.id)
  return idx >= 0 ? idx + 1 : 1
})

const bearerToken = computed({
  get: () => props.modelValue?.bearer?.token || '',
  set: (val: string) => {
    emit('update:modelValue', {
      ...props.modelValue,
      type: 'bearer',
      bearer: { token: val }
    })
  }
})

const basicUsername = computed({
  get: () => props.modelValue?.basic?.username || '',
  set: (val: string) => {
    emit('update:modelValue', {
      ...props.modelValue,
      type: 'basic',
      basic: {
        username: val,
        password: props.modelValue?.basic?.password || ''
      }
    })
  }
})

const basicPassword = computed({
  get: () => props.modelValue?.basic?.password || '',
  set: (val: string) => {
    emit('update:modelValue', {
      ...props.modelValue,
      type: 'basic',
      basic: {
        username: props.modelValue?.basic?.username || '',
        password: val
      }
    })
  }
})

const apiKeyName = computed({
  get: () => props.modelValue?.apiKey?.key || '',
  set: (val: string) => {
    emit('update:modelValue', {
      ...props.modelValue,
      type: 'apiKey',
      apiKey: {
        key: val,
        value: props.modelValue?.apiKey?.value || '',
        addTo: props.modelValue?.apiKey?.addTo || 'header'
      }
    })
  }
})

const apiKeyValue = computed({
  get: () => props.modelValue?.apiKey?.value || '',
  set: (val: string) => {
    emit('update:modelValue', {
      ...props.modelValue,
      type: 'apiKey',
      apiKey: {
        key: props.modelValue?.apiKey?.key || '',
        value: val,
        addTo: props.modelValue?.apiKey?.addTo || 'header'
      }
    })
  }
})

const apiKeyAddTo = computed({
  get: () => props.modelValue?.apiKey?.addTo || 'header',
  set: (val: 'header' | 'query') => {
    emit('update:modelValue', {
      ...props.modelValue,
      type: 'apiKey',
      apiKey: {
        key: props.modelValue?.apiKey?.key || '',
        value: props.modelValue?.apiKey?.value || '',
        addTo: val
      }
    })
  }
})
</script>

<template>
  <div class="flex flex-col gap-4 max-w-2xl py-2">
    <!-- Type Selector -->
    <div class="flex items-center gap-4">
      <label for="auth-type-select" class="text-xs font-semibold uppercase text-text-muted w-24 shrink-0">
        Auth Type
      </label>
      <div class="relative flex items-center">
        <select
          id="auth-type-select"
          v-model="authType"
          class="peer appearance-none bg-surface-overlay border border-border-default rounded px-3 py-1.5 pr-8 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary cursor-pointer"
        >
          <option value="inherit" class="bg-surface-overlay text-text-primary">Inherit from parent</option>
          <option value="none" class="bg-surface-overlay text-text-primary">No Auth</option>
          <option value="bearer" class="bg-surface-overlay text-text-primary">Bearer Token</option>
          <option value="basic" class="bg-surface-overlay text-text-primary">Basic Auth</option>
          <option value="apiKey" class="bg-surface-overlay text-text-primary">API Key</option>
        </select>
        <div class="absolute right-2.5 pointer-events-none text-text-muted peer-focus:text-brand-primary flex items-center justify-center">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- Inherit Mode Details -->
    <div v-if="authType === 'inherit'" class="p-3 bg-surface-raised/40 border border-border-subtle rounded text-xs text-text-secondary">
      <div v-if="inheritedPreview?.sourceNode && inheritedPreview.auth.type !== 'none'" class="flex items-center gap-2">
        <span class="text-text-muted">Inherited from:</span>
        <span class="text-blue-400 font-medium">{{ inheritedPreview.sourceNode.name }} (Folder {{ inheritedFolderLevel }})</span>
        <span class="text-text-muted ml-2">Type:</span>
        <span class="uppercase font-mono text-emerald-400 font-medium">{{ inheritedPreview.auth.type }}</span>
      </div>
      <div v-else class="text-text-muted italic">
        No authentication inherited from parent.
      </div>
    </div>

    <!-- None Mode Details -->
    <div v-else-if="authType === 'none'" class="p-3 bg-surface-raised/40 border border-border-subtle rounded text-xs text-text-muted italic">
      No authentication for this {{ isFolder ? 'folder' : 'request' }}.
    </div>

    <!-- Bearer Token Inputs -->
    <div v-else-if="authType === 'bearer'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label for="bearer-token-input" class="text-xs font-medium text-text-muted">Token</label>
        <div class="relative flex items-center">
          <input
            id="bearer-token-input"
            v-model="bearerToken"
            :type="showBearerToken ? 'text' : 'password'"
            placeholder="Token or {{token}}"
            class="w-full bg-surface-raised border border-border-default rounded px-3 py-2 pr-10 text-sm text-text-primary font-mono focus:border-brand-primary outline-none"
          />
          <button
            type="button"
            @click="showBearerToken = !showBearerToken"
            class="absolute right-2 text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
            :title="showBearerToken ? 'Hide token' : 'Show token'"
            aria-label="Toggle token visibility"
          >
            <svg v-if="showBearerToken" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a113.88,113.88,0,0,1-19.78,33.5l16.12,16.13a8,8,0,0,1-11.31,11.31l-184-184A8,8,0,0,1,40.34,3.66L61,24.32A115.06,115.06,0,0,1,128,12a114.28,114.28,0,0,1,100,116ZM92.17,55.51A100.82,100.82,0,0,0,48.16,108.6a8,8,0,0,0,0,10.8,114.73,114.73,0,0,0,55.56,47.46l15-15A44,44,0,0,1,87.65,120.8l15.82-15.82A44.08,44.08,0,0,1,92.17,55.51ZM207.84,119.4A114.73,114.73,0,0,0,152.28,71.94L167.3,56.92A113.62,113.62,0,0,1,207.84,119.4Z"/>
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.47,133.47,0,0,1,231,128,133.33,133.33,0,0,1,207.93,158.75C185.67,180.81,158.78,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Basic Auth Inputs -->
    <div v-else-if="authType === 'basic'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label for="basic-username-input" class="text-xs font-medium text-text-muted">Username</label>
        <input
          id="basic-username-input"
          v-model="basicUsername"
          type="text"
          placeholder="Username or {{username}}"
          class="w-full bg-surface-raised border border-border-default rounded px-3 py-2 text-sm text-text-primary focus:border-brand-primary outline-none"
        />
        <span v-if="basicUsername.includes(':')" class="text-[11px] text-amber-400">
          Warning (RFC 7617): Username should not contain a colon (":").
        </span>
      </div>
      <div class="flex flex-col gap-1">
        <label for="basic-password-input" class="text-xs font-medium text-text-muted">Password</label>
        <div class="relative flex items-center">
          <input
            id="basic-password-input"
            v-model="basicPassword"
            :type="showBasicPassword ? 'text' : 'password'"
            placeholder="Password or {{password}}"
            class="w-full bg-surface-raised border border-border-default rounded px-3 py-2 pr-10 text-sm text-text-primary focus:border-brand-primary outline-none"
          />
          <button
            type="button"
            @click="showBasicPassword = !showBasicPassword"
            class="absolute right-2 text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
            :title="showBasicPassword ? 'Hide password' : 'Show password'"
            aria-label="Toggle password visibility"
          >
            <svg v-if="showBasicPassword" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a113.88,113.88,0,0,1-19.78,33.5l16.12,16.13a8,8,0,0,1-11.31,11.31l-184-184A8,8,0,0,1,40.34,3.66L61,24.32A115.06,115.06,0,0,1,128,12a114.28,114.28,0,0,1,100,116ZM92.17,55.51A100.82,100.82,0,0,0,48.16,108.6a8,8,0,0,0,0,10.8,114.73,114.73,0,0,0,55.56,47.46l15-15A44,44,0,0,1,87.65,120.8l15.82-15.82A44.08,44.08,0,0,1,92.17,55.51ZM207.84,119.4A114.73,114.73,0,0,0,152.28,71.94L167.3,56.92A113.62,113.62,0,0,1,207.84,119.4Z"/>
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.47,133.47,0,0,1,231,128,133.33,133.33,0,0,1,207.93,158.75C185.67,180.81,158.78,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- API Key Inputs -->
    <div v-else-if="authType === 'apiKey'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label for="api-key-name-input" class="text-xs font-medium text-text-muted">Key</label>
        <input
          id="api-key-name-input"
          v-model="apiKeyName"
          type="text"
          placeholder="Key (e.g. X-API-Key)"
          class="w-full bg-surface-raised border border-border-default rounded px-3 py-2 text-sm text-text-primary font-mono focus:border-brand-primary outline-none"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="api-key-val-input" class="text-xs font-medium text-text-muted">Value</label>
        <div class="relative flex items-center">
          <input
            id="api-key-val-input"
            v-model="apiKeyValue"
            :type="showApiKeyValue ? 'text' : 'password'"
            placeholder="Value or {{apiKey}}"
            class="w-full bg-surface-raised border border-border-default rounded px-3 py-2 pr-10 text-sm text-text-primary font-mono focus:border-brand-primary outline-none"
          />
          <button
            type="button"
            @click="showApiKeyValue = !showApiKeyValue"
            class="absolute right-2 text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
            :title="showApiKeyValue ? 'Hide value' : 'Show value'"
            aria-label="Toggle API key value visibility"
          >
            <svg v-if="showApiKeyValue" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a113.88,113.88,0,0,1-19.78,33.5l16.12,16.13a8,8,0,0,1-11.31,11.31l-184-184A8,8,0,0,1,40.34,3.66L61,24.32A115.06,115.06,0,0,1,128,12a114.28,114.28,0,0,1,100,116ZM92.17,55.51A100.82,100.82,0,0,0,48.16,108.6a8,8,0,0,0,0,10.8,114.73,114.73,0,0,0,55.56,47.46l15-15A44,44,0,0,1,87.65,120.8l15.82-15.82A44.08,44.08,0,0,1,92.17,55.51ZM207.84,119.4A114.73,114.73,0,0,0,152.28,71.94L167.3,56.92A113.62,113.62,0,0,1,207.84,119.4Z"/>
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.47,133.47,0,0,1,231,128,133.33,133.33,0,0,1,207.93,158.75C185.67,180.81,158.78,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label for="api-key-add-to-select" class="text-xs font-medium text-text-muted">Add to</label>
        <div class="relative flex items-center">
          <select
            id="api-key-add-to-select"
            v-model="apiKeyAddTo"
            class="peer appearance-none w-full bg-surface-overlay border border-border-default rounded px-3 py-2 pr-8 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary cursor-pointer"
          >
            <option value="header" class="bg-surface-overlay text-text-primary">Header</option>
            <option value="query" class="bg-surface-overlay text-text-primary">Query Params</option>
          </select>
          <div class="absolute right-2.5 pointer-events-none text-text-muted peer-focus:text-brand-primary flex items-center justify-center">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
