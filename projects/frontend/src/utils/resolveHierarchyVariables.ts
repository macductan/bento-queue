export interface VariableKVPair {
  key: string
  value: string
  enabled?: boolean
}

export interface FolderNodeLike {
  id?: string
  name?: string
  variables?: VariableKVPair[]
  folder_envs?: Record<string, VariableKVPair[]>
}

export interface ResolveHierarchyOptions {
  collectionVariables?: VariableKVPair[] | null
  activeEnvVariables?: VariableKVPair[] | Map<string, string> | null
  pathFolders?: FolderNodeLike[] | null
  activeEnvId?: string | null
}

/**
 * Resolves variables according to the 4-tier environment hierarchy:
 * Level 1: Collection Env (lowest precedence)
 * Level 2: Global Env (active environment selected in environmentStore)
 * Level 3: Folder Global Env (shared variables of ancestor folders from root to leaf)
 * Level 4: Folder-Env (environment-specific folder variables from root to leaf, highest precedence)
 *
 * Can be called with an options object or positional arguments.
 */
export function resolveHierarchyVariables(
  optionsOrCollVars?: ResolveHierarchyOptions | VariableKVPair[] | null,
  activeEnvVariables?: VariableKVPair[] | Map<string, string> | null,
  pathFolders?: FolderNodeLike[] | null,
  activeEnvId?: string | null
): Map<string, string> {
  let collVars: VariableKVPair[] | null | undefined
  let envVars: VariableKVPair[] | Map<string, string> | null | undefined
  let folders: FolderNodeLike[] | null | undefined
  let envId: string | null | undefined

  if (
    optionsOrCollVars &&
    !Array.isArray(optionsOrCollVars) &&
    typeof optionsOrCollVars === 'object'
  ) {
    const opts = optionsOrCollVars as ResolveHierarchyOptions
    collVars = opts.collectionVariables
    envVars = opts.activeEnvVariables
    folders = opts.pathFolders
    envId = opts.activeEnvId
  } else {
    collVars = optionsOrCollVars as VariableKVPair[] | null | undefined
    envVars = activeEnvVariables
    folders = pathFolders
    envId = activeEnvId
  }

  const map = new Map<string, string>()

  // Level 1: Collection Env (Always active for the collection)
  if (collVars && Array.isArray(collVars)) {
    for (const v of collVars) {
      if (v && v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
        map.set(v.key.trim(), v.value ?? '')
      }
    }
  }

  // Level 2: Global Env (Active Environment)
  if (envId !== null && envVars) {
    if (envVars instanceof Map) {
      for (const [k, v] of envVars.entries()) {
        if (typeof k === 'string' && k.trim() !== '') {
          map.set(k.trim(), v ?? '')
        }
      }
    } else if (Array.isArray(envVars)) {
      for (const v of envVars) {
        if (v && v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
          map.set(v.key.trim(), v.value ?? '')
        }
      }
    }
  }

  // Level 3: Folder Global Env (from top ancestor to nearest child)
  if (folders && Array.isArray(folders)) {
    for (const folder of folders) {
      if (folder && folder.variables && Array.isArray(folder.variables)) {
        for (const v of folder.variables) {
          if (v && v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
            map.set(v.key.trim(), v.value ?? '')
          }
        }
      }
    }
  }

  // Level 4: Folder-Env (Environment-specific variables per folder, top to nearest child)
  if (envId && folders && Array.isArray(folders)) {
    for (const folder of folders) {
      if (folder && folder.folder_envs && typeof folder.folder_envs === 'object') {
        const specificVars = folder.folder_envs[envId]
        if (specificVars && Array.isArray(specificVars)) {
          for (const v of specificVars) {
            if (v && v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
              map.set(v.key.trim(), v.value ?? '')
            }
          }
        }
      }
    }
  }

  return map
}
