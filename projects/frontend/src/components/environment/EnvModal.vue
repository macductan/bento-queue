<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { model } from '../../../wailsjs/go/models'

const uiStore = useUiStore()
const envStore = useEnvironmentStore()

const localEnvs = ref<model.Environment[]>([])
const selectedIndex = ref<number>(-1)

const selectedEnv = computed(() => {
  if (selectedIndex.value >= 0 && selectedIndex.value < localEnvs.value.length) {
    return localEnvs.value[selectedIndex.value]
  }
  return null
})

// Initialize localEnvs when modal opens
watch(() => uiStore.envModalOpen, (isOpen) => {
  if (isOpen) {
    // Deep copy from store to allow local edits
    localEnvs.value = JSON.parse(JSON.stringify(envStore.environments))
    if (localEnvs.value.length > 0) {
      selectedIndex.value = 0
      ensureEmptyRow()
    } else {
      selectedIndex.value = -1
    }
  }
})

// Add an empty row if needed
function ensureEmptyRow() {
  const env = selectedEnv.value
  if (!env) return
  if (!env.variables) {
    env.variables = []
  }
  const vars = env.variables
  if (vars.length === 0 || vars[vars.length - 1].key !== '' || vars[vars.length - 1].value !== '') {
    vars.push(new model.KVPair({ key: '', value: '', enabled: true }))
  }
}

function handleInput() {
  ensureEmptyRow()
}

function removeVar(index: number) {
  const env = selectedEnv.value
  if (!env) return
  env.variables.splice(index, 1)
  ensureEmptyRow()
}

function createEnv() {
  const newEnv = new model.Environment({
    id: '',
    name: 'Tạo Môi trường',
    variables: [new model.KVPair({ key: '', value: '', enabled: true })]
  })
  localEnvs.value.push(newEnv)
  selectedIndex.value = localEnvs.value.length - 1
}

async function deleteEnv(index: number) {
  const env = localEnvs.value[index]
  if (env.id) {
    const ok = await envStore.remove(env.id)
    if (!ok) return // Revert if backend deletion fails
  }
  localEnvs.value.splice(index, 1)
  if (selectedIndex.value >= localEnvs.value.length) {
    selectedIndex.value = localEnvs.value.length - 1
  }
  if (selectedIndex.value >= 0) {
    ensureEmptyRow()
  }
}

