import type { Request, KVPair } from '../stores/requestStore'
import type { TreeNode, AuthConfig } from '../stores/collectionStore'
import { resolveVariables, parseVariables } from './variables'
import { getInheritedHeaders, mergeHeaders, getDefaultHeaders } from './headers'
import {
  resolveEffectiveAuth,
  getAuthArtifacts,
  toBase64,
  type EffectiveAuthResult,
  type ResolveEffectiveAuthOptions,
  type AppliedAuth
} from './auth'
import {
  resolveHierarchyVariables,
  type ResolveHierarchyOptions,
  type FolderNodeLike,
  type VariableKVPair
} from './resolveHierarchyVariables'
import { buildExecuteRequest, type ExecuteRequest } from './buildExecuteRequest'
import {
  executeScript,
  type ScriptExecutionContext,
  type ScriptExecutionResult,
  type ScopedEnvUpdates,
  type ScopedAuthUpdates,
  type ScriptLogEntry,
  type ScriptTestResult
} from './scriptRunner'
import { isCurlCommand, parseCurlCommand, generateCurlCommand, type ParsedCurlResult } from './curl'
import { stripJsoncToJson } from './jsonEditor'
import {
  reconcileParamsFromUrl,
  reconcilePathParamsFromUrl,
  updateUrlWithParams,
  parseUrl,
  resolvePathParamsInUrl
} from './urlParams'

export {
  resolveVariables,
  parseVariables,
  getInheritedHeaders,
  mergeHeaders,
  getDefaultHeaders,
  resolveEffectiveAuth,
  getAuthArtifacts,
  toBase64,
  resolveHierarchyVariables,
  buildExecuteRequest,
  executeScript,
  isCurlCommand,
  parseCurlCommand,
  generateCurlCommand,
  stripJsoncToJson,
  reconcileParamsFromUrl,
  reconcilePathParamsFromUrl,
  updateUrlWithParams,
  parseUrl,
  resolvePathParamsInUrl
}

export type {
  EffectiveAuthResult,
  ResolveEffectiveAuthOptions,
  AppliedAuth,
  ResolveHierarchyOptions,
  FolderNodeLike,
  VariableKVPair,
  ExecuteRequest,
  ScriptExecutionContext,
  ScriptExecutionResult,
  ScopedEnvUpdates,
  ScopedAuthUpdates,
  ScriptLogEntry,
  ScriptTestResult,
  ParsedCurlResult
}

export const stripJsonComments = stripJsoncToJson
export const runPreRequestScript = executeScript
export const runPostResponseScript = executeScript

export function resolveHeaders(
  requestHeaders: KVPair[] = [],
  inheritedHeaders: KVPair[] = [],
  vars: Map<string, string> = new Map()
): KVPair[] {
  const merged = mergeHeaders(requestHeaders, inheritedHeaders)
  return merged
    .filter(h => h.enabled && h.key.trim() !== '')
    .map(h => ({
      key: h.key.trim(),
      value: resolveVariables(h.value || '', vars),
      enabled: true
    }))
}

export function resolveAuth(
  auth: AuthConfig | undefined,
  pathNodes: TreeNode[] = [],
  vars: Map<string, string> = new Map(),
  options?: ResolveEffectiveAuthOptions
): AppliedAuth {
  const { auth: effectiveAuth } = resolveEffectiveAuth(auth, pathNodes, options)
  return getAuthArtifacts(effectiveAuth, vars)
}

export function reconcileUrlAndParams(
  url: string,
  params: KVPair[] = [],
  pathParams: KVPair[] = []
): { url: string; params: KVPair[]; path_params: KVPair[] } {
  const { params: parsedFromUrl } = parseUrl(url || '')
  const existingParams = Array.isArray(params) ? params : []

  const mergedParams: KVPair[] = parsedFromUrl.map(p => ({ ...p }))
  const usedIndices = new Set<number>()

  for (const ep of existingParams) {
    if (!ep || typeof ep.key !== 'string' || ep.key.trim() === '') continue
    if (!ep.enabled) {
      mergedParams.push({ ...ep })
      continue
    }
    const epVal = ep.value ?? ''
    const matchIdx = mergedParams.findIndex(
      (mp, idx) => !usedIndices.has(idx) && mp.enabled && mp.key === ep.key && mp.value === epVal
    )
    if (matchIdx !== -1) {
      usedIndices.add(matchIdx)
      if (ep.description !== undefined) {
        mergedParams[matchIdx].description = ep.description
      }
      if (ep._isAuto !== undefined) {
        mergedParams[matchIdx]._isAuto = ep._isAuto
      }
    } else {
      mergedParams.push({ ...ep, value: epVal })
    }
  }

  const nextUrl = updateUrlWithParams(url || '', mergedParams)
  const nextPathParams = reconcilePathParamsFromUrl(nextUrl, pathParams || [])
  return {
    url: nextUrl,
    params: mergedParams,
    path_params: nextPathParams
  }
}

