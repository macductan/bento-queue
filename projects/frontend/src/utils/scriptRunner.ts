import type { ExecuteResponse } from '../stores/responseStore'
import type { KVPair, Request } from '../stores/requestStore'
import type { FolderNodeLike, VariableKVPair } from './resolveHierarchyVariables'
import { updateUrlWithParams, reconcileParamsFromUrl, reconcilePathParamsFromUrl } from './urlParams'
import type { AuthConfig } from '../stores/collectionStore'

export interface ScriptLogEntry {
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  phase?: 'pre-request' | 'post-response' | 'http'
}

export interface ScopedEnvUpdates {
  collection: Record<string, string>
  globalEnvs: Record<string, Record<string, string>>
  folderGlobals: Record<string, Record<string, string>>
  folderEnvs: Array<{
    folder: string
    env: string
    key: string
    value: string
  }>
}

export interface ScopedAuthUpdates {
  folderGlobals: Record<string, AuthConfig>
  folderEnvs: Array<{
    folder: string
    env: string
    auth: AuthConfig
  }>
  collectionGlobal?: AuthConfig
  collectionEnvs?: Array<{
    env: string
    auth: AuthConfig
  }>
}

export interface ScriptRequestMutations {
  url?: string
  method?: string
  params?: KVPair[]
  path_params?: KVPair[]
  headers?: KVPair[]
  body?: {
    type?: string
    content?: string
  }
  auth?: AuthConfig
}

export interface ScriptExecutionContext {
  variables: Map<string, string>
  response?: ExecuteResponse | null
  request?: Partial<Request> | null
  collectionVariables?: VariableKVPair[] | null
  collectionAuth?: AuthConfig | any | null
  collectionAuthEnvs?: Record<string, AuthConfig | any> | null
  environments?: Array<{ id: string; name: string; variables?: VariableKVPair[] }> | null
  activeEnvId?: string | null
  pathFolders?: FolderNodeLike[] | null
  allFolders?: FolderNodeLike[] | null
}

export interface ScriptTestResult {
  name: string
  passed: boolean
  error?: string
}

export interface ScriptExecutionResult {
  success: boolean
  logs: string[]
  logEntries: ScriptLogEntry[]
  testResults: ScriptTestResult[]
  envUpdates: Record<string, string>
  scopedEnvUpdates: ScopedEnvUpdates
  scopedAuthUpdates: ScopedAuthUpdates
  requestMutations: ScriptRequestMutations
  error?: string
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg === undefined) return 'undefined'
  if (arg === null) return 'null'
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
}

