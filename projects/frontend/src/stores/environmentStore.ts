import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ListEnvironments, SaveEnvironment, DeleteEnvironment } from '../../wailsjs/go/main/App'
import { model } from '../../wailsjs/go/models'
import { useUiStore } from './uiStore'
import { useCollectionStore } from './collectionStore'

export const useEnvironmentStore = defineStore('environment', () => {
  const environments = ref<model.Environment[]>([])
  const activeEnvId = ref<string | null>(null)
  const loaded = ref<boolean>(false)
  const uiStore = useUiStore()

  const variablesMap = computed(() => {
    const map = new Map<string, string>()
    if (!activeEnvId.value) return map
    
    const env = environments.value.find(e => e.id === activeEnvId.value)
    if (!env || !env.variables) return map

    for (const v of env.variables) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value)
      }
    }
    return map
  })

  function syncActiveEnvFromCollection() {
    const collectionStore = useCollectionStore()
    const activeColl = collectionStore.activeCollection
    const savedEnvId = activeColl?.active_env_id || null
    if (savedEnvId && environments.value.some(e => e.id === savedEnvId)) {
      activeEnvId.value = savedEnvId
    } else {
      activeEnvId.value = null
      if (loaded.value && activeColl && activeColl.active_env_id) {
        activeColl.active_env_id = ''
      }
    }
  }

  async function loadAll() {
    try {
      const result = await ListEnvironments()
      if (result.success) {
        environments.value = result.data as model.Environment[] || []
        loaded.value = true

        if (activeEnvId.value && environments.value.some(e => e.id === activeEnvId.value)) {
          return
        }

        const collectionStore = useCollectionStore()
        if (collectionStore.activeCollection) {
          syncActiveEnvFromCollection()
        } else if (activeEnvId.value && !environments.value.find(e => e.id === activeEnvId.value)) {
          // If activeEnvId points to a deleted environment, clear it
          activeEnvId.value = null
        }
      } else {
        uiStore.showToast(`Error loading environments: ${result.error?.message}`)
      }
    } catch (e: any) {
      uiStore.showToast(`Failed to load environments: ${e.message}`)
    }
  }

  async function save(env: model.Environment) {
    try {
      // Ensure there's no dangling empty row if it's the only row, but it's okay, UI handles it.
      // Filter out completely empty rows (no key, no value) at the very end
      if (env.variables) {
         env.variables = env.variables.filter(v => v.key.trim() !== '' || v.value.trim() !== '')
      }

      const result = await SaveEnvironment(env)
      if (result.success) {
        await loadAll() // Reload to get updated list (with IDs and updated timestamps)
        return true
      } else {
        uiStore.showToast(`Error saving environment: ${result.error?.message}`)
        return false
      }
    } catch (e: any) {
      uiStore.showToast(`Failed to save environment: ${e.message}`)
      return false
    }
  }

  async function remove(id: string) {
    try {
      const collectionStore = useCollectionStore()
      const wasActive = activeEnvId.value === id || collectionStore.activeCollection?.active_env_id === id
      const result = await DeleteEnvironment(id)
      if (result.success) {
        if (wasActive) {
          activeEnvId.value = null
          await collectionStore.updateActiveCollectionEnv(null)
        }
        await loadAll()
        return true
      } else {
        uiStore.showToast(`Error deleting environment: ${result.error?.message}`)
        return false
      }
    } catch (e: any) {
      uiStore.showToast(`Failed to delete environment: ${e.message}`)
      return false
    }
  }

  async function refresh() {
    loaded.value = false
    environments.value = []
    activeEnvId.value = null
    await loadAll()
  }

  async function setActive(id: string | null): Promise<boolean> {
    activeEnvId.value = id
    const collectionStore = useCollectionStore()
    return await collectionStore.updateActiveCollectionEnv(id)
  }

  return {
    environments,
    activeEnvId,
    loaded,
    variablesMap,
    syncActiveEnvFromCollection,
    loadAll,
    refresh,
    save,
    remove,
    setActive
  }
})
