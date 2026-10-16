import type { ExecuteResponse } from '../stores/responseStore'
import type { KVPair, Request } from '../stores/requestStore'
import type { FolderNodeLike, VariableKVPair } from './resolveHierarchyVariables'
import { updateUrlWithParams, reconcileParamsFromUrl, reconcilePathParamsFromUrl } from './urlParams'

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
}

export interface ScriptExecutionContext {
  variables: Map<string, string>
  response?: ExecuteResponse | null
  request?: Partial<Request> | null
  collectionVariables?: VariableKVPair[] | null
  environments?: Array<{ id: string; name: string; variables?: VariableKVPair[] }> | null
  activeEnvId?: string | null
  pathFolders?: FolderNodeLike[] | null
  allFolders?: FolderNodeLike[] | null
}

export interface ScriptExecutionResult {
  success: boolean
  logs: string[]
  logEntries: ScriptLogEntry[]
  envUpdates: Record<string, string>
  scopedEnvUpdates: ScopedEnvUpdates
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

export function executeScript(
  code: string | undefined | null,
  context: ScriptExecutionContext
): ScriptExecutionResult {
  const logs: string[] = []
  const logEntries: ScriptLogEntry[] = []
  const envUpdates: Record<string, string> = {}
  const scopedEnvUpdates: ScopedEnvUpdates = {
    collection: {},
    globalEnvs: {},
    folderGlobals: {},
    folderEnvs: []
  }
  const requestMutations: ScriptRequestMutations = {}

  if (!code || !code.trim()) {
    return {
      success: true,
      logs,
      logEntries,
      envUpdates,
      scopedEnvUpdates,
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
      return ancestors.length > 0 ? ancestors[ancestors.length - 1] : all[0]
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

  const setVar = (key: string, value: unknown, envNameOrId?: string): void => {
    const k = String(key ?? '').trim()
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
    set: (key: string, value: unknown): void => {
      const k = String(key ?? '').trim()
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
    set: (key: string, value: unknown, folderNameOrId?: string): void => {
      const k = String(key ?? '').trim()
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
    }
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
    set: (key: string, value: unknown, folderNameOrId?: string, envNameOrId?: string): void => {
      const k = String(key ?? '').trim()
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
    body: bodyApi
  }

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
      toObject: (): Record<string, string> => Object.fromEntries(context.variables.entries())
    },
    globals: collectionScopeApi,
    collectionVariables: collectionScopeApi,
    folderVariables: folderVariablesApi,
    folderEnv: folderEnvApi,
    variables: {
      get: (key: string) => getVar(key),
      set: (key: string, value: unknown) => setVar(key, value),
      unset: (key: string) => unsetVar(key),
      toObject: (): Record<string, string> => Object.fromEntries(context.variables.entries())
    },
    request: haRequest,
    response: haResponse,
    log: (...args: unknown[]) => pushLog('log', args)
  }

  try {
    const runner = new Function('ha', 'pm', 'console', `"use strict";\n${code}`)
    runner(ha, ha, sandboxConsole)
    return {
      success: true,
      logs,
      logEntries,
      envUpdates,
      scopedEnvUpdates,
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
      envUpdates,
      scopedEnvUpdates,
      requestMutations,
      error: message
    }
  }
}