function toStringVal(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function normalizeAuthConfig(input: unknown): AuthConfig {
  if (!input) {
    return { type: 'inherit' }
  }
  if (typeof input === 'string') {
    const s = input.trim().toLowerCase()
    if (s === 'inherit' || s === 'none') {
      return { type: s as any }
    }
    return { type: 'inherit' }
  }
  if (typeof input !== 'object') {
    return { type: 'inherit' }
  }
  const obj = input as any
  const typeLower = String(obj.type || '').trim().toLowerCase()
  if (typeLower === 'inherit' || typeLower === 'none') {
    return { type: typeLower as any }
  }
  if (typeLower === 'bearer' || obj.bearer || obj.token !== undefined) {
    const rawToken = obj.bearer?.token ?? obj.token ?? obj.value ?? ''
    return {
      type: 'bearer',
      bearer: { token: toStringVal(rawToken) }
    }
  }
  if (
    typeLower === 'basic' ||
    obj.basic ||
    obj.username !== undefined ||
    obj.password !== undefined ||
    obj.user !== undefined ||
    obj.pass !== undefined
  ) {
    const username = obj.basic?.username ?? obj.username ?? obj.user ?? ''
    const password = obj.basic?.password ?? obj.password ?? obj.pass ?? ''
    return {
      type: 'basic',
      basic: {
        username: toStringVal(username),
        password: toStringVal(password)
      }
    }
  }
  if (
    typeLower === 'apikey' ||
    typeLower === 'api_key' ||
    typeLower === 'api-key' ||
    obj.apiKey ||
    obj.key !== undefined ||
    obj.name !== undefined
  ) {
    const key = obj.apiKey?.key ?? obj.key ?? obj.name ?? ''
    const value = obj.apiKey?.value ?? obj.value ?? ''
    const addTo = obj.apiKey?.addTo ?? obj.addTo ?? 'header'
    return {
      type: 'apiKey',
      apiKey: {
        key: toStringVal(key),
        value: toStringVal(value),
        addTo: String(addTo).toLowerCase() === 'query' ? 'query' : 'header'
      }
    }
  }
  // If only value was passed with no explicit type, default to bearer if value present
  if (obj.value !== undefined && !obj.type) {
    return {
      type: 'bearer',
      bearer: { token: toStringVal(obj.value) }
    }
  }
  return { type: 'inherit' }
}

export function executeScript(
  code: string | undefined | null,
  context: ScriptExecutionContext
): ScriptExecutionResult {
  const logs: string[] = []
  const logEntries: ScriptLogEntry[] = []
  const testResults: ScriptTestResult[] = []
  const envUpdates: Record<string, string> = {}
  const scopedEnvUpdates: ScopedEnvUpdates = {
    collection: {},
    globalEnvs: {},
    folderGlobals: {},
    folderEnvs: []
  }
  const scopedAuthUpdates: ScopedAuthUpdates = {
    folderGlobals: {},
    folderEnvs: [],
    collectionEnvs: []
  }
  const requestMutations: ScriptRequestMutations = {}

  if (!code || !code.trim()) {
    return {
      success: true,
      logs,
      logEntries,
      testResults,
      envUpdates,
      scopedEnvUpdates,
      scopedAuthUpdates,
      requestMutations
    }
  }

  // Clone mutable request state if provided
  let currentUrl = context.request?.url ?? ''
  let currentMethod = context.request?.method ?? 'GET'
  let currentParams: KVPair[] = Array.isArray(context.request?.params)
    ? context.request!.params!.map(p => ({ ...p }))
    : reconcileParamsFromUrl(currentUrl, [])
  let currentPathParams: KVPair[] = Array.isArray(context.request?.path_params)
    ? context.request!.path_params!.map(p => ({ ...p }))
    : reconcilePathParamsFromUrl(currentUrl, [])
  let currentHeaders: KVPair[] = Array.isArray(context.request?.headers)
    ? context.request!.headers!.map(h => ({ ...h }))
    : []
  let currentBodyType = context.request?.body?.type ?? 'none'
  let currentBodyContent = context.request?.body?.content ?? ''

  const findFolder = (folderNameOrId?: string): FolderNodeLike | undefined => {
    const ancestors = Array.isArray(context.pathFolders) ? context.pathFolders : []
    const all = Array.isArray(context.allFolders) ? context.allFolders : ancestors
    if (!folderNameOrId || !folderNameOrId.trim()) {
      return ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined
    }
    const target = folderNameOrId.trim().toLowerCase()
    return (
      ancestors.find(
        f => f && (f.id?.toLowerCase() === target || f.name?.trim().toLowerCase() === target)
      ) ||
      all.find(
        f => f && (f.id?.toLowerCase() === target || f.name?.trim().toLowerCase() === target)
      )
    )
  }

  const findEnv = (envNameOrId?: string) => {
    const envs = Array.isArray(context.environments) ? context.environments : []
    if (!envNameOrId || !envNameOrId.trim()) {
      if (!context.activeEnvId) return undefined
      return envs.find(e => e && e.id === context.activeEnvId)
    }
    const target = envNameOrId.trim().toLowerCase()
    return envs.find(
      e => e && (e.id?.toLowerCase() === target || e.name?.trim().toLowerCase() === target)
    )
  }

  const getVar = (key: string, envNameOrId?: string): string | undefined => {
    const k = String(key ?? '').trim()
    if (!k) return undefined
    if (envNameOrId && envNameOrId.trim()) {
      const targetKey = envNameOrId.trim()
      if (scopedEnvUpdates.globalEnvs[targetKey] && k in scopedEnvUpdates.globalEnvs[targetKey]) {
        return scopedEnvUpdates.globalEnvs[targetKey][k] || undefined
      }
      const envObj = findEnv(targetKey)
      const found = envObj?.variables?.find(v => v && v.enabled !== false && v.key.trim() === k)
      return found?.value
    }
    return context.variables.get(k)
  }

  const setVar = (keyOrObj: unknown, value?: unknown, envNameOrId?: string): void => {
    if (typeof keyOrObj === 'object' && keyOrObj !== null) {
      const targetEnv = typeof value === 'string' ? value : envNameOrId
      for (const [k, v] of Object.entries(keyOrObj as Record<string, unknown>)) {
        setVar(k, v, targetEnv)
      }
      return
    }
    const k = String(keyOrObj ?? '').trim()
    if (!k) return
    const strVal = toStringVal(value)
    if (envNameOrId && envNameOrId.trim()) {
      const targetEnvKey = envNameOrId.trim()
      if (!scopedEnvUpdates.globalEnvs[targetEnvKey]) {
        scopedEnvUpdates.globalEnvs[targetEnvKey] = {}
      }
      scopedEnvUpdates.globalEnvs[targetEnvKey][k] = strVal
      const matchedEnv = findEnv(targetEnvKey)
      if (context.activeEnvId && matchedEnv?.id === context.activeEnvId) {
        context.variables.set(k, strVal)
      }
      return
    }
    context.variables.set(k, strVal)
    envUpdates[k] = strVal
  }

  const createEnvScope = (targetEnv?: string) => ({
    get: (key: string): string | undefined => getVar(key, targetEnv),
    set: (keyOrObj: unknown, value?: unknown): void => {
      setVar(keyOrObj, value, targetEnv)
    },
    unset: (key: string): void => {
      unsetVar(key, targetEnv)
    },
    toObject: (): Record<string, string> => {
      if (!targetEnv || !targetEnv.trim()) {
        return Object.fromEntries(context.variables.entries())
      }
      const envObj = findEnv(targetEnv)
      const res: Record<string, string> = {}
      if (envObj?.variables) {
        for (const v of envObj.variables) {
          if (v && v.enabled !== false && v.key.trim()) {
            res[v.key.trim()] = v.value
          }
        }
      }
      const updates = scopedEnvUpdates.globalEnvs[targetEnv.trim()]
      if (updates) {
        for (const [k, v] of Object.entries(updates)) {
          if (v === '') {
            delete res[k]
          } else {
            res[k] = v
          }
        }
      }
      return res
    },
    get name(): string {
      const env = findEnv(targetEnv)
      return env?.name ?? ''
    },
    get id(): string {
      const env = findEnv(targetEnv)
      return env?.id ?? ''
    },
    folder: (folderName?: string) => ({
      get: (key: string): string | undefined => folderEnvApi.get(key, folderName, targetEnv),
      set: (keyOrObj: unknown, value?: unknown): void => {
        folderEnvApi.set(keyOrObj, value, folderName, targetEnv)
      },
      unset: (key: string): void => {
        folderEnvApi.unset(key, folderName, targetEnv)
      },
      auth: createFolderAuthEnvMethods(folderName, targetEnv)
    }),
    auth: {
      folder: (folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv),
      get: (folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).get(),
      set: (auth: unknown, folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).set(auth),
      inherit: (folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).inherit(),
      none: (folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).none(),
      unset: (folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).unset(),
      clear: (folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).clear(),
      setBearer: (token: unknown, folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).setBearer(token),
      setBasic: (u: unknown, p: unknown, folderName?: string) => createFolderAuthEnvMethods(folderName, targetEnv).setBasic(u, p),
      setApiKey: (k: unknown, v: unknown, addTo?: 'header' | 'query', folderName?: string) =>
        createFolderAuthEnvMethods(folderName, targetEnv).setApiKey(k, v, addTo)
    }
  })

  const unsetVar = (key: string, envNameOrId?: string): void => {
    const k = String(key ?? '').trim()
    if (!k) return
    if (envNameOrId && envNameOrId.trim()) {
      const targetEnvKey = envNameOrId.trim()
      if (!scopedEnvUpdates.globalEnvs[targetEnvKey]) {
        scopedEnvUpdates.globalEnvs[targetEnvKey] = {}
      }
      scopedEnvUpdates.globalEnvs[targetEnvKey][k] = ''
      const matchedEnv = findEnv(targetEnvKey)
      if (context.activeEnvId && matchedEnv?.id === context.activeEnvId) {
        context.variables.delete(k)
      }
      return
    }
    context.variables.delete(k)
    envUpdates[k] = ''
  }

  const isFolderInPath = (folderNameOrId?: string): boolean => {
    if (!folderNameOrId || !folderNameOrId.trim() || folderNameOrId.trim() === '__nearest__') {
      return true
    }
    const target = folderNameOrId.trim().toLowerCase()
    const pathFolders = Array.isArray(context.pathFolders) ? context.pathFolders : []
    return pathFolders.some(
      f => f && (f.id?.toLowerCase() === target || f.name?.trim().toLowerCase() === target)
    )
  }

  const resolveFolderEnvTargets = (
    folderNameOrId?: string,
    envNameOrId?: string
  ): { fKey: string; eKey: string } => {
    if (folderNameOrId && folderNameOrId.trim() && (!envNameOrId || !envNameOrId.trim())) {
      const candidate = folderNameOrId.trim()
      const matchedFolder = findFolder(candidate)
      const matchedEnv = findEnv(candidate)
      if (!matchedFolder && matchedEnv) {
        return { fKey: '__nearest__', eKey: candidate }
      }
    }
    return {
      fKey: folderNameOrId?.trim() || '__nearest__',
      eKey: envNameOrId?.trim() || '__active__'
    }
  }

  // Collection scope (Dùng chung)
  const collectionScopeApi = {
    get: (key: string): string | undefined => {
      const k = String(key ?? '').trim()
      if (!k) return undefined
      if (k in scopedEnvUpdates.collection) {
        return scopedEnvUpdates.collection[k] || undefined
      }
      const found = (context.collectionVariables || []).find(
        v => v && v.enabled !== false && v.key.trim() === k
      )
      return found ? found.value : context.variables.get(k)
    },
    set: (keyOrObj: unknown, value?: unknown): void => {
      if (typeof keyOrObj === 'object' && keyOrObj !== null) {
        for (const [k, v] of Object.entries(keyOrObj as Record<string, unknown>)) {
          collectionScopeApi.set(k, v)
        }
        return
      }
      const k = String(keyOrObj ?? '').trim()
      if (!k) return
      const strVal = toStringVal(value)
      scopedEnvUpdates.collection[k] = strVal
      context.variables.set(k, strVal)
    },
    unset: (key: string): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      scopedEnvUpdates.collection[k] = ''
      context.variables.delete(k)
    },
    toObject: (): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const v of context.collectionVariables || []) {
        if (v && v.enabled !== false && v.key?.trim()) {
          out[v.key.trim()] = v.value ?? ''
        }
      }
      return { ...out, ...scopedEnvUpdates.collection }
    }
  }

  // Folder Global scope (Dùng chung của Folder)
  const folderVariablesApi = {
    get: (key: string, folderNameOrId?: string): string | undefined => {
      const k = String(key ?? '').trim()
      if (!k) return undefined
      const fKey = folderNameOrId?.trim() || '__nearest__'
      if (scopedEnvUpdates.folderGlobals[fKey] && k in scopedEnvUpdates.folderGlobals[fKey]) {
        return scopedEnvUpdates.folderGlobals[fKey][k] || undefined
      }
      const folder = findFolder(folderNameOrId)
      const found = folder?.variables?.find(v => v && v.enabled !== false && v.key.trim() === k)
      if (found) return found.value
      return isFolderInPath(folderNameOrId) ? context.variables.get(k) : undefined
    },
    set: (keyOrObj: unknown, value?: unknown, folderNameOrId?: string): void => {
      if (typeof keyOrObj === 'object' && keyOrObj !== null) {
        const folder = typeof value === 'string' ? value : folderNameOrId
        for (const [k, v] of Object.entries(keyOrObj as Record<string, unknown>)) {
          folderVariablesApi.set(k, v, folder)
        }
        return
      }
      const k = String(keyOrObj ?? '').trim()
      if (!k) return
      const strVal = toStringVal(value)
      const fKey = folderNameOrId?.trim() || '__nearest__'
      if (!scopedEnvUpdates.folderGlobals[fKey]) {
        scopedEnvUpdates.folderGlobals[fKey] = {}
      }
      scopedEnvUpdates.folderGlobals[fKey][k] = strVal
      if (isFolderInPath(folderNameOrId)) {
        context.variables.set(k, strVal)
      }
    },
    unset: (key: string, folderNameOrId?: string): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      const fKey = folderNameOrId?.trim() || '__nearest__'
      if (!scopedEnvUpdates.folderGlobals[fKey]) {
        scopedEnvUpdates.folderGlobals[fKey] = {}
      }
      scopedEnvUpdates.folderGlobals[fKey][k] = ''
      if (isFolderInPath(folderNameOrId)) {
        context.variables.delete(k)
      }
    },
    env: (envNameOrId: string, folderNameOrId?: string) => ({
      get: (key: string): string | undefined => folderEnvApi.get(key, folderNameOrId, envNameOrId),
      set: (keyOrObj: unknown, value?: unknown): void => {
        if (typeof keyOrObj === 'object' && keyOrObj !== null) {
          for (const [k, v] of Object.entries(keyOrObj as Record<string, unknown>)) {
            folderEnvApi.set(k, v, folderNameOrId, envNameOrId)
          }
        } else {
          folderEnvApi.set(String(keyOrObj), value, folderNameOrId, envNameOrId)
        }
      },
      unset: (key: string): void => {
        folderEnvApi.unset(key, folderNameOrId, envNameOrId)
      }
    })
  }

  // Folder-Env scope (Môi trường riêng của từng Folder)
  const folderEnvApi = {
    get: (key: string, folderNameOrId?: string, envNameOrId?: string): string | undefined => {
      const k = String(key ?? '').trim()
      if (!k) return undefined
      const { fKey, eKey } = resolveFolderEnvTargets(folderNameOrId, envNameOrId)
      for (let i = scopedEnvUpdates.folderEnvs.length - 1; i >= 0; i--) {
        const item = scopedEnvUpdates.folderEnvs[i]
        if (item.folder === fKey && item.env === eKey && item.key === k) {
          return item.value || undefined
        }
      }
      const folder = findFolder(fKey === '__nearest__' ? undefined : fKey)
      const envObj = findEnv(eKey === '__active__' ? undefined : eKey)
      const envId = envObj?.id || (eKey !== '__active__' ? eKey : context.activeEnvId)
      if (folder?.folder_envs && envId && Array.isArray(folder.folder_envs[envId])) {
        const found = folder.folder_envs[envId].find(
          v => v && v.enabled !== false && v.key.trim() === k
        )
        if (found) return found.value
      }
      return isFolderInPath(fKey) && (eKey === '__active__' || (context.activeEnvId && envObj?.id === context.activeEnvId))
        ? context.variables.get(k)
        : undefined
    },
    set: (keyOrObj: unknown, value?: unknown, folderNameOrId?: string, envNameOrId?: string): void => {
      if (typeof keyOrObj === 'object' && keyOrObj !== null) {
        let targetFolder: string | undefined
        let targetEnv: string | undefined
        if (typeof value === 'string') {
          targetFolder = value
          targetEnv = typeof folderNameOrId === 'string' ? folderNameOrId : envNameOrId
        } else {
          targetFolder = folderNameOrId
          targetEnv = envNameOrId
        }
        for (const [k, v] of Object.entries(keyOrObj as Record<string, unknown>)) {
          folderEnvApi.set(k, v, targetFolder, targetEnv)
        }
        return
      }
      const k = String(keyOrObj ?? '').trim()
      if (!k) return
      const strVal = toStringVal(value)
      const { fKey, eKey } = resolveFolderEnvTargets(folderNameOrId, envNameOrId)
      scopedEnvUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        key: k,
        value: strVal
      })
      const envObj = findEnv(eKey === '__active__' ? undefined : eKey)
      const isEnvActive = eKey === '__active__' || Boolean(context.activeEnvId && envObj?.id === context.activeEnvId)
      if (isFolderInPath(fKey) && isEnvActive) {
        context.variables.set(k, strVal)
      }
    },
    unset: (key: string, folderNameOrId?: string, envNameOrId?: string): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      const { fKey, eKey } = resolveFolderEnvTargets(folderNameOrId, envNameOrId)
      scopedEnvUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        key: k,
        value: ''
      })
      const envObj = findEnv(eKey === '__active__' ? undefined : eKey)
      const isEnvActive = eKey === '__active__' || Boolean(context.activeEnvId && envObj?.id === context.activeEnvId)
      if (isFolderInPath(fKey) && isEnvActive) {
        context.variables.delete(k)
      }
    }
  }

  // Folder Auth & Folder-Env Auth scopes
  const createFolderAuthEnvMethods = (targetFolder?: string, targetEnv?: string) => ({
    get: (): AuthConfig | undefined => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      for (let i = scopedAuthUpdates.folderEnvs.length - 1; i >= 0; i--) {
        const item = scopedAuthUpdates.folderEnvs[i]
        if (item.folder === fKey && item.env === eKey) {
          return JSON.parse(JSON.stringify(item.auth))
        }
      }
      const folder = findFolder(fKey === '__nearest__' ? undefined : fKey)
      const envObj = findEnv(eKey === '__active__' ? undefined : eKey)
      const envId = envObj?.id || (eKey !== '__active__' ? eKey : context.activeEnvId)
      if (folder?.auth_envs && envId && folder.auth_envs[envId]) {
        return JSON.parse(JSON.stringify(folder.auth_envs[envId]))
      }
      return undefined
    },
    set: (auth: unknown): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: normalizeAuthConfig(auth)
      })
    },
    setBearer: (token: unknown): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: { type: 'bearer', bearer: { token: toStringVal(token) } }
      })
    },
    setBasic: (username: unknown, password: unknown): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: {
          type: 'basic',
          basic: { username: toStringVal(username), password: toStringVal(password) }
        }
      })
    },
    setApiKey: (key: unknown, value: unknown, addTo: 'header' | 'query' = 'header'): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: {
          type: 'apiKey',
          apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
        }
      })
    },
    inherit: (): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: { type: 'inherit' }
      })
    },
    none: (): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: { type: 'none' }
      })
    },
    unset: (): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: { type: 'inherit' }
      })
    },
    clear: (): void => {
      const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv)
      scopedAuthUpdates.folderEnvs.push({
        folder: fKey,
        env: eKey,
        auth: { type: 'inherit' }
      })
    }
  })

  const folderAuthApi = {
    get: (folderNameOrId?: string): AuthConfig | undefined => {
      const fKey = folderNameOrId?.trim() || '__nearest__'
      if (scopedAuthUpdates.folderGlobals[fKey]) {
        return JSON.parse(JSON.stringify(scopedAuthUpdates.folderGlobals[fKey]))
      }
      const folder = findFolder(folderNameOrId)
      return folder?.auth ? JSON.parse(JSON.stringify(folder.auth)) : undefined
    },
    set: (arg1: unknown, arg2?: unknown, arg3?: string): void => {
      let authInput: unknown
      let targetFolder: string | undefined
      let targetEnv: string | undefined

      if (typeof arg1 === 'string' && (typeof arg2 === 'object' || arg2 === 'inherit' || arg2 === 'none')) {
        targetFolder = arg1
        authInput = arg2
        targetEnv = typeof arg3 === 'string' ? arg3 : undefined
      } else {
        authInput = arg1
        targetFolder = typeof arg2 === 'string' ? arg2 : undefined
        targetEnv = typeof arg3 === 'string' ? arg3 : undefined
      }

      if (targetEnv && targetEnv.trim()) {
        createFolderAuthEnvMethods(targetFolder, targetEnv).set(authInput)
        return
      }
      const fKey = targetFolder?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = normalizeAuthConfig(authInput)
    },
    setBearer: (token: unknown, folderNameOrId?: string, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBearer(token)
        return
      }
      const fKey = folderNameOrId?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = {
        type: 'bearer',
        bearer: { token: toStringVal(token) }
      }
    },
    setBasic: (username: unknown, password: unknown, folderNameOrId?: string, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBasic(username, password)
        return
      }
      const fKey = folderNameOrId?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = {
        type: 'basic',
        basic: { username: toStringVal(username), password: toStringVal(password) }
      }
    },
    setApiKey: (key: unknown, value: unknown, addToOrFolder?: string, folderNameOrId?: string, envNameOrId?: string): void => {
      let addTo: 'header' | 'query' = 'header'
      let folder = folderNameOrId
      const env = envNameOrId

      if (addToOrFolder === 'header' || addToOrFolder === 'query') {
        addTo = addToOrFolder
      } else if (typeof addToOrFolder === 'string' && !folderNameOrId) {
        folder = addToOrFolder
      }

      if (env && env.trim()) {
        createFolderAuthEnvMethods(folder, env).setApiKey(key, value, addTo)
        return
      }
      const fKey = folder?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = {
        type: 'apiKey',
        apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
      }
    },
    inherit: (folderNameOrId?: string, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).inherit()
        return
      }
      const fKey = folderNameOrId?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = { type: 'inherit' }
    },
    none: (folderNameOrId?: string, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).none()
        return
      }
      const fKey = folderNameOrId?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = { type: 'none' }
    },
    unset: (folderNameOrId?: string, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).unset()
        return
      }
      const fKey = folderNameOrId?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = { type: 'inherit' }
    },
    clear: (folderNameOrId?: string, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).clear()
        return
      }
      const fKey = folderNameOrId?.trim() || '__nearest__'
      scopedAuthUpdates.folderGlobals[fKey] = { type: 'inherit' }
    },
    folder: (folderNameOrId?: string) => ({
      get: (): AuthConfig | undefined => folderAuthApi.get(folderNameOrId),
      set: (auth: unknown): void => folderAuthApi.set(auth, folderNameOrId),
      inherit: (): void => folderAuthApi.inherit(folderNameOrId),
      none: (): void => folderAuthApi.none(folderNameOrId),
      unset: (): void => folderAuthApi.unset(folderNameOrId),
      clear: (): void => folderAuthApi.clear(folderNameOrId),
      setBearer: (token: unknown): void => folderAuthApi.setBearer(token, folderNameOrId),
      setBasic: (u: unknown, p: unknown): void => folderAuthApi.setBasic(u, p, folderNameOrId),
      setApiKey: (k: unknown, v: unknown, addTo?: 'header' | 'query'): void =>
        folderAuthApi.setApiKey(k, v, addTo, folderNameOrId),
      env: (envNameOrId?: string) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId)
    }),
    env: (envNameOrId?: string, folderNameOrId?: string) => ({
      folder: (fName?: string) => createFolderAuthEnvMethods(fName, envNameOrId),
      get: (): AuthConfig | undefined => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).get(),
      set: (auth: unknown): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).set(auth),
      inherit: (): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).inherit(),
      none: (): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).none(),
      unset: (): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).unset(),
      clear: (): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).clear(),
      setBearer: (token: unknown): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBearer(token),
      setBasic: (u: unknown, p: unknown): void => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBasic(u, p),
      setApiKey: (k: unknown, v: unknown, addTo?: 'header' | 'query'): void =>
        createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setApiKey(k, v, addTo)
    })
  }

  const createFolderScope = (folderName?: string) => ({
    get: (key: string): string | undefined => folderVariablesApi.get(key, folderName),
    set: (keyOrObj: unknown, value?: unknown): void => {
      folderVariablesApi.set(keyOrObj, value, folderName)
    },
    unset: (key: string): void => {
      folderVariablesApi.unset(key, folderName)
    },
    env: (envName?: string) => ({
      get: (key: string): string | undefined => folderEnvApi.get(key, folderName, envName),
      set: (keyOrObj: unknown, value?: unknown): void => {
        folderEnvApi.set(keyOrObj, value, folderName, envName)
      },
      unset: (key: string): void => {
        folderEnvApi.unset(key, folderName, envName)
      },
      auth: createFolderAuthEnvMethods(folderName, envName)
    }),
    auth: {
      get: (): AuthConfig | undefined => folderAuthApi.get(folderName),
      set: (auth: unknown): void => folderAuthApi.set(auth, folderName),
      inherit: (): void => folderAuthApi.inherit(folderName),
      none: (): void => folderAuthApi.none(folderName),
      unset: (): void => folderAuthApi.unset(folderName),
      clear: (): void => folderAuthApi.clear(folderName),
      setBearer: (token: unknown): void => folderAuthApi.setBearer(token, folderName),
      setBasic: (u: unknown, p: unknown): void => folderAuthApi.setBasic(u, p, folderName),
      setApiKey: (k: unknown, v: unknown, addTo?: 'header' | 'query'): void =>
        folderAuthApi.setApiKey(k, v, addTo, folderName),
      env: (envName?: string) => createFolderAuthEnvMethods(folderName, envName)
    }
  })

  const folderAuthEnvApi = {
    get: (folderNameOrId?: string, envNameOrId?: string): AuthConfig | undefined =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).get(),
    set: (arg1: unknown, arg2?: unknown, arg3?: string): void => {
      let authInput: unknown
      let targetFolder: string | undefined
      let targetEnv: string | undefined

      if (typeof arg1 === 'string' && (typeof arg2 === 'object' || arg2 === 'inherit' || arg2 === 'none')) {
        targetFolder = arg1
        authInput = arg2
        targetEnv = typeof arg3 === 'string' ? arg3 : undefined
      } else {
        authInput = arg1
        targetFolder = typeof arg2 === 'string' ? arg2 : undefined
        targetEnv = typeof arg3 === 'string' ? arg3 : undefined
      }
      createFolderAuthEnvMethods(targetFolder, targetEnv).set(authInput)
    },
    setBearer: (token: unknown, folderNameOrId?: string, envNameOrId?: string): void =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBearer(token),
    setBasic: (username: unknown, password: unknown, folderNameOrId?: string, envNameOrId?: string): void =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBasic(username, password),
    setApiKey: (key: unknown, value: unknown, addToOrFolder?: string, folderNameOrId?: string, envNameOrId?: string): void => {
      let addTo: 'header' | 'query' = 'header'
      let folder = folderNameOrId
      const env = envNameOrId

      if (addToOrFolder === 'header' || addToOrFolder === 'query') {
        addTo = addToOrFolder
      } else if (typeof addToOrFolder === 'string' && !folderNameOrId) {
        folder = addToOrFolder
      }
      createFolderAuthEnvMethods(folder, env).setApiKey(key, value, addTo)
    },
    inherit: (folderNameOrId?: string, envNameOrId?: string): void =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).inherit(),
    none: (folderNameOrId?: string, envNameOrId?: string): void =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).none(),
    unset: (folderNameOrId?: string, envNameOrId?: string): void =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).unset(),
    clear: (folderNameOrId?: string, envNameOrId?: string): void =>
      createFolderAuthEnvMethods(folderNameOrId, envNameOrId).clear()
  }

  // Collection Auth scope
  const createCollectionAuthEnvMethods = (targetEnv?: string) => ({
    get: (): AuthConfig | undefined => {
      const eKey = targetEnv?.trim() || '__active__'
      if (scopedAuthUpdates.collectionEnvs) {
        for (let i = scopedAuthUpdates.collectionEnvs.length - 1; i >= 0; i--) {
          const item = scopedAuthUpdates.collectionEnvs[i]
          if (eKey === '__active__') {
            if (item.env === '__active__' || (context.activeEnvId && item.env.toLowerCase() === context.activeEnvId.toLowerCase())) {
              return JSON.parse(JSON.stringify(item.auth))
            }
          } else {
            const lower = eKey.toLowerCase()
            if (item.env.trim().toLowerCase() === lower) {
              return JSON.parse(JSON.stringify(item.auth))
            }
          }
        }
      }
      const envObj = findEnv(eKey === '__active__' ? undefined : eKey)
      const envId = envObj?.id || (eKey !== '__active__' ? eKey : context.activeEnvId)
      if (envId && context.collectionAuthEnvs && context.collectionAuthEnvs[envId]) {
        return JSON.parse(JSON.stringify(context.collectionAuthEnvs[envId]))
      }
      return undefined
    },
    set: (auth: unknown): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: normalizeAuthConfig(auth)
      })
    },
    setBearer: (token: unknown): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'bearer', bearer: { token: toStringVal(token) } }
      })
    },
    setBasic: (username: unknown, password: unknown): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'basic', basic: { username: toStringVal(username), password: toStringVal(password) } }
      })
    },
    setApiKey: (key: unknown, value: unknown, addTo: 'header' | 'query' = 'header'): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'apiKey', apiKey: { key: toStringVal(key), value: toStringVal(value), addTo } }
      })
    },
    inherit: (): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'inherit' }
      })
    },
    none: (): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'none' }
      })
    },
    unset: (): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'inherit' }
      })
    },
    clear: (): void => {
      const envKey = targetEnv?.trim() || '__active__'
      if (!scopedAuthUpdates.collectionEnvs) scopedAuthUpdates.collectionEnvs = []
      scopedAuthUpdates.collectionEnvs.push({
        env: envKey,
        auth: { type: 'inherit' }
      })
    }
  })

  const collectionAuthApi = {
    get: (envNameOrId?: string): AuthConfig | undefined => {
      if (envNameOrId && envNameOrId.trim()) {
        return createCollectionAuthEnvMethods(envNameOrId).get()
      }
      if (scopedAuthUpdates.collectionGlobal) {
        return JSON.parse(JSON.stringify(scopedAuthUpdates.collectionGlobal))
      }
      if (context.collectionAuth) {
        return JSON.parse(JSON.stringify(context.collectionAuth))
      }
      return undefined
    },
    set: (auth: unknown, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).set(auth)
        return
      }
      scopedAuthUpdates.collectionGlobal = normalizeAuthConfig(auth)
    },
    setBearer: (token: unknown, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).setBearer(token)
        return
      }
      scopedAuthUpdates.collectionGlobal = {
        type: 'bearer',
        bearer: { token: toStringVal(token) }
      }
    },
    setBasic: (username: unknown, password: unknown, envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).setBasic(username, password)
        return
      }
      scopedAuthUpdates.collectionGlobal = {
        type: 'basic',
        basic: { username: toStringVal(username), password: toStringVal(password) }
      }
    },
    setApiKey: (key: unknown, value: unknown, addTo: 'header' | 'query' = 'header', envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).setApiKey(key, value, addTo)
        return
      }
      scopedAuthUpdates.collectionGlobal = {
        type: 'apiKey',
        apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
      }
    },
    inherit: (envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).inherit()
        return
      }
      scopedAuthUpdates.collectionGlobal = { type: 'inherit' }
    },
    none: (envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).none()
        return
      }
      scopedAuthUpdates.collectionGlobal = { type: 'none' }
    },
    unset: (envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).unset()
        return
      }
      scopedAuthUpdates.collectionGlobal = { type: 'inherit' }
    },
    clear: (envNameOrId?: string): void => {
      if (envNameOrId && envNameOrId.trim()) {
        createCollectionAuthEnvMethods(envNameOrId).clear()
        return
      }
      scopedAuthUpdates.collectionGlobal = { type: 'inherit' }
    },
    env: (envNameOrId: string) => createCollectionAuthEnvMethods(envNameOrId)
  }

  // Request Auth helper (ha.request.auth)
  let currentAuth = context.request?.auth ? { ...context.request.auth } : undefined
  const requestAuthApi = {
    get: (): AuthConfig | undefined => {
      const target = requestMutations.auth ?? currentAuth
      return target ? JSON.parse(JSON.stringify(target)) : undefined
    },
    set: (auth: unknown): void => {
      const normalized = normalizeAuthConfig(auth)
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    setBearer: (token: unknown): void => {
      const normalized: AuthConfig = {
        type: 'bearer',
        bearer: { token: toStringVal(token) }
      }
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    setBasic: (username: unknown, password: unknown): void => {
      const normalized: AuthConfig = {
        type: 'basic',
        basic: { username: toStringVal(username), password: toStringVal(password) }
      }
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    setApiKey: (key: unknown, value: unknown, addTo: 'header' | 'query' = 'header'): void => {
      const normalized: AuthConfig = {
        type: 'apiKey',
        apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
      }
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    inherit: (): void => {
      const normalized: AuthConfig = { type: 'inherit' }
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    none: (): void => {
      const normalized: AuthConfig = { type: 'none' }
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    unset: (): void => {
      const normalized: AuthConfig = { type: 'inherit' }
      currentAuth = normalized
      requestMutations.auth = normalized
    },
    clear: (): void => {
      const normalized: AuthConfig = { type: 'inherit' }
      currentAuth = normalized
      requestMutations.auth = normalized
    }
  }

  // Request Query Params helper (ha.request.params / ha.request.query)
  const syncUrlFromParams = () => {
    currentUrl = updateUrlWithParams(currentUrl, currentParams)
    requestMutations.url = currentUrl
    requestMutations.params = currentParams.map(p => ({ ...p }))
  }

  const queryParamsApi = {
    get: (key: string): string | undefined => {
      const k = String(key ?? '').trim()
      const found = currentParams.find(p => p.enabled && p.key.trim() === k)
      return found?.value
    },
    set: (key: string, value: unknown): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      const strVal = toStringVal(value)
      const existing = currentParams.find(p => p.key.trim() === k)
      if (existing) {
        existing.value = strVal
        existing.enabled = true
      } else {
        currentParams.push({ key: k, value: strVal, enabled: true })
      }
      syncUrlFromParams()
    },
    add: (key: string, value: unknown): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      currentParams.push({ key: k, value: toStringVal(value), enabled: true })
      syncUrlFromParams()
    },
    remove: (key: string): void => {
      const k = String(key ?? '').trim()
      currentParams = currentParams.filter(p => p.key.trim() !== k)
      syncUrlFromParams()
    },
    unset: (key: string): void => {
      const k = String(key ?? '').trim()
      currentParams = currentParams.filter(p => p.key.trim() !== k)
      syncUrlFromParams()
    },
    toObject: (): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const p of currentParams) {
        if (p.enabled && p.key.trim()) {
          out[p.key.trim()] = p.value
        }
      }
      return out
    }
  }

  // Request Path Params (:api_key) helper (ha.request.pathParams)
  const pathParamsApi = {
    get: (key: string): string | undefined => {
      const k = String(key ?? '').trim().replace(/^:/, '')
      const found = currentPathParams.find(p => p.enabled && p.key.trim() === k)
      return found?.value ?? context.variables.get(k)
    },
    set: (key: string, value: unknown): void => {
      const k = String(key ?? '').trim().replace(/^:/, '')
      if (!k) return
      const strVal = toStringVal(value)
      const existing = currentPathParams.find(p => p.key.trim() === k)
      if (existing) {
        existing.value = strVal
        existing.enabled = true
      } else {
        currentPathParams.push({ key: k, value: strVal, enabled: true })
      }
      requestMutations.path_params = currentPathParams.map(p => ({ ...p }))
    },
    unset: (key: string): void => {
      const k = String(key ?? '').trim().replace(/^:/, '')
      const existing = currentPathParams.find(p => p.key.trim() === k)
      if (existing) {
        existing.value = ''
      }
      requestMutations.path_params = currentPathParams.map(p => ({ ...p }))
    },
    toObject: (): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const p of currentPathParams) {
        if (p.enabled && p.key.trim()) {
          out[p.key.trim()] = p.value
        }
      }
      return out
    }
  }

  // Request Headers helper (ha.request.headers)
  const headersApi = {
    get: (key: string): string | undefined => {
      const k = String(key ?? '').trim().toLowerCase()
      const found = currentHeaders.find(h => h.enabled && h.key.trim().toLowerCase() === k)
      return found?.value
    },
    set: (key: string, value: unknown): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      const strVal = toStringVal(value)
      const lower = k.toLowerCase()
      const existing = currentHeaders.find(h => h.key.trim().toLowerCase() === lower)
      if (existing) {
        existing.key = k
        existing.value = strVal
        existing.enabled = true
        delete existing._isAuto
      } else {
        currentHeaders.push({ key: k, value: strVal, enabled: true })
      }
      requestMutations.headers = currentHeaders.map(h => ({ ...h }))
    },
    add: (key: string, value: unknown): void => {
      const k = String(key ?? '').trim()
      if (!k) return
      currentHeaders.push({ key: k, value: toStringVal(value), enabled: true })
      requestMutations.headers = currentHeaders.map(h => ({ ...h }))
    },
    remove: (key: string): void => {
      const lower = String(key ?? '').trim().toLowerCase()
      currentHeaders = currentHeaders.filter(h => h.key.trim().toLowerCase() !== lower)
      requestMutations.headers = currentHeaders.map(h => ({ ...h }))
    },
    unset: (key: string): void => {
      const lower = String(key ?? '').trim().toLowerCase()
      currentHeaders = currentHeaders.filter(h => h.key.trim().toLowerCase() !== lower)
      requestMutations.headers = currentHeaders.map(h => ({ ...h }))
    },
    toObject: (): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const h of currentHeaders) {
        if (h.enabled && h.key.trim()) {
          out[h.key.trim()] = h.value
        }
      }
      return out
    }
  }

  // Request Body helper (ha.request.body)
  const bodyApi = {
    get raw(): string {
      return currentBodyContent
    },
    set raw(val: string) {
      currentBodyContent = toStringVal(val)
      requestMutations.body = {
        type: currentBodyType === 'none' ? 'text' : currentBodyType,
        content: currentBodyContent
      }
    },
    get type(): string {
      return currentBodyType
    },
    json: (): any => {
      return JSON.parse(currentBodyContent || '{}')
    },
    set: (value: unknown, type?: string): void => {
      if (typeof value === 'object' && value !== null) {
        currentBodyContent = JSON.stringify(value, null, 2)
        currentBodyType = type || 'json'
      } else {
        currentBodyContent = toStringVal(value)
        if (type) {
          currentBodyType = type
        } else if (currentBodyType === 'none') {
          currentBodyType = 'text'
        }
      }
      requestMutations.body = {
        type: currentBodyType,
        content: currentBodyContent
      }
    }
  }

  const haRequest = {
    get url(): string {
      return currentUrl
    },
    set url(val: string) {
      currentUrl = toStringVal(val)
      currentParams = reconcileParamsFromUrl(currentUrl, currentParams)
      currentPathParams = reconcilePathParamsFromUrl(currentUrl, currentPathParams)
      requestMutations.url = currentUrl
      requestMutations.params = currentParams.map(p => ({ ...p }))
      requestMutations.path_params = currentPathParams.map(p => ({ ...p }))
    },
    get method(): string {
      return currentMethod
    },
    set method(val: string) {
      currentMethod = toStringVal(val).trim().toUpperCase() || 'GET'
      requestMutations.method = currentMethod
    },
    params: queryParamsApi,
    query: queryParamsApi,
    pathParams: pathParamsApi,
    headers: headersApi,
    body: bodyApi,
    auth: requestAuthApi
  }

  // Response APIs
  const buildResponseHeadersProxy = (rawHeaders: Record<string, string[]>) => {
    const base: Record<string, any> = { ...rawHeaders }
    Object.defineProperty(base, 'get', {
      enumerable: false,
      value: (headerName: string): string | undefined => {
        const lower = String(headerName ?? '').trim().toLowerCase()
        for (const [k, vals] of Object.entries(rawHeaders)) {
          if (k.toLowerCase() === lower) {
            return Array.isArray(vals) ? vals[0] : String(vals)
          }
        }
        return undefined
      }
    })
    Object.defineProperty(base, 'toObject', {
      enumerable: false,
      value: (): Record<string, string> => {
        const out: Record<string, string> = {}
        for (const [k, vals] of Object.entries(rawHeaders)) {
          out[k] = Array.isArray(vals) ? vals.join(', ') : String(vals)
        }
        return out
      }
    })
    return base
  }

  const haResponse = context.response
    ? {
        code: context.response.status_code,
        statusCode: context.response.status_code,
        status: context.response.status_text,
        responseTime: context.response.time_ms,
        responseSize: context.response.size_bytes,
        headers: buildResponseHeadersProxy(context.response.headers || {}),
        text: (): string => context.response?.body ?? '',
        json: (): any => {
          const raw = context.response?.body ?? ''
          return JSON.parse(raw)
        },
        get data(): any {
          const raw = context.response?.body ?? ''
          try {
            return JSON.parse(raw)
          } catch {
            return raw
          }
        }
      }
    : undefined

  const pushLog = (level: 'log' | 'info' | 'warn' | 'error', args: unknown[]) => {
    const msg = args.map(formatLogArg).join(' ')
    const formatted =
      level === 'log' ? msg : `[${level.toUpperCase()}] ${msg}`
    logs.push(formatted)
    logEntries.push({
      level,
      message: msg,
      timestamp: new Date().toISOString()
    })
  }

  const sandboxConsole = {
    log: (...args: unknown[]) => pushLog('log', args),
    debug: (...args: unknown[]) => pushLog('log', args),
    info: (...args: unknown[]) => pushLog('info', args),
    warn: (...args: unknown[]) => pushLog('warn', args),
    error: (...args: unknown[]) => pushLog('error', args),
    table: (...args: unknown[]) => pushLog('info', args)
  }

  const ha = {
    environment: {
      get: getVar,
      set: setVar,
      unset: unsetVar,
      env: (envNameOrId?: string) => createEnvScope(envNameOrId),
      folder: (folderName?: string) => createFolderScope(folderName),
      toObject: (): Record<string, string> => Object.fromEntries(context.variables.entries()),
      get name(): string {
        const env = findEnv()
        return env?.name ?? ''
      },
      get id(): string {
        return context.activeEnvId ?? ''
      },
      getName: (): string => {
        const env = findEnv()
        return env?.name ?? ''
      },
      getCurrent: (): { id: string; name: string } | undefined => {
        const env = findEnv()
        return env ? { id: env.id, name: env.name } : undefined
      },
      getActive: (): { id: string; name: string } | undefined => {
        const env = findEnv()
        return env ? { id: env.id, name: env.name } : undefined
      }
    },
    env: (envNameOrId?: string) => createEnvScope(envNameOrId),
    folder: (folderName?: string) => createFolderScope(folderName),
    globals: collectionScopeApi,
    collectionVariables: collectionScopeApi,
    folderVariables: folderVariablesApi,
    folderEnv: folderEnvApi,
    folderEnvVariables: folderEnvApi,
    folderAuth: folderAuthApi,
    folderAuthEnv: folderAuthEnvApi,
    collectionAuth: collectionAuthApi,
    auth: requestAuthApi,
    variables: {
      get: (key: string) => getVar(key),
      set: (key: string, value: unknown) => setVar(key, value),
      unset: (key: string) => unsetVar(key),
      toObject: (): Record<string, string> => Object.fromEntries(context.variables.entries())
    },
    request: haRequest,
    response: haResponse,
    log: (...args: unknown[]) => pushLog('log', args),
    test: (name: string, fn: () => void) => {
      try {
        fn()
        testResults.push({ name: String(name), passed: true })
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err)
        testResults.push({ name: String(name), passed: false, error: errMsg })
      }
    }
  }

  try {
    const runner = new Function('ha', 'pm', 'console', `"use strict";\n${code}`)
    runner(ha, ha, sandboxConsole)
    return {
      success: true,
      logs,
      logEntries,
      testResults,
      envUpdates,
      scopedEnvUpdates,
      scopedAuthUpdates,
      requestMutations
    }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    logs.push(`[ERROR] ${message}`)
    logEntries.push({
      level: 'error',
      message,
      timestamp: new Date().toISOString()
    })
    return {
      success: false,
      logs,
      logEntries,
      testResults,
      envUpdates,
      scopedEnvUpdates,
      scopedAuthUpdates,
      requestMutations,
      error: message
    }
  }
}
