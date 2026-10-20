import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ListEnvironments, SaveEnvironment, DeleteEnvironment, LoadFolder, UpdateFolder } from '../../wailsjs/go/main/App'
import { model } from '../../wailsjs/go/models'
import { useUiStore } from './uiStore'
import { useCollectionStore, type TreeNode, type AuthConfig } from './collectionStore'
import type { ScopedEnvUpdates, ScopedAuthUpdates } from '../utils/scriptRunner'
import type { FolderNodeLike } from '../utils/resolveHierarchyVariables'

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

  async function applyVariableUpdates(updates: Record<string, string>): Promise<void> {
    const entries = Object.entries(updates)
    if (entries.length === 0) return

    if (activeEnvId.value) {
      const env = environments.value.find(e => e.id === activeEnvId.value)
      if (env) {
        if (!env.variables) env.variables = []
        for (const [key, val] of entries) {
          const existing = env.variables.find(v => v.key === key)
          if (existing) {
            existing.value = val
            existing.enabled = true
          } else {
            env.variables.push({ key, value: val, enabled: true } as any)
          }
        }
        await SaveEnvironment(env)
        return
      }
    }

    const collectionStore = useCollectionStore()
    const activeColl = collectionStore.activeCollection
    if (activeColl) {
      const nextVars = Array.isArray(activeColl.variables)
        ? activeColl.variables.map(v => ({ ...v }))
        : []
      for (const [key, val] of entries) {
        const existing = nextVars.find(v => v.key === key)
        if (existing) {
          existing.value = val
          existing.enabled = true
        } else {
          nextVars.push({ key, value: val, enabled: true })
        }
      }
      activeColl.variables = nextVars
      if (activeColl.id) {
        await collectionStore.updateCollectionVariables(activeColl.id, nextVars)
      }
    }
  }

  async function applyScopedVariableUpdates(
    scoped: ScopedEnvUpdates | undefined,
    pathFolders: FolderNodeLike[] = []
  ): Promise<void> {
    if (!scoped) return
    const collectionStore = useCollectionStore()

    // 1. Collection Env updates (ha.globals.set / ha.collectionVariables.set)
    const collEntries = Object.entries(scoped.collection || {})
    if (collEntries.length > 0 && collectionStore.activeCollection) {
      const activeColl = collectionStore.activeCollection
      const nextVars = Array.isArray(activeColl.variables)
        ? activeColl.variables.map(v => ({ ...v }))
        : []
      for (const [key, val] of collEntries) {
        const existing = nextVars.find(v => v.key === key)
        if (existing) {
          existing.value = val
          existing.enabled = true
        } else {
          nextVars.push({ key, value: val, enabled: true })
        }
      }
      activeColl.variables = nextVars
      if (activeColl.id) {
        await collectionStore.updateCollectionVariables(activeColl.id, nextVars)
      }
    }

    // 2. Specific Global Env updates (ha.environment.set(key, val, envNameOrId))
    for (const [envKey, varsMap] of Object.entries(scoped.globalEnvs || {})) {
      const entries = Object.entries(varsMap)
      if (entries.length === 0) continue
      const lower = envKey.trim().toLowerCase()
      const targetEnv = environments.value.find(
        e => e.id.toLowerCase() === lower || e.name.trim().toLowerCase() === lower
      )
      if (targetEnv) {
        if (!targetEnv.variables) targetEnv.variables = []
        for (const [key, val] of entries) {
          const existing = targetEnv.variables.find(v => v.key === key)
          if (existing) {
            existing.value = val
            existing.enabled = true
          } else {
            targetEnv.variables.push({ key, value: val, enabled: true } as any)
          }
        }
        await SaveEnvironment(targetEnv)
      }
    }

    // Helper to resolve folder ID from folderNameOrId or '__nearest__'
    const resolveFolderId = (folderSelector: string): string | null => {
      if (!folderSelector || folderSelector === '__nearest__') {
        const nearest = pathFolders.length > 0 ? pathFolders[pathFolders.length - 1] : null
        return nearest?.id || null
      }
      const lower = folderSelector.trim().toLowerCase()
      const fromPath = pathFolders.find(
        f => f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower)
      )
      if (fromPath?.id) return fromPath.id

      let foundId: string | null = null
      const walk = (nodes: TreeNode[] | undefined) => {
        if (!Array.isArray(nodes) || foundId) return
        for (const n of nodes) {
          if (n.type === 'folder') {
            if (n.id.toLowerCase() === lower || n.name.trim().toLowerCase() === lower) {
              foundId = n.id
              return
            }
            if (n.children) walk(n.children)
          }
        }
      }
      walk(collectionStore.tree)
      return foundId
    }

    // Group folder updates by folderId so we only LoadFolder/UpdateFolder once per folder
    const folderMutations = new Map<
      string,
      {
        globals: Record<string, string>
        envs: Record<string, Record<string, string>>
      }
    >()

    for (const [folderSel, kvMap] of Object.entries(scoped.folderGlobals || {})) {
      const fId = resolveFolderId(folderSel)
      if (!fId) continue
      if (!folderMutations.has(fId)) {
        folderMutations.set(fId, { globals: {}, envs: {} })
      }
      Object.assign(folderMutations.get(fId)!.globals, kvMap)
    }

    for (const item of scoped.folderEnvs || []) {
      const fId = resolveFolderId(item.folder)
      if (!fId) continue
      let targetEnvId = activeEnvId.value
      if (item.env && item.env !== '__active__') {
        const lowerEnv = item.env.trim().toLowerCase()
        const matched = environments.value.find(
          e => e.id.toLowerCase() === lowerEnv || e.name.trim().toLowerCase() === lowerEnv
        )
        targetEnvId = matched?.id || item.env.trim()
      }
      if (!targetEnvId) continue
      if (!folderMutations.has(fId)) {
        folderMutations.set(fId, { globals: {}, envs: {} })
      }
      const fm = folderMutations.get(fId)!
      if (!fm.envs[targetEnvId]) fm.envs[targetEnvId] = {}
      fm.envs[targetEnvId][item.key] = item.value
    }

    let anyFolderUpdated = false
    for (const [folderId, mut] of folderMutations.entries()) {
      try {
        const loadRes = await LoadFolder(folderId)
        if (!loadRes?.success || !loadRes.data) continue
        const folderData = JSON.parse(JSON.stringify(loadRes.data))
        folderData.id = folderData.id || folderId

        if (!Array.isArray(folderData.variables)) folderData.variables = []
        for (const [k, v] of Object.entries(mut.globals)) {
          const existing = folderData.variables.find((item: any) => item.key === k)
          if (existing) {
            existing.value = v
            existing.enabled = true
          } else {
            folderData.variables.push({ key: k, value: v, enabled: true })
          }
        }

        if (!folderData.folder_envs || typeof folderData.folder_envs !== 'object') {
          folderData.folder_envs = {}
        }
        for (const [envId, envVarsMap] of Object.entries(mut.envs)) {
          if (!Array.isArray(folderData.folder_envs[envId])) {
            folderData.folder_envs[envId] = []
          }
          for (const [k, v] of Object.entries(envVarsMap)) {
            const existing = folderData.folder_envs[envId].find((item: any) => item.key === k)
            if (existing) {
              existing.value = v
              existing.enabled = true
            } else {
              folderData.folder_envs[envId].push({ key: k, value: v, enabled: true })
            }
          }
        }

        const updateRes = await UpdateFolder(folderData)
        if (updateRes?.success) {
          anyFolderUpdated = true
          const treeNode = collectionStore.findNode(collectionStore.tree, folderId)
          if (treeNode) {
            treeNode.variables = folderData.variables
            treeNode.folder_envs = folderData.folder_envs
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('hecto:folder-updated', { detail: folderData }))
          }
        }
      } catch {
        // ignore folder update errors in script runner
      }
    }

    if (anyFolderUpdated) {
      await collectionStore.loadTree()
    }
  }

  async function applyScopedAuthUpdates(
    scopedAuthUpdates?: ScopedAuthUpdates,
    pathNodes: TreeNode[] = []
  ): Promise<void> {
    if (!scopedAuthUpdates) return
    const { folderGlobals, folderEnvs, collectionGlobal, collectionEnvs } = scopedAuthUpdates
    const hasFolderGlobals = folderGlobals && Object.keys(folderGlobals).length > 0
    const hasFolderEnvs = folderEnvs && folderEnvs.length > 0
    const hasCollectionGlobal = collectionGlobal !== undefined
    const hasCollectionEnvs = collectionEnvs && collectionEnvs.length > 0

    if (!hasFolderGlobals && !hasFolderEnvs && !hasCollectionGlobal && !hasCollectionEnvs) {
      return
    }

    const collectionStore = useCollectionStore()

    // 1. Collection Auth updates
    if (hasCollectionGlobal || hasCollectionEnvs) {
      const activeColl = collectionStore.activeCollection
      if (activeColl && activeColl.id) {
        let collAuth = activeColl.auth ? JSON.parse(JSON.stringify(activeColl.auth)) : undefined
        const collAuthEnvs = activeColl.auth_envs ? JSON.parse(JSON.stringify(activeColl.auth_envs)) : {}
        if (hasCollectionGlobal && collectionGlobal) {
          collAuth = collectionGlobal
        }
        if (hasCollectionEnvs && collectionEnvs) {
          for (const item of collectionEnvs) {
            let targetEnvId = item.env === '__active__' ? activeEnvId.value : item.env
            const matched = environments.value.find(
              e => e.id?.toLowerCase() === item.env.toLowerCase() || e.name?.trim().toLowerCase() === item.env.toLowerCase()
            )
            if (matched) targetEnvId = matched.id
            if (targetEnvId) {
              collAuthEnvs[targetEnvId] = item.auth
            }
          }
        }
        await collectionStore.updateCollectionVariables(activeColl.id, activeColl.variables || [], collAuth, collAuthEnvs)
      }
    }

    // 2. Folder Auth updates
    const resolveFolderId = (folderNameOrId: string): string | undefined => {
      const target = (folderNameOrId || '').trim().toLowerCase()
      if (!target || target === '__nearest__') {
        return pathNodes.length > 0 ? pathNodes[pathNodes.length - 1].id : undefined
      }
      const inPath = pathNodes.find(
        n => n.id?.toLowerCase() === target || n.name?.trim().toLowerCase() === target
      )
      if (inPath) return inPath.id

      let foundId: string | undefined = undefined
      const walk = (nodes: TreeNode[] | undefined) => {
        if (!Array.isArray(nodes) || foundId) return
        for (const n of nodes) {
          if (n.type === 'folder') {
            if (n.id?.toLowerCase() === target || n.name?.trim().toLowerCase() === target) {
              foundId = n.id
              return
            }
            if (n.children) walk(n.children)
          }
        }
      }
      walk(collectionStore.tree)
      return foundId
    }

    interface FolderAuthMutation {
      global?: AuthConfig
      envs: Record<string, AuthConfig>
    }
    const folderMutations = new Map<string, FolderAuthMutation>()

    if (hasFolderGlobals) {
      for (const [fNameOrId, auth] of Object.entries(folderGlobals)) {
        if (!auth) continue
        const fId = resolveFolderId(fNameOrId)
        if (!fId) continue
        if (!folderMutations.has(fId)) {
          folderMutations.set(fId, { envs: {} })
        }
        folderMutations.get(fId)!.global = auth
      }
    }

    if (hasFolderEnvs) {
      for (const item of folderEnvs) {
        if (!item.auth) continue
        const fId = resolveFolderId(item.folder)
        if (!fId) continue
        let targetEnvId: string | undefined
        if (item.env === '__active__') {
          targetEnvId = activeEnvId.value || undefined
        } else {
          const matched = environments.value.find(
            e => e.id?.toLowerCase() === item.env.toLowerCase() || e.name?.trim().toLowerCase() === item.env.toLowerCase()
          )
          targetEnvId = matched?.id || item.env.trim()
        }
        if (!targetEnvId) continue
        if (!folderMutations.has(fId)) {
          folderMutations.set(fId, { envs: {} })
        }
        folderMutations.get(fId)!.envs[targetEnvId] = item.auth
      }
    }

    let anyFolderUpdated = false
    for (const [folderId, mut] of folderMutations.entries()) {
      try {
        const loadRes = await LoadFolder(folderId)
        if (!loadRes?.success || !loadRes.data) continue
        const folderData = JSON.parse(JSON.stringify(loadRes.data))
        folderData.id = folderData.id || folderId

        if (mut.global) {
          folderData.auth = mut.global
        }
        if (Object.keys(mut.envs).length > 0) {
          if (!folderData.auth_envs || typeof folderData.auth_envs !== 'object' || Array.isArray(folderData.auth_envs)) {
            folderData.auth_envs = {}
          }
          for (const [envId, auth] of Object.entries(mut.envs)) {
            folderData.auth_envs[envId] = auth
          }
        }

        const updateRes = await UpdateFolder(folderData)
        if (updateRes?.success) {
          anyFolderUpdated = true
          const treeNode = collectionStore.findNode(collectionStore.tree, folderId)
          if (treeNode) {
            if (folderData.auth) treeNode.auth = folderData.auth
            if (folderData.auth_envs) treeNode.auth_envs = folderData.auth_envs
          }
          const inPathNode = pathNodes.find(n => n.id === folderId)
          if (inPathNode) {
            if (folderData.auth) inPathNode.auth = folderData.auth
            if (folderData.auth_envs) inPathNode.auth_envs = folderData.auth_envs
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('hecto:folder-updated', { detail: folderData }))
          }
        }
      } catch {
        // ignore folder update errors in script runner
      }
    }

    if (anyFolderUpdated) {
      await collectionStore.loadTree()
    }
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
    setActive,
    applyVariableUpdates,
    applyScopedVariableUpdates,
    applyScopedAuthUpdates
  }
})