export interface HeadlessCollectionModel {
  id?: string
  name?: string
  variables?: VariableKVPair[]
  auth?: AuthConfig
  auth_envs?: Record<string, AuthConfig>
  active_env_id?: string
}

export interface HeadlessEnvironmentModel {
  id: string
  name: string
  variables?: VariableKVPair[]
}

export interface HeadlessPreRequestInput {
  request: Request
  collection?: HeadlessCollectionModel | null
  environments?: HeadlessEnvironmentModel[]
  activeEnvId?: string | null
  pathFolders?: TreeNode[]
  allFolders?: TreeNode[]
  cliVarOverrides?: Record<string, string>
}

export interface HeadlessPreRequestOutput {
  executeRequest: ExecuteRequest
  effectiveRequest: Request
  resolvedVariables: Record<string, string>
  preScriptResult: ScriptExecutionResult | null
  mutatedCollection: HeadlessCollectionModel
  mutatedEnvironments: HeadlessEnvironmentModel[]
  mutatedPathFolders: TreeNode[]
  mutatedAllFolders: TreeNode[]
}

export interface HeadlessPostResponseInput {
  effectiveRequest: Request
  response: {
    status_code: number
    status_text: string
    headers: Record<string, string[]>
    body: string
    time_ms: number
    size_bytes: number
    timestamp?: string
    truncated?: boolean
    is_binary?: boolean
  }
  resolvedVariables?: Record<string, string>
  collection?: HeadlessCollectionModel | null
  environments?: HeadlessEnvironmentModel[]
  activeEnvId?: string | null
  pathFolders?: TreeNode[]
  allFolders?: TreeNode[]
  cliVarOverrides?: Record<string, string>
}

function deepClone<T>(val: T): T {
  if (val === undefined || val === null) return val
  return JSON.parse(JSON.stringify(val))
}

function upsertKVPair(list: VariableKVPair[], key: string, value: string): void {
  const existing = list.find(item => item && item.key === key)
  if (existing) {
    existing.value = value
    existing.enabled = true
  } else {
    list.push({ key, value, enabled: true })
  }
}

function resolveEnvIdInMemory(
  envSelector: string | undefined | null,
  activeEnvId: string | null | undefined,
  environments: HeadlessEnvironmentModel[]
): string | null {
  if (!envSelector || envSelector === '__active__') {
    return activeEnvId || null
  }
  const trimmed = envSelector.trim()
  const lower = trimmed.toLowerCase()
  const matched = environments.find(
    e => e && (e.id?.toLowerCase() === lower || e.name?.trim().toLowerCase() === lower)
  )
  return matched ? matched.id : trimmed
}

function resolveFolderIdInMemory(
  folderSelector: string | undefined | null,
  pathFolders: TreeNode[],
  allFolders: TreeNode[]
): string | null {
  if (!folderSelector || folderSelector === '__nearest__') {
    return pathFolders.length > 0 ? pathFolders[pathFolders.length - 1].id : null
  }
  const trimmed = folderSelector.trim()
  const lower = trimmed.toLowerCase()

  // Search from nearest parent to root in pathFolders first
  for (let i = pathFolders.length - 1; i >= 0; i--) {
    const f = pathFolders[i]
    if (f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower)) {
      return f.id
    }
  }

  // Fallback to allFolders
  const inAll = allFolders.find(
    f => f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower)
  )
  if (inAll) return inAll.id

  return null
}

