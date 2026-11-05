<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { getActivePinia } from 'pinia'
import { useCollectionStore, type AuthConfig, type TreeNode } from '@/stores/collectionStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { resolveEffectiveAuth } from '@/utils/auth'
import VariableHighlighter from '@/components/VariableHighlighter.vue'
import CustomSelect, { type SelectOption } from '@/components/CustomSelect.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const pinia = getActivePinia()
const collectionStore = pinia ? useCollectionStore(pinia) : null
const envStore = pinia ? useEnvironmentStore(pinia) : null

const showBearerToken = ref<boolean | null>(null)
const showBasicPassword = ref<boolean | null>(null)
const showApiKeyValue = ref<boolean | null>(null)
const resolveDefaultEnvScope = (): string => {
  const activeId = envStore?.activeEnvId
  if (activeId && envStore?.environments.some(e => e.id === activeId)) {
    return activeId
  }
  return '__global__'
}

const internalEnvScope = ref<string>(resolveDefaultEnvScope())

const bearerHighlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)
const basicUserHighlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)
const basicPassHighlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)
const apiKeyValHighlighterRef = ref<InstanceType<typeof VariableHighlighter> | null>(null)

const props = withDefaults(
  defineProps<{
    modelValue?: AuthConfig
    authEnvs?: Record<string, AuthConfig>
    envScope?: string
    pathNodes?: TreeNode[]
    isFolder?: boolean
    isCollection?: boolean
  }>(),
  {
    modelValue: () => ({ type: 'inherit' }),
    authEnvs: () => ({}),
    envScope: undefined,
    pathNodes: () => [],
    isFolder: false,
    isCollection: false
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: AuthConfig): void
  (e: 'update:authEnvs', val: Record<string, AuthConfig>): void
  (e: 'update:envScope', val: string): void
}>()

const selectedEnvScope = computed({
  get: () => props.envScope ?? internalEnvScope.value,
  set: (val: string) => {
    internalEnvScope.value = val
    emit('update:envScope', val)
  }
})

watch(
  () => envStore?.activeEnvId,
  () => {
    if (props.envScope === undefined) {
      const nextScope = resolveDefaultEnvScope()
      internalEnvScope.value = nextScope
      emit('update:envScope', nextScope)
    }
  }
)

watch(
  () => envStore?.environments.map(e => e.id).join(','),
  () => {
    if (props.envScope !== undefined || !envStore) return
    const envs = envStore.environments
    if (internalEnvScope.value !== '__global__' && !envs.some(e => e.id === internalEnvScope.value)) {
      const nextScope = resolveDefaultEnvScope()
      internalEnvScope.value = nextScope
      emit('update:envScope', nextScope)
    } else if (
      internalEnvScope.value === '__global__' &&
      envStore.activeEnvId &&
      envs.some(e => e.id === envStore.activeEnvId)
    ) {
      const nextScope = resolveDefaultEnvScope()
      internalEnvScope.value = nextScope
      emit('update:envScope', nextScope)
    }
  }
)

watch(
  () => [collectionStore?.activeRequestId, collectionStore?.activeFolderId],
  () => {
    showBearerToken.value = null
    showBasicPassword.value = null
    showApiKeyValue.value = null
    if (props.envScope === undefined) {
      const nextScope = resolveDefaultEnvScope()
      internalEnvScope.value = nextScope
      emit('update:envScope', nextScope)
    }
  }
)

const availableEnvironments = computed(() => envStore?.environments || [])

const hasEnvAuthOverride = (envId: string): boolean => {
  const cfg = props.authEnvs?.[envId]
  return Boolean(cfg && cfg.type && cfg.type !== 'inherit')
}

const defaultAuthType = computed<AuthConfig['type']>(() =>
  props.isCollection && selectedEnvScope.value === '__global__' ? 'none' : 'inherit'
)

const currentAuth = computed<AuthConfig>(() => {
  if (selectedEnvScope.value === '__global__') {
    return props.modelValue || { type: defaultAuthType.value }
  }
  return props.authEnvs?.[selectedEnvScope.value] || { type: 'inherit' }
})