async function closeAndSave() {
  const envsToSave = [...localEnvs.value]
  for (const env of envsToSave) {
    const originalEnv = envStore.environments.find(e => e.id === env.id)
    
    // If it's a new environment, save it
    if (!originalEnv || !env.id) {
      await envStore.save(env)
      continue
    }

    // Compare name and variables (ignoring empty rows)
    const currentVars = (env.variables || []).filter(v => v.key.trim() !== '' || v.value.trim() !== '')
    const originalVars = (originalEnv.variables || []).filter(v => v.key.trim() !== '' || v.value.trim() !== '')

    const currentObj = { 
      name: env.name, 
      variables: currentVars.map(v => ({ key: v.key, value: v.value, enabled: v.enabled })) 
    }
    const originalObj = { 
      name: originalEnv.name, 
      variables: originalVars.map(v => ({ key: v.key, value: v.value, enabled: v.enabled })) 
    }

    if (JSON.stringify(currentObj) !== JSON.stringify(originalObj)) {
      await envStore.save(env)
    }
  }
  await envStore.loadAll()
  uiStore.envModalOpen = false
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.envModalOpen) {
    e.preventDefault()
    e.stopPropagation()
    closeAndSave()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div v-if="uiStore.envModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @mousedown.self="closeAndSave">
    <div class="bg-surface-base rounded-xl shadow-lg w-[800px] h-[600px] flex flex-col overflow-hidden border border-border-default">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-raised">
        <h2 class="heading-sm text-text-primary">Quản lý Môi trường</h2>
        <button @click="closeAndSave" class="text-text-muted hover:text-text-primary p-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <!-- Body -->
      <div class="flex flex-1 min-h-0">
        <!-- Left Panel: List -->
        <div class="w-1/3 border-r border-border-default flex flex-col bg-surface-raised">
          <div class="p-2 border-b border-border-default">
            <button @click="createEnv" class="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-interactive-default hover:bg-interactive-hover text-text-on-interactive rounded-md text-sm font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Tạo Môi trường
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div 
              v-for="(env, idx) in localEnvs" 
              :key="idx"
              @click="selectedIndex = idx; ensureEmptyRow()"
              class="flex items-center justify-between group px-3 py-2 rounded-md cursor-pointer text-sm"
              :class="selectedIndex === idx ? 'bg-surface-highlight text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-hover'"
            >
              <span class="truncate flex-1">{{ env.name || 'Unnamed' }}</span>
              <button 
                @click.stop="deleteEnv(idx)"
                class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-status-error p-1"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Right Panel: Editor -->
        <div class="w-2/3 flex flex-col bg-surface-base">
          <template v-if="selectedEnv">
            <div class="p-4 border-b border-border-default">
              <label class="block text-xs font-medium text-text-muted mb-1">Tên Môi trường</label>
              <input 
                v-model="selectedEnv.name" 
                type="text" 
                class="w-full bg-surface-input border border-border-default rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-interactive-default"
                placeholder="vd: Production"
              />
            </div>
            
            <div class="flex-1 overflow-y-auto">
              <table class="w-full text-left border-collapse">
                <thead class="sticky top-0 bg-surface-raised border-b border-border-default z-10">
                  <tr>
                    <th class="w-10 px-3 py-2 border-r border-border-default"></th>
                    <th class="px-3 py-2 text-xs font-medium text-text-muted border-r border-border-default">Key</th>
                    <th class="px-3 py-2 text-xs font-medium text-text-muted">Value</th>
                    <th class="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="(vr, vIdx) in selectedEnv.variables" 
                    :key="vIdx"
                    class="border-b border-border-default group hover:bg-surface-hover"
                  >
                    <td class="w-10 px-3 py-2 border-r border-border-default text-center">
                      <button 
                        v-if="vIdx < selectedEnv.variables.length - 1"
                        type="button"
                        role="checkbox"
                        :aria-checked="vr.enabled"
                        @click="vr.enabled = !vr.enabled"
                        class="w-4 h-4 mx-auto rounded-[4px] border flex items-center justify-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                        :class="vr.enabled ? 'bg-brand-primary border-brand-primary text-white' : 'bg-surface-input border-border-default text-transparent hover:border-border-focus'"
                        aria-label="Bật/tắt dòng"
                      >
                        <svg class="w-3.5 h-3.5 font-bold" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="216 72 104 184 48 128"></polyline>
                        </svg>
                      </button>
                    </td>
                    <td class="p-0 border-r border-border-default">
                      <input 
                        v-model="vr.key" 
                        @input="handleInput"
                        type="text" 
                        class="w-full bg-transparent px-3 py-2 text-text-primary focus:outline-none focus:bg-surface-input"
                        placeholder="Key"
                      />
                    </td>
                    <td class="p-0">
                      <input 
                        v-model="vr.value" 
                        @input="handleInput"
                        type="text" 
                        class="w-full bg-transparent px-3 py-2 text-text-primary focus:outline-none focus:bg-surface-input"
                        placeholder="Value"
                      />
                    </td>
                    <td class="w-10 px-3 py-2 text-center">
                      <button 
                        v-if="vIdx < selectedEnv.variables.length - 1"
                        @click="removeVar(vIdx)"
                        class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-status-error p-1"
                        title="Remove Variable"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <div v-else class="flex-1 flex items-center justify-center text-text-muted">
            Chọn hoặc tạo môi trường
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