export function applyScriptUpdatesInMemory(
  scriptRes: ScriptExecutionResult,
  collection: HeadlessCollectionModel,
  environments: HeadlessEnvironmentModel[],
  activeEnvId: string | null | undefined,
  pathFolders: TreeNode[],
  allFolders: TreeNode[]
): void {
  const syncFolderNodes = (folderId: string, updater: (node: TreeNode) => void) => {
    for (const pf of pathFolders) {
      if (pf && pf.id === folderId) updater(pf)
    }
    for (const af of allFolders) {
      if (af && af.id === folderId) updater(af)
    }
  }

  // 1. Default envUpdates (ha.variables.set / ha.environment.set without explicit env)
  const envEntries = Object.entries(scriptRes.envUpdates || {})
  if (envEntries.length > 0) {
    let appliedToActiveEnv = false
    if (activeEnvId) {
      const activeEnv = environments.find(e => e && e.id === activeEnvId)
      if (activeEnv) {
        if (!Array.isArray(activeEnv.variables)) activeEnv.variables = []
        for (const [k, v] of envEntries) {
          upsertKVPair(activeEnv.variables, k, v)
        }
        appliedToActiveEnv = true
      }
    }
    if (!appliedToActiveEnv) {
      if (!Array.isArray(collection.variables)) collection.variables = []
      for (const [k, v] of envEntries) {
        upsertKVPair(collection.variables, k, v)
      }
    }
  }

  // 2. Scoped variable updates
  const scoped = scriptRes.scopedEnvUpdates
  if (scoped) {
    const collEntries = Object.entries(scoped.collection || {})
    if (collEntries.length > 0) {
      if (!Array.isArray(collection.variables)) collection.variables = []
      for (const [k, v] of collEntries) {
        upsertKVPair(collection.variables, k, v)
      }
    }

    for (const [envKey, kvMap] of Object.entries(scoped.globalEnvs || {})) {
      const targetEnvId = resolveEnvIdInMemory(envKey, activeEnvId, environments)
      if (!targetEnvId) continue
      const targetEnv = environments.find(e => e && e.id === targetEnvId)
      if (targetEnv) {
        if (!Array.isArray(targetEnv.variables)) targetEnv.variables = []
        for (const [k, v] of Object.entries(kvMap || {})) {
          upsertKVPair(targetEnv.variables, k, v)
        }
      }
    }

    for (const [folderSel, kvMap] of Object.entries(scoped.folderGlobals || {})) {
      const fId = resolveFolderIdInMemory(folderSel, pathFolders, allFolders)
      if (!fId) continue
      syncFolderNodes(fId, node => {
        if (!Array.isArray(node.variables)) node.variables = []
        for (const [k, v] of Object.entries(kvMap || {})) {
          upsertKVPair(node.variables as VariableKVPair[], k, v)
        }
      })
    }

    for (const item of scoped.folderEnvs || []) {
      const fId = resolveFolderIdInMemory(item.folder, pathFolders, allFolders)
      const targetEnvId = resolveEnvIdInMemory(item.env, activeEnvId, environments)
      if (!fId || !targetEnvId) continue
      syncFolderNodes(fId, node => {
        if (!node.folder_envs || typeof node.folder_envs !== 'object') {
          node.folder_envs = {}
        }
        if (!Array.isArray(node.folder_envs[targetEnvId])) {
          node.folder_envs[targetEnvId] = []
        }
        upsertKVPair(node.folder_envs[targetEnvId] as VariableKVPair[], item.key, item.value)
      })
    }
  }

  // 3. Scoped Auth updates
  const authUpdates = scriptRes.scopedAuthUpdates
  if (authUpdates) {
    if (authUpdates.collectionGlobal !== undefined && authUpdates.collectionGlobal) {
      collection.auth = deepClone(authUpdates.collectionGlobal)
    }
    for (const item of authUpdates.collectionEnvs || []) {
      const targetEnvId = resolveEnvIdInMemory(item.env, activeEnvId, environments)
      if (!targetEnvId) continue
      if (!collection.auth_envs || typeof collection.auth_envs !== 'object') {
        collection.auth_envs = {}
      }
      collection.auth_envs[targetEnvId] = deepClone(item.auth)
    }
    for (const [folderSel, authCfg] of Object.entries(authUpdates.folderGlobals || {})) {
      if (!authCfg) continue
      const fId = resolveFolderIdInMemory(folderSel, pathFolders, allFolders)
      if (!fId) continue
      syncFolderNodes(fId, node => {
        node.auth = deepClone(authCfg)
      })
    }
    for (const item of authUpdates.folderEnvs || []) {
      if (!item.auth) continue
      const fId = resolveFolderIdInMemory(item.folder, pathFolders, allFolders)
      const targetEnvId = resolveEnvIdInMemory(item.env, activeEnvId, environments)
      if (!fId || !targetEnvId) continue
      syncFolderNodes(fId, node => {
        if (!node.auth_envs || typeof node.auth_envs !== 'object') {
          node.auth_envs = {}
        }
        node.auth_envs[targetEnvId] = deepClone(item.auth)
      })
    }
  }
}