const updateCurrentAuth = (updated: AuthConfig) => {
  if (selectedEnvScope.value === '__global__') {
    emit('update:modelValue', updated)
  } else {
    const nextEnvs: Record<string, AuthConfig> = { ...(props.authEnvs || {}) }
    nextEnvs[selectedEnvScope.value] = updated
    emit('update:authEnvs', nextEnvs)
  }
}

const authType = computed({
  get: () => currentAuth.value?.type || defaultAuthType.value,
  set: (newType: AuthConfig['type']) => {
    const updated: AuthConfig = { type: newType }
    if (newType === 'bearer') {
      updated.bearer = { token: currentAuth.value?.bearer?.token || '' }
    } else if (newType === 'basic') {
      updated.basic = {
        username: currentAuth.value?.basic?.username || '',
        password: currentAuth.value?.basic?.password || ''
      }
    } else if (newType === 'apiKey') {
      updated.apiKey = {
        key: currentAuth.value?.apiKey?.key || '',
        value: currentAuth.value?.apiKey?.value || '',
        addTo: currentAuth.value?.apiKey?.addTo || 'header'
      }
    }
    updateCurrentAuth(updated)
  }
})

// Inherited auth preview when type is 'inherit'
const inheritedPreview = computed<{
  auth: AuthConfig
  sourceNode?: TreeNode
  sourceCollection?: { id?: string; name?: string }
  fromGlobalSelf?: boolean
} | null>(() => {
  if (authType.value !== 'inherit') return null
  if (
    selectedEnvScope.value !== '__global__' &&
    props.modelValue?.type &&
    props.modelValue.type !== 'inherit'
  ) {
    return {
      auth: props.modelValue,
      fromGlobalSelf: true
    }
  }
  const effectiveEnvId =
    selectedEnvScope.value !== '__global__' ? selectedEnvScope.value : envStore?.activeEnvId
  return resolveEffectiveAuth({ type: 'inherit' }, props.pathNodes, {
    activeEnvId: effectiveEnvId,
    collection: !props.isCollection ? (collectionStore?.activeCollection as any) : null
  })
})

const inheritedFolderLevel = computed(() => {
  if (!inheritedPreview.value?.sourceNode) return null
  const folderNodes = (props.pathNodes || []).filter(n => n && n.type === 'folder')
  const idx = folderNodes.findIndex(f => f.id === inheritedPreview.value?.sourceNode?.id)
  return idx >= 0 ? idx + 1 : 1
})

const bearerToken = computed({
  get: () => currentAuth.value?.bearer?.token || '',
  set: (val: string) => {
    updateCurrentAuth({
      ...currentAuth.value,
      type: 'bearer',
      bearer: { token: val }
    })
  }
})

const basicUsername = computed({
  get: () => currentAuth.value?.basic?.username || '',
  set: (val: string) => {
    updateCurrentAuth({
      ...currentAuth.value,
      type: 'basic',
      basic: {
        username: val,
        password: currentAuth.value?.basic?.password || ''
      }
    })
  }
})

const basicPassword = computed({
  get: () => currentAuth.value?.basic?.password || '',
  set: (val: string) => {
    updateCurrentAuth({
      ...currentAuth.value,
      type: 'basic',
      basic: {
        username: currentAuth.value?.basic?.username || '',
        password: val
      }
    })
  }
})

const apiKeyName = computed({
  get: () => currentAuth.value?.apiKey?.key || '',
  set: (val: string) => {
    updateCurrentAuth({
      ...currentAuth.value,
      type: 'apiKey',
      apiKey: {
        key: val,
        value: currentAuth.value?.apiKey?.value || '',
        addTo: currentAuth.value?.apiKey?.addTo || 'header'
      }
    })
  }
})

const apiKeyValue = computed({
  get: () => currentAuth.value?.apiKey?.value || '',
  set: (val: string) => {
    updateCurrentAuth({
      ...currentAuth.value,
      type: 'apiKey',
      apiKey: {
        key: currentAuth.value?.apiKey?.key || '',
        value: val,
        addTo: currentAuth.value?.apiKey?.addTo || 'header'
      }
    })
  }
})

