<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCollectionStore, type AuthConfig } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import KvpEditor from './KvpEditor.vue'
import AuthEditor from './AuthEditor.vue'

const props = defineProps<{
  modelValue: boolean
  collectionId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const collectionStore = useCollectionStore()
const uiStore = useUiStore()

const targetCollection = computed(() => {
  return collectionStore.collections.find(c => c.id === props.collectionId) || null
})

const activeTab = ref<'variables' | 'auth'>('variables')
const variables = ref<{ key: string; value: string; enabled: boolean }[]>([])
const collectionAuth = ref<AuthConfig>({ type: 'none' })
const collectionAuthEnvs = ref<Record<string, AuthConfig>>({})
const collectionAuthEnvScope = ref<string>('__global__')
const saving = ref(false)

watch(
  () => [props.modelValue, targetCollection.value] as const,
  ([isOpen, coll]) => {
    if (isOpen && coll) {
      variables.value = JSON.parse(JSON.stringify(coll.variables || []))
      collectionAuth.value = coll.auth ? JSON.parse(JSON.stringify(coll.auth)) : { type: 'none' }
      collectionAuthEnvs.value = coll.auth_envs ? JSON.parse(JSON.stringify(coll.auth_envs)) : {}
      collectionAuthEnvScope.value = '__global__'
    }
  },
  { immediate: true }
)

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleBackdropClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    close()
  }
}

const handleSave = async () => {
  if (saving.value || !targetCollection.value) return
  saving.value = true
  try {
    const cleanAuthEnvs: Record<string, AuthConfig> = {}
    for (const [envId, envAuth] of Object.entries(collectionAuthEnvs.value || {})) {
      if (envAuth && envAuth.type && envAuth.type !== 'inherit') {
        cleanAuthEnvs[envId] = envAuth
      }
    }
    const hasAuthConfigured =
      (collectionAuth.value.type && collectionAuth.value.type !== 'none' && collectionAuth.value.type !== 'inherit') ||
      Object.keys(cleanAuthEnvs).length > 0 ||
      Boolean(targetCollection.value.auth || targetCollection.value.auth_envs)
    const ok = hasAuthConfigured
      ? await collectionStore.updateCollectionVariables(
          props.collectionId,
          variables.value,
          collectionAuth.value,
          cleanAuthEnvs
        )
      : await collectionStore.updateCollectionVariables(props.collectionId, variables.value)
    if (ok) {
      uiStore.showToast('Đã lưu biến collection')
      close()
    }
  } finally {
    saving.value = false
  }
}

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    e.stopPropagation()
    void handleSave()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[1100] bg-surface-base/80 backdrop-blur-xs flex items-center justify-center p-4"
      @click="handleBackdropClick"
      @keydown.esc.stop.prevent="close"
    >
      <div
        class="bg-surface-raised border border-border-default rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-env-modal-title"
      >
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-border-default">
          <div class="flex flex-col">
            <h3 id="collection-env-modal-title" class="heading-sm text-text-primary">
              Biến môi trường Collection (Collection Env)
            </h3>
            <span class="text-xs text-text-muted mt-0.5">
              Collection: <span class="font-medium text-text-secondary">{{ targetCollection?.name }}</span>
              (Có hiệu lực cho toàn bộ request thuộc collection trên mọi môi trường - Mức 1)
            </span>
          </div>
          <button
            type="button"
            @click="close"
            class="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-overlay transition-colors"
            aria-label="Đóng"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-border-default px-4 bg-surface-base" role="tablist">
          <button
            type="button"
            role="tab"
            data-test="collection-modal-tab-variables"
            :aria-selected="activeTab === 'variables'"
            @click="activeTab = 'variables'"
            class="flex items-center gap-2 px-4 h-9 border-b-2 outline-none font-medium text-xs transition-colors cursor-pointer"
            :class="activeTab === 'variables' ? 'border-brand-primary text-blue-400' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'"
          >
            Variables
          </button>
          <button
            type="button"
            role="tab"
            data-test="collection-modal-tab-auth"
            :aria-selected="activeTab === 'auth'"
            @click="activeTab = 'auth'"
            class="flex items-center gap-2 px-4 h-9 border-b-2 outline-none font-medium text-xs transition-colors cursor-pointer"
            :class="activeTab === 'auth' ? 'border-brand-primary text-blue-400' : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'"
          >
            Auth
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 flex-1 overflow-y-auto">
          <div v-show="activeTab === 'variables'">
            <KvpEditor v-model="variables" />
          </div>
          <div v-show="activeTab === 'auth'">
            <AuthEditor
              v-model="collectionAuth"
              v-model:authEnvs="collectionAuthEnvs"
              v-model:envScope="collectionAuthEnvScope"
              :is-collection="true"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 p-3 border-t border-border-default bg-surface-base">
          <button
            type="button"
            @click="close"
            class="px-3 py-1.5 rounded text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            @click="handleSave"
            :disabled="saving"
            class="px-4 py-1.5 rounded text-xs font-medium bg-brand-primary text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
            data-test="save-collection-env-btn"
          >
            {{ saving ? 'Đang lưu...' : 'Lưu' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