function computeResolvedVariables(
  collection: HeadlessCollectionModel,
  environments: HeadlessEnvironmentModel[],
  activeEnvId: string | null | undefined,
  pathFolders: TreeNode[],
  cliVarOverrides?: Record<string, string>
): Map<string, string> {
  const activeEnv = activeEnvId ? environments.find(e => e && e.id === activeEnvId) : undefined
  const vars = resolveHierarchyVariables({
    collectionVariables: collection.variables || [],
    activeEnvVariables: activeEnv?.variables || [],
    pathFolders,
    activeEnvId: activeEnvId || null
  })
  if (cliVarOverrides) {
    for (const [k, v] of Object.entries(cliVarOverrides)) {
      if (k.trim() !== '') {
        vars.set(k.trim(), v)
      }
    }
  }
  return vars
}

export function prepareHeadlessExecution(input: HeadlessPreRequestInput): HeadlessPreRequestOutput {
  const effectiveReq: Request = deepClone(input.request)
  const mutatedCollection: HeadlessCollectionModel = deepClone(
    input.collection || { id: 'default', name: 'Default', variables: [] }
  )
  const mutatedEnvironments: HeadlessEnvironmentModel[] = deepClone(input.environments || [])
  const mutatedPathFolders: TreeNode[] = deepClone(input.pathFolders || [])
  const mutatedAllFolders: TreeNode[] = deepClone(
    input.allFolders && input.allFolders.length > 0 ? input.allFolders : mutatedPathFolders
  )
  const effectiveActiveEnvId =
    input.activeEnvId !== undefined ? input.activeEnvId : (mutatedCollection.active_env_id || null)

  // Step 1: Bidirectional URL <-> Query Params & Path Params sync
  const reconciled = reconcileUrlAndParams(
    effectiveReq.url || '',
    effectiveReq.params || [],
    effectiveReq.path_params || []
  )
  effectiveReq.url = reconciled.url
  effectiveReq.params = reconciled.params
  effectiveReq.path_params = reconciled.path_params

  // Step 2: Resolve initial 4-tier variables + CLI overrides
  let vars = computeResolvedVariables(
    mutatedCollection,
    mutatedEnvironments,
    effectiveActiveEnvId,
    mutatedPathFolders,
    input.cliVarOverrides
  )

  // Step 3: Run Pre-request Script if present
  let preScriptResult: ScriptExecutionResult | null = null
  const preScriptCode = effectiveReq.scripts?.pre_request?.trim() || ''
  if (preScriptCode !== '') {
    preScriptResult = executeScript(preScriptCode, {
      variables: vars,
      request: effectiveReq,
      collectionVariables: mutatedCollection.variables,
      collectionAuth: mutatedCollection.auth,
      collectionAuthEnvs: mutatedCollection.auth_envs,
      environments: mutatedEnvironments,
      activeEnvId: effectiveActiveEnvId,
      pathFolders: mutatedPathFolders,
      allFolders: mutatedAllFolders
    })

    const mut = preScriptResult.requestMutations
    if (mut.url !== undefined) effectiveReq.url = mut.url
    if (mut.method !== undefined) effectiveReq.method = mut.method
    if (mut.params !== undefined) effectiveReq.params = mut.params.map(p => ({ ...p }))
    if (mut.path_params !== undefined) effectiveReq.path_params = mut.path_params.map(p => ({ ...p }))
    if (mut.headers !== undefined) effectiveReq.headers = mut.headers.map(h => ({ ...h }))
    if (mut.body !== undefined) {
      if (!effectiveReq.body) effectiveReq.body = { type: 'none', content: '' }
      if (mut.body.type !== undefined) effectiveReq.body.type = mut.body.type
      if (mut.body.content !== undefined) {
        effectiveReq.body.content = mut.body.content
        delete effectiveReq.body.urlencoded
        delete effectiveReq.body.form_data
      }
    }
    if (mut.auth !== undefined) {
      effectiveReq.auth = mut.auth
    }

    if (mut.url !== undefined || mut.params !== undefined) {
      if (mut.url !== undefined && mut.params === undefined) {
        effectiveReq.params = reconcileParamsFromUrl(effectiveReq.url, effectiveReq.params || [])
      }
      effectiveReq.url = updateUrlWithParams(effectiveReq.url, effectiveReq.params || [])
      if (mut.path_params === undefined) {
        effectiveReq.path_params = reconcilePathParamsFromUrl(
          effectiveReq.url,
          effectiveReq.path_params || []
        )
      }
    }

    // Apply variable and auth mutations in-memory so buildExecuteRequest & post-response see them immediately.
    // Preserve vars as mutated by executeScript (including .unset and overrides on CLI vars).
    const scriptMutatedVars = new Map(vars)
    applyScriptUpdatesInMemory(
      preScriptResult,
      mutatedCollection,
      mutatedEnvironments,
      effectiveActiveEnvId,
      mutatedPathFolders,
      mutatedAllFolders
    )
    vars = scriptMutatedVars
  }

  // Step 4 & 5: Inherited Headers + buildExecuteRequest
  const inheritedHeaders = getInheritedHeaders(mutatedPathFolders)
  const executeRequest = buildExecuteRequest(
    effectiveReq,
    vars,
    inheritedHeaders,
    mutatedPathFolders,
    {
      activeEnvId: effectiveActiveEnvId,
      requestAuthEnvs: effectiveReq.auth_envs,
      collection: mutatedCollection
    }
  )

  return {
    executeRequest,
    effectiveRequest: effectiveReq,
    resolvedVariables: Object.fromEntries(vars),
    preScriptResult,
    mutatedCollection,
    mutatedEnvironments,
    mutatedPathFolders,
    mutatedAllFolders
  }
}