const hasVariableSyntax = (val: string): boolean => /\{\{/.test(val || '')

const isBearerVisible = computed(() =>
  showBearerToken.value !== null ? showBearerToken.value : hasVariableSyntax(bearerToken.value)
)
const isBasicPasswordVisible = computed(() =>
  showBasicPassword.value !== null ? showBasicPassword.value : hasVariableSyntax(basicPassword.value)
)
const isApiKeyValueVisible = computed(() =>
  showApiKeyValue.value !== null ? showApiKeyValue.value : hasVariableSyntax(apiKeyValue.value)
)

const apiKeyAddTo = computed({
  get: () => currentAuth.value?.apiKey?.addTo || 'header',
  set: (val: 'header' | 'query') => {
    updateCurrentAuth({
      ...currentAuth.value,
      type: 'apiKey',
      apiKey: {
        key: currentAuth.value?.apiKey?.key || '',
        value: currentAuth.value?.apiKey?.value || '',
        addTo: val
      }
    })
  }
})

const envScopeOptions = computed<SelectOption[]>(() => {
  const list: SelectOption[] = [
    { value: '__global__', label: 'Global Auth (Dùng chung)' }
  ]
  for (const env of availableEnvironments.value) {
    list.push({
      value: env.id,
      label: `${env.name} ${hasEnvAuthOverride(env.id) ? '(Custom)' : ''}`.trim()
    })
  }
  return list
})

const authTypeOptions: SelectOption[] = [
  { value: 'inherit', label: 'Inherit from parent' },
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apiKey', label: 'API Key' }
]

const apiKeyAddToOptions: SelectOption[] = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query Params' }
]
</script>

<template>
  <div class="flex flex-col gap-4 max-w-2xl py-2">
    <!-- Environment Scope Selector -->
    <div class="flex items-center justify-between bg-surface-raised/40 p-2.5 rounded-md border border-border-default">
      <div class="flex items-center gap-2">
        <label for="auth-env-scope-select" class="text-xs font-medium text-text-secondary whitespace-nowrap">
          {{ t('auth.envScope') }}:
        </label>
        <CustomSelect
          id="auth-env-scope-select"
          v-model="selectedEnvScope"
          :data-scope="selectedEnvScope"
          data-test="auth-env-scope-select"
          :options="envScopeOptions"
          size="sm"
        />
      </div>
      <span class="text-xs text-text-muted">
        {{ selectedEnvScope === '__global__' ? t('auth.applyAllEnvs') : t('auth.applyCurrentEnvOnly') }}
      </span>
    </div>

    <!-- Type Selector -->
    <div class="flex items-center gap-4">
      <label for="auth-type-select" class="text-xs font-semibold uppercase text-text-muted w-24 shrink-0">
        Auth Type
      </label>
      <CustomSelect
        id="auth-type-select"
        v-model="authType"
        :data-scope="selectedEnvScope"
        :data-auth-type="authType"
        data-test="auth-type-select"
        :options="authTypeOptions"
        size="sm"
      />
    </div>

    <!-- Inherit Mode Details -->
    <div v-if="authType === 'inherit'" class="p-3 bg-surface-raised/40 border border-border-subtle rounded text-xs text-text-secondary">
      <div v-if="inheritedPreview?.fromGlobalSelf && inheritedPreview.auth.type !== 'none'" class="flex items-center gap-2">
        <span class="text-text-muted">{{ t('auth.inheritedFrom') }}:</span>
        <span class="text-blue-400 font-medium">Global Auth</span>
        <span class="text-text-muted ml-2">{{ t('auth.type') }}:</span>
        <span class="uppercase font-mono text-emerald-400 font-medium">{{ inheritedPreview.auth.type }}</span>
      </div>
      <div v-else-if="inheritedPreview?.sourceNode && inheritedPreview.auth.type !== 'none'" class="flex items-center gap-2">
        <span class="text-text-muted">{{ t('auth.inheritedFrom') }}:</span>
        <span class="text-blue-400 font-medium">{{ inheritedPreview.sourceNode.name }} (Folder {{ inheritedFolderLevel }})</span>
        <span class="text-text-muted ml-2">{{ t('auth.type') }}:</span>
        <span class="uppercase font-mono text-emerald-400 font-medium">{{ inheritedPreview.auth.type }}</span>
      </div>
      <div v-else-if="inheritedPreview?.sourceCollection && inheritedPreview.auth.type !== 'none'" class="flex items-center gap-2">
        <span class="text-text-muted">{{ t('auth.inheritedFrom') }}:</span>
        <span class="text-blue-400 font-medium">{{ inheritedPreview.sourceCollection.name || 'Collection' }} (Collection)</span>
        <span class="text-text-muted ml-2">{{ t('auth.type') }}:</span>
        <span class="uppercase font-mono text-emerald-400 font-medium">{{ inheritedPreview.auth.type }}</span>
      </div>
      <div v-else class="text-text-muted italic">
        {{ t('auth.noInheritedAuth') }}
      </div>
    </div>

    <!-- None Mode Details -->
    <div v-else-if="authType === 'none'" class="p-3 bg-surface-raised/40 border border-border-subtle rounded text-xs text-text-muted italic">
      {{ t('auth.noAuthForThis', { item: isCollection ? t('auth.collection') : isFolder ? t('auth.folder') : t('auth.request') }) }}
    </div>

    <!-- Bearer Token Inputs -->
    <div v-else-if="authType === 'bearer'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label for="bearer-token-input" class="text-xs font-medium text-text-muted">Token</label>
        <div class="relative flex items-center bg-surface-raised rounded">
          <VariableHighlighter
            ref="bearerHighlighterRef"
            :value="bearerToken"
            :single-line="true"
            :wrap="false"
            :overlay-class="isBearerVisible ? 'px-3 py-2 pr-10 text-sm font-mono min-h-[38px] w-full border border-transparent whitespace-pre overflow-hidden' : 'hidden'"
          >
            <input
              id="bearer-token-input"
              v-model="bearerToken"
              :type="isBearerVisible ? 'text' : 'password'"
              placeholder="Token or {{token}}"
              class="w-full bg-transparent border border-border-default rounded px-3 py-2 pr-10 text-sm font-mono focus:border-brand-primary outline-none"
              :class="isBearerVisible ? 'transparent-selection text-transparent caret-text-primary placeholder:text-text-muted' : 'text-text-primary'"
              spellcheck="false"
              autocomplete="off"
              @scroll="e => bearerHighlighterRef?.syncScroll(e)"
            />
          </VariableHighlighter>
          <button
            type="button"
            @click="showBearerToken = !isBearerVisible"
            class="absolute right-2 z-10 text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
            :title="isBearerVisible ? t('auth.hideToken') : t('auth.showToken')"
            :aria-label="t('auth.toggleTokenVisibility')"
          >
            <svg v-if="isBearerVisible" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
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
        <div class="relative bg-surface-raised rounded">
          <VariableHighlighter
            ref="basicUserHighlighterRef"
            :value="basicUsername"
            :single-line="true"
            :wrap="false"
            overlay-class="px-3 py-2 text-sm min-h-[38px] w-full border border-transparent whitespace-pre overflow-hidden"
          >
            <input
              id="basic-username-input"
              v-model="basicUsername"
              type="text"
              placeholder="Username or {{username}}"
              class="transparent-selection w-full bg-transparent border border-border-default rounded px-3 py-2 text-sm text-transparent caret-text-primary placeholder:text-text-muted focus:border-brand-primary outline-none"
              spellcheck="false"
              autocomplete="off"
              @scroll="e => basicUserHighlighterRef?.syncScroll(e)"
            />
          </VariableHighlighter>
        </div>
        <span v-if="basicUsername.includes(':')" class="text-[11px] text-amber-400">
          {{ t('auth.colonWarning') }}
        </span>
      </div>
      <div class="flex flex-col gap-1">
        <label for="basic-password-input" class="text-xs font-medium text-text-muted">Password</label>
        <div class="relative flex items-center bg-surface-raised rounded">
          <VariableHighlighter
            ref="basicPassHighlighterRef"
            :value="basicPassword"
            :single-line="true"
            :wrap="false"
            :overlay-class="isBasicPasswordVisible ? 'px-3 py-2 pr-10 text-sm min-h-[38px] w-full border border-transparent whitespace-pre overflow-hidden' : 'hidden'"
          >
            <input
              id="basic-password-input"
              v-model="basicPassword"
              :type="isBasicPasswordVisible ? 'text' : 'password'"
              placeholder="Password or {{password}}"
              class="w-full bg-transparent border border-border-default rounded px-3 py-2 pr-10 text-sm focus:border-brand-primary outline-none"
              :class="isBasicPasswordVisible ? 'transparent-selection text-transparent caret-text-primary placeholder:text-text-muted' : 'text-text-primary'"
              spellcheck="false"
              autocomplete="off"
              @scroll="e => basicPassHighlighterRef?.syncScroll(e)"
            />
          </VariableHighlighter>
          <button
            type="button"
            @click="showBasicPassword = !isBasicPasswordVisible"
            class="absolute right-2 z-10 text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
            :title="isBasicPasswordVisible ? t('auth.hidePassword') : t('auth.showPassword')"
            :aria-label="t('auth.togglePasswordVisibility')"
          >
            <svg v-if="isBasicPasswordVisible" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
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
        <div class="relative flex items-center bg-surface-raised rounded">
          <VariableHighlighter
            ref="apiKeyValHighlighterRef"
            :value="apiKeyValue"
            :single-line="true"
            :wrap="false"
            :overlay-class="isApiKeyValueVisible ? 'px-3 py-2 pr-10 text-sm font-mono min-h-[38px] w-full border border-transparent whitespace-pre overflow-hidden' : 'hidden'"
          >
            <input
              id="api-key-val-input"
              v-model="apiKeyValue"
              :type="isApiKeyValueVisible ? 'text' : 'password'"
              placeholder="Value or {{apiKey}}"
              class="w-full bg-transparent border border-border-default rounded px-3 py-2 pr-10 text-sm font-mono focus:border-brand-primary outline-none"
              :class="isApiKeyValueVisible ? 'transparent-selection text-transparent caret-text-primary placeholder:text-text-muted' : 'text-text-primary'"
              spellcheck="false"
              autocomplete="off"
              @scroll="e => apiKeyValHighlighterRef?.syncScroll(e)"
            />
          </VariableHighlighter>
          <button
            type="button"
            @click="showApiKeyValue = !isApiKeyValueVisible"
            class="absolute right-2 z-10 text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-primary"
            :title="isApiKeyValueVisible ? t('auth.hideValue') : t('auth.showValue')"
            :aria-label="t('auth.toggleValueVisibility')"
          >
            <svg v-if="isApiKeyValueVisible" class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a113.88,113.88,0,0,1-19.78,33.5l16.12,16.13a8,8,0,0,1-11.31,11.31l-184-184A8,8,0,0,1,40.34,3.66L61,24.32A115.06,115.06,0,0,1,128,12a114.28,114.28,0,0,1,100,116ZM92.17,55.51A100.82,100.82,0,0,0,48.16,108.6a8,8,0,0,0,0,10.8,114.73,114.73,0,0,0,55.56,47.46l15-15A44,44,0,0,1,87.65,120.8l15.82-15.82A44.08,44.08,0,0,1,92.17,55.51ZM207.84,119.4A114.73,114.73,0,0,0,152.28,71.94L167.3,56.92A113.62,113.62,0,0,1,207.84,119.4Z"/>
            </svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
              <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.47,133.47,0,0,1,231,128,133.33,133.33,0,0,1,207.93,158.75C185.67,180.81,158.78,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <label for="api-key-add-to-select" class="text-xs font-medium text-text-muted">{{ t('auth.addTo') }}</label>
        <CustomSelect
          id="api-key-add-to-select"
          v-model="apiKeyAddTo"
          data-test="api-key-add-to-select"
          :options="apiKeyAddToOptions"
          full-width
          size="sm"
        />
      </div>
    </div>
  </div>
</template>
