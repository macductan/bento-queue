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

export type VariableScopeKind = 'collection' | 'global-env' | 'folder-global' | 'folder-env'

export interface VariableScopeOption {
  id: string
  kind: VariableScopeKind
  label: string
  folderId?: string
  folderName?: string
  envId?: string
  envName?: string
  value?: string
  hasVariable?: boolean
}

export interface InspectVariableOptions extends ResolveHierarchyOptions {
  activeEnvName?: string | null
  environments?: { id: string; name: string; variables?: VariableKVPair[] }[] | null
}

export interface VariableInspectionResult {
  key: string
  isResolved: boolean
  status: 'resolved' | 'missing'
  effectiveValue: string | undefined
  winningScopeId: string | null
  winningOption: VariableScopeOption | null
  defaultScopeId: string
  defaultOption: VariableScopeOption
  options: VariableScopeOption[]
  valuesByScopeId: Record<string, string>
}

function resolveActiveEnvContext(params?: InspectVariableOptions | null): {
  activeEnvId: string | null
  activeEnvName: string | null
  activeEnvVariables: VariableKVPair[] | Map<string, string> | null
} {
  if (!params) {
    return { activeEnvId: null, activeEnvName: null, activeEnvVariables: null }
  }

  const rawEnvId = typeof params.activeEnvId === 'string' ? params.activeEnvId.trim() : ''
  if (!rawEnvId) {
    return { activeEnvId: null, activeEnvName: null, activeEnvVariables: null }
  }

  const explicitName =
    typeof params.activeEnvName === 'string' && params.activeEnvName.trim() !== ''
      ? params.activeEnvName.trim()
      : null

  if (Array.isArray(params.environments)) {
    const matched = params.environments.find(e => e && e.id === rawEnvId)
    if (!matched) {
      if (explicitName) {
        return {
          activeEnvId: rawEnvId,
          activeEnvName: explicitName,
          activeEnvVariables: params.activeEnvVariables ?? null
        }
      }
      return { activeEnvId: null, activeEnvName: null, activeEnvVariables: null }
    }
    return {
      activeEnvId: rawEnvId,
      activeEnvName: explicitName || matched.name || rawEnvId,
      activeEnvVariables:
        params.activeEnvVariables !== undefined
          ? (params.activeEnvVariables ?? null)
          : (matched.variables ?? [])
    }
  }

  return {
    activeEnvId: rawEnvId,
    activeEnvName: explicitName || rawEnvId,
    activeEnvVariables: params.activeEnvVariables ?? null
  }
}

function findEnabledVariableValue(
  source: VariableKVPair[] | Map<string, string> | null | undefined,
  trimmedKey: string
): string | undefined {
  if (!source || !trimmedKey) return undefined

  if (source instanceof Map) {
    let found: string | undefined = undefined
    for (const [k, v] of source.entries()) {
      if (typeof k === 'string' && k.trim() === trimmedKey) {
        found = v ?? ''
      }
    }
    return found
  }

  if (Array.isArray(source)) {
    let found: string | undefined = undefined
    for (const v of source) {
      if (v && v.enabled && typeof v.key === 'string' && v.key.trim() === trimmedKey) {
        found = v.value ?? ''
      }
    }
    return found
  }

  return undefined
}

/**
 * Builds the ordered list of scope options for VariableHoverPopover:
 * - Ancestor folders from nearest parent (leaf) to top ancestor (root):
 *   - Folder-Env (only for the currently active environment when activeEnvId != null)
 *   - Folder Global (shared across environments)
 * - Global Env (only for the currently active environment when activeEnvId != null)
 * - Collection Env (shared across environments)
 */
export function buildVariableScopeOptions(params?: InspectVariableOptions | null): VariableScopeOption[] {
  const { activeEnvId, activeEnvName } = resolveActiveEnvContext(params)
  const folders = Array.isArray(params?.pathFolders) ? params!.pathFolders! : []
  const options: VariableScopeOption[] = []

  // Traverse from leaf folder (nearest parent) to root folder
  for (let i = folders.length - 1; i >= 0; i--) {
    const folder = folders[i]
    if (!folder) continue
    const folderId = folder.id || `folder-${i}`
    const folderName = folder.name || folderId

    if (activeEnvId && activeEnvName) {
      options.push({
        id: `folder-env:${folderId}:${activeEnvId}`,
        kind: 'folder-env',
        label: `Folder: ${folderName} (${activeEnvName})`,
        folderId,
        folderName,
        envId: activeEnvId,
        envName: activeEnvName
      })
    }

    options.push({
      id: `folder-global:${folderId}`,
      kind: 'folder-global',
      label: `Folder: ${folderName} (Dùng chung)`,
      folderId,
      folderName
    })
  }

  if (activeEnvId && activeEnvName) {
    options.push({
      id: `global-env:${activeEnvId}`,
      kind: 'global-env',
      label: `Global Env (${activeEnvName})`,
      envId: activeEnvId,
      envName: activeEnvName
    })
  }

  options.push({
    id: 'collection',
    kind: 'collection',
    label: 'Collection Env (Dùng chung)'
  })

  return options
}