export function runHeadlessPostResponse(input: HeadlessPostResponseInput): ScriptExecutionResult | null {
  const effectiveReq = input.effectiveRequest
  const postScriptCode = effectiveReq?.scripts?.post_response?.trim() || ''
  if (postScriptCode === '') {
    return null
  }

  const mutatedCollection: HeadlessCollectionModel = deepClone(
    input.collection || { id: 'default', name: 'Default', variables: [] }
  )
  const mutatedEnvironments: HeadlessEnvironmentModel[] = deepClone(input.environments || [])
  const mutatedPathFolders: TreeNode[] = deepClone(input.pathFolders || [])
  const mutatedAllFolders: TreeNode[] = deepClone(
    input.allFolders && input.allFolders.length > 0 ? input.allFolders : mutatedPathFolders
  )
  const effectiveActiveEnvId =
    input.activeEnvId !== undefined ? input.activeEnvId : (mutatedCollection.active_env_id || null)

  const vars = input.resolvedVariables
    ? new Map<string, string>(Object.entries(input.resolvedVariables))
    : computeResolvedVariables(
        mutatedCollection,
        mutatedEnvironments,
        effectiveActiveEnvId,
        mutatedPathFolders,
        input.cliVarOverrides
      )

  return executeScript(postScriptCode, {
    variables: vars,
    response: {
      ...input.response,
      timestamp: input.response.timestamp || new Date().toISOString(),
      truncated: Boolean(input.response.truncated),
      is_binary: Boolean(input.response.is_binary)
    },
    request: effectiveReq,
    collectionVariables: mutatedCollection.variables,
    collectionAuth: mutatedCollection.auth,
    collectionAuthEnvs: mutatedCollection.auth_envs,
    environments: mutatedEnvironments,
    activeEnvId: effectiveActiveEnvId,
    pathFolders: mutatedPathFolders,
    allFolders: mutatedAllFolders
  })
}

const HeadlessBundleExports = {
  resolveVariables,
  parseVariables,
  getInheritedHeaders,
  mergeHeaders,
  getDefaultHeaders,
  resolveHeaders,
  resolveEffectiveAuth,
  getAuthArtifacts,
  resolveAuth,
  toBase64,
  resolveHierarchyVariables,
  buildExecuteRequest,
  executeScript,
  runPreRequestScript,
  runPostResponseScript,
  isCurlCommand,
  parseCurlCommand,
  generateCurlCommand,
  stripJsoncToJson,
  stripJsonComments,
  reconcileParamsFromUrl,
  reconcilePathParamsFromUrl,
  updateUrlWithParams,
  reconcileUrlAndParams,
  parseUrl,
  resolvePathParamsInUrl,
  applyScriptUpdatesInMemory,
  prepareHeadlessExecution,
  runHeadlessPostResponse
}

if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).HectoEngine = HeadlessBundleExports
  ;(globalThis as any).HectoHeadless = HeadlessBundleExports
}