/**
 * Inspects a variable across the 4-tier hierarchy and determines:
 * - All valid scope options for the dropdown (filtering strictly to activeEnvId)
 * - The value of the variable at each scope (if defined & enabled)
 * - The winning tier (winningScopeId) following Level 1 -> Level 2 -> Level 3 (Root..Leaf) -> Level 4 (Root..Leaf)
 * - The default selected scope (winningScopeId when resolved; Global Env (Active) or Collection Env when missing)
 */
export function inspectVariableHierarchy(
  keyOrOptions: string | (InspectVariableOptions & { key: string }),
  maybeOptions?: InspectVariableOptions | null
): VariableInspectionResult {
  let rawKey = ''
  let params: InspectVariableOptions = {}

  if (typeof keyOrOptions === 'string') {
    rawKey = keyOrOptions
    params = maybeOptions || {}
  } else if (keyOrOptions && typeof keyOrOptions === 'object') {
    rawKey = keyOrOptions.key || ''
    params = keyOrOptions
  }

  const trimmedKey = rawKey.trim()
  const { activeEnvId, activeEnvVariables } = resolveActiveEnvContext(params)
  const folders = Array.isArray(params.pathFolders) ? params.pathFolders : []
  const baseOptions = buildVariableScopeOptions(params)

  const valuesByScopeId: Record<string, string> = {}
  let winningScopeId: string | null = null
  let effectiveValue: string | undefined = undefined

  // Level 1: Collection Env (lowest precedence)
  const collVal = findEnabledVariableValue(params.collectionVariables, trimmedKey)
  if (collVal !== undefined) {
    valuesByScopeId['collection'] = collVal
    winningScopeId = 'collection'
    effectiveValue = collVal
  }

  // Level 2: Global Env (Active Environment)
  if (activeEnvId) {
    const globalScopeId = `global-env:${activeEnvId}`
    const globalVal = findEnabledVariableValue(activeEnvVariables, trimmedKey)
    if (globalVal !== undefined) {
      valuesByScopeId[globalScopeId] = globalVal
      winningScopeId = globalScopeId
      effectiveValue = globalVal
    }
  }

  // Level 3: Folder Global Env (Root -> Leaf)
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]
    if (!folder) continue
    const folderId = folder.id || `folder-${i}`
    const scopeId = `folder-global:${folderId}`
    const val = findEnabledVariableValue(folder.variables, trimmedKey)
    if (val !== undefined) {
      valuesByScopeId[scopeId] = val
      winningScopeId = scopeId
      effectiveValue = val
    }
  }

  // Level 4: Folder-Env for Active Environment (Root -> Leaf, highest precedence)
  if (activeEnvId) {
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i]
      if (!folder) continue
      const folderId = folder.id || `folder-${i}`
      const scopeId = `folder-env:${folderId}:${activeEnvId}`
      const specificVars =
        folder.folder_envs && typeof folder.folder_envs === 'object'
          ? folder.folder_envs[activeEnvId]
          : undefined
      const val = findEnabledVariableValue(specificVars, trimmedKey)
      if (val !== undefined) {
        valuesByScopeId[scopeId] = val
        winningScopeId = scopeId
        effectiveValue = val
      }
    }
  }

  const options: VariableScopeOption[] = baseOptions.map(opt => {
    const hasVariable = Object.prototype.hasOwnProperty.call(valuesByScopeId, opt.id)
    return {
      ...opt,
      hasVariable,
      value: hasVariable ? valuesByScopeId[opt.id] : undefined
    }
  })

  const isResolved = winningScopeId !== null
  const defaultScopeId = isResolved
    ? winningScopeId!
    : activeEnvId
      ? `global-env:${activeEnvId}`
      : 'collection'

  const winningOption = winningScopeId ? options.find(o => o.id === winningScopeId) || null : null
  const defaultOption = options.find(o => o.id === defaultScopeId) || options[options.length - 1]

  return {
    key: trimmedKey,
    isResolved,
    status: isResolved ? 'resolved' : 'missing',
    effectiveValue,
    winningScopeId,
    winningOption,
    defaultScopeId,
    defaultOption,
    options,
    valuesByScopeId
  }
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
