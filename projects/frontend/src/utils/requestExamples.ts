import type { AuthConfig } from '../stores/collectionStore'
import type { Body, KVPair, Request, Scripts } from '../stores/requestStore'
import {
  buildQueryString,
  parseUrl,
  reconcilePathParamsFromUrl,
  splitPreservingVars,
  updateUrlWithParams
} from './urlParams'

export type ExampleSyncFlagKey =
  | 'url'
  | 'method'
  | 'auth'
  | 'scripts'
  | 'body'
  | 'params'
  | 'path_params'
  | 'headers'
  | 'variables'

export interface ExampleSyncFlags {
  url: boolean
  method: boolean
  auth: boolean
  scripts: boolean
  body: boolean
  params: boolean
  path_params: boolean
  headers: boolean
  variables: boolean
}

export interface RequestExample {
  id: string
  name: string
  method: string
  url: string
  headers: KVPair[]
  params: KVPair[]
  path_params?: KVPair[]
  variables?: KVPair[]
  body: Body
  auth?: AuthConfig
  auth_envs?: Record<string, AuthConfig>
  scripts?: Scripts
  sync_flags: ExampleSyncFlags
  created_at: string
  updated_at: string
}

export const EXAMPLE_SYNC_FLAG_KEYS: readonly ExampleSyncFlagKey[] = [
  'url',
  'method',
  'auth',
  'scripts',
  'body',
  'params',
  'path_params',
  'headers',
  'variables'
] as const

export function createDefaultSyncFlags(): ExampleSyncFlags {
  return {
    url: true,
    method: true,
    auth: true,
    scripts: true,
    body: false,
    params: false,
    path_params: false,
    headers: false,
    variables: false
  }
}

export function normalizeSyncFlags(flags?: Partial<ExampleSyncFlags> | null): ExampleSyncFlags {
  const defaults = createDefaultSyncFlags()
  if (!flags || typeof flags !== 'object') {
    return defaults
  }
  return {
    url: typeof flags.url === 'boolean' ? flags.url : defaults.url,
    method: typeof flags.method === 'boolean' ? flags.method : defaults.method,
    auth: typeof flags.auth === 'boolean' ? flags.auth : defaults.auth,
    scripts: typeof flags.scripts === 'boolean' ? flags.scripts : defaults.scripts,
    body: typeof flags.body === 'boolean' ? flags.body : defaults.body,
    params: typeof flags.params === 'boolean' ? flags.params : defaults.params,
    path_params: typeof flags.path_params === 'boolean' ? flags.path_params : defaults.path_params,
    headers: typeof flags.headers === 'boolean' ? flags.headers : defaults.headers,
    variables: typeof flags.variables === 'boolean' ? flags.variables : defaults.variables
  }
}

let exampleSeq = 0
export function generateExampleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ex-${Date.now()}-${++exampleSeq}-${Math.random().toString(36).slice(2, 10)}`
}

function deepClone<T>(val: T): T {
  if (val === undefined || val === null) return val
  return JSON.parse(JSON.stringify(val))
}

function cleanHeadersForSnapshot(headers?: KVPair[] | null): KVPair[] {
  if (!Array.isArray(headers)) return []
  return headers
    .filter(h => !(h && h._isAuto && h.enabled))
    .map(h => {
      const copy: KVPair = { ...h }
      delete copy._isAuto
      if (Array.isArray(h.options)) {
        copy.options = [...h.options]
      }
      return copy
    })
}

export function generateUniqueExampleName(
  baseName: string,
  existingExamples?: RequestExample[] | null
): string {
  const existingNames = new Set(
    (existingExamples || []).map(ex => (ex?.name || '').trim().toLowerCase()).filter(Boolean)
  )
  const trimmed = baseName.trim() || 'Example'
  if (!existingNames.has(trimmed.toLowerCase())) {
    return trimmed
  }
  let idx = 2
  while (existingNames.has(`${trimmed} ${idx}`.toLowerCase())) {
    idx++
  }
  return `${trimmed} ${idx}`
}

/**
 * Splits a URL into baseUrl (before ?/#), rawQuery (without ?), and hash (including #),
 * preserving {{...}} variable blocks.
 */
export function splitBaseUrlAndQuery(url: string): {
  baseUrl: string
  rawQuery: string
  hash: string
} {
  if (!url) return { baseUrl: '', rawQuery: '', hash: '' }
  const hashParts = splitPreservingVars(url, '#', 2)
  const withoutHash = hashParts[0] ?? ''
  const hash = hashParts.length > 1 ? `#${hashParts[1]}` : ''
  const queryParts = splitPreservingVars(withoutHash, '?', 2)
  const baseUrl = queryParts[0] ?? ''
  const rawQuery = queryParts.length > 1 ? queryParts[1] ?? '' : ''
  return { baseUrl, rawQuery, hash }
}

/**
 * Combines Default's Base URL (before ?) with an Example's query params (or raw query fallback) and hash.
 */
export function mergeBaseUrlPreservingExampleQuery(
  defaultUrl: string,
  exampleUrl: string,
  exampleParams?: KVPair[] | null
): string {
  const { baseUrl: defBase, hash: defHash } = splitBaseUrlAndQuery(defaultUrl || '')
  const { rawQuery: exRawQuery, hash: exHash } = splitBaseUrlAndQuery(exampleUrl || '')
  let qs = buildQueryString(exampleParams || [])
  if (!qs && exampleParams == null && exRawQuery) {
    qs = exRawQuery
  }
  const hash = exHash || defHash
  if (!qs) {
    return `${defBase}${hash}`
  }
  return `${defBase}?${qs}${hash}`
}

/**
 * Creates a new RequestExample snapshot cloned from a Request (Default).
 */
export function cloneRequestToExample(
  req: Request,
  options?: {
    name?: string
    syncFlags?: Partial<ExampleSyncFlags>
    id?: string
    now?: string
  }
): RequestExample {
  const now = options?.now || new Date().toISOString()
  const defaultBaseName = `Example ${(req.examples?.length || 0) + 1}`
  const name = options?.name?.trim()
    ? options.name.trim()
    : generateUniqueExampleName(defaultBaseName, req.examples)

  return {
    id: options?.id || generateExampleId(),
    name,
    method: req.method || 'GET',
    url: req.url || '',
    headers: cleanHeadersForSnapshot(req.headers),
    params: deepClone(req.params || []),
    path_params: deepClone(req.path_params || []),
    variables: deepClone(req.variables || []),
    body: deepClone(req.body || { type: 'none', content: '' }),
    auth: deepClone(req.auth || { type: 'inherit' }),
    ...(req.auth_envs ? { auth_envs: deepClone(req.auth_envs) } : {}),
    ...(req.scripts ? { scripts: deepClone(req.scripts) } : {}),
    sync_flags: normalizeSyncFlags(options?.syncFlags),
    created_at: now,
    updated_at: now
  }
}

/**
 * Duplicates an existing RequestExample with a new UUID and unique name.
 */
export function duplicateExample(
  example: RequestExample,
  existingExamples?: RequestExample[] | null,
  options?: { id?: string; now?: string }
): RequestExample {
  const now = options?.now || new Date().toISOString()
  const copyBase = `${(example.name || 'Example').trim()} (Copy)`
  const name = generateUniqueExampleName(copyBase, existingExamples)
  const cloned = deepClone(example)
  return {
    ...cloned,
    id: options?.id || generateExampleId(),
    name,
    sync_flags: normalizeSyncFlags(cloned.sync_flags),
    created_at: now,
    updated_at: now
  }
}

/**
 * Resolves the effective Request for an Example (or Default when exampleOrId is null/undefined)
 * by overlaying synced field groups from defaultReq onto the Example snapshot.
 */
export function resolveEffectiveRequest(
  defaultReq: Request,
  exampleOrId?: RequestExample | string | null
): Request {
  if (!exampleOrId) {
    return deepClone(defaultReq)
  }

  let example: RequestExample | undefined
  if (typeof exampleOrId === 'string') {
    example = (defaultReq.examples || []).find(ex => ex && ex.id === exampleOrId)
    if (!example) {
      return deepClone(defaultReq)
    }
  } else {
    example = exampleOrId
  }

  const flags = normalizeSyncFlags(example.sync_flags)

  const method = flags.method ? defaultReq.method : example.method || defaultReq.method || 'GET'
  const params = flags.params
    ? deepClone(defaultReq.params || [])
    : deepClone(example.params || [])

  let url = ''
  if (flags.url && flags.params) {
    url = defaultReq.url || ''
  } else if (flags.url && !flags.params) {
    url = mergeBaseUrlPreservingExampleQuery(defaultReq.url || '', example.url || '', params)
  } else if (!flags.url && flags.params) {
    url = updateUrlWithParams(example.url || '', params)
  } else {
    url = example.url || ''
  }

  let path_params: KVPair[]
  if (flags.path_params) {
    path_params = deepClone(defaultReq.path_params || [])
  } else if (flags.url) {
    path_params = reconcilePathParamsFromUrl(url, deepClone(example.path_params || []))
  } else {
    path_params = deepClone(example.path_params || [])
  }

  const headers = flags.headers
    ? cleanHeadersForSnapshot(defaultReq.headers)
    : cleanHeadersForSnapshot(example.headers)

  const variables = flags.variables
    ? deepClone(defaultReq.variables || [])
    : deepClone(example.variables || [])

  const body: Body = flags.body
    ? deepClone(defaultReq.body || { type: 'none', content: '' })
    : deepClone(example.body || { type: 'none', content: '' })

  const auth: AuthConfig = flags.auth
    ? deepClone(defaultReq.auth || { type: 'inherit' })
    : deepClone(example.auth || { type: 'inherit' })

  const auth_envs = flags.auth
    ? deepClone(defaultReq.auth_envs)
    : deepClone(example.auth_envs)

  const scripts = flags.scripts
    ? deepClone(defaultReq.scripts)
    : deepClone(example.scripts)

  const effective: Request = {
    id: defaultReq.id,
    name: defaultReq.name,
    method,
    url,
    headers,
    params,
    path_params,
    ...(variables.length > 0 || defaultReq.variables !== undefined || example.variables !== undefined
      ? { variables }
      : {}),
    body,
    auth,
    ...(auth_envs ? { auth_envs } : {}),
    ...(scripts ? { scripts } : {}),
    ...(defaultReq.examples ? { examples: deepClone(defaultReq.examples) } : {}),
    created_at: defaultReq.created_at,
    updated_at: defaultReq.updated_at
  }

  return effective
}

/**
 * Applies edits made on an effective projected Request back onto the target Example snapshot,
 * updating only unlinked field groups so linked groups continue tracking Default.
 */
export function applyProjectionEditsToExample(
  example: RequestExample,
  projectedReq: Request,
  options?: { now?: string }
): RequestExample {
  const flags = normalizeSyncFlags(example.sync_flags)
  const next: RequestExample = {
    ...deepClone(example),
    sync_flags: flags
  }

  if (!flags.method) {
    next.method = projectedReq.method
  }
  if (!flags.params) {
    next.params = deepClone(projectedReq.params || [])
  }
  if (!flags.url) {
    if (flags.params) {
      // Preserve example's baseUrl when params are linked to Default
      const { baseUrl, hash } = splitBaseUrlAndQuery(projectedReq.url || '')
      const { rawQuery: exRawQuery } = splitBaseUrlAndQuery(example.url || '')
      next.url = exRawQuery ? `${baseUrl}?${exRawQuery}${hash}` : `${baseUrl}${hash}`
    } else {
      next.url = projectedReq.url || ''
    }
  } else if (!flags.params) {
    // URL is linked to Default, params are independent: keep example's own query on snapshot URL
    next.url = mergeBaseUrlPreservingExampleQuery(
      example.url || projectedReq.url || '',
      example.url || '',
      next.params || []
    )
  }

  if (!flags.path_params) {
    next.path_params = deepClone(projectedReq.path_params || [])
  }
  if (!flags.headers) {
    next.headers = cleanHeadersForSnapshot(projectedReq.headers)
  }
  if (!flags.variables) {
    next.variables = deepClone(projectedReq.variables || [])
  }
  if (!flags.body) {
    next.body = deepClone(projectedReq.body || { type: 'none', content: '' })
  }
  if (!flags.auth) {
    next.auth = deepClone(projectedReq.auth || { type: 'inherit' })
    if (projectedReq.auth_envs) {
      next.auth_envs = deepClone(projectedReq.auth_envs)
    } else {
      delete next.auth_envs
    }
  }
  if (!flags.scripts) {
    if (projectedReq.scripts) {
      next.scripts = deepClone(projectedReq.scripts)
    } else {
      delete next.scripts
    }
  }

  next.updated_at = options?.now || new Date().toISOString()
  return next
}

/**
 * Syncs fields from defaultReq into an Example snapshot for either explicit groups
 * or the Example's enabled sync_flags.
 */
export function syncExampleFromDefault(
  defaultReq: Request,
  example: RequestExample,
  groups?: ExampleSyncFlagKey[],
  options?: { now?: string }
): RequestExample {
  const flags = normalizeSyncFlags(example.sync_flags)
  const groupSet = Array.isArray(groups) && groups.length > 0 ? new Set(groups) : null
  const shouldSync = (g: ExampleSyncFlagKey) => (groupSet ? groupSet.has(g) : flags[g])

  const next = deepClone(example)
  next.sync_flags = flags

  const syncUrl = shouldSync('url')
  const syncMethod = shouldSync('method')
  const syncAuth = shouldSync('auth')
  const syncScripts = shouldSync('scripts')
  const syncBody = shouldSync('body')
  const syncParams = shouldSync('params')
  const syncPathParams = shouldSync('path_params')
  const syncHeaders = shouldSync('headers')
  const syncVariables = shouldSync('variables')

  if (syncMethod) {
    next.method = defaultReq.method
  }
  if (syncParams) {
    next.params = deepClone(defaultReq.params || [])
  }
  if (syncUrl && syncParams) {
    next.url = defaultReq.url || ''
  } else if (syncUrl && !syncParams) {
    next.url = mergeBaseUrlPreservingExampleQuery(
      defaultReq.url || '',
      next.url || '',
      next.params || []
    )
  } else if (!syncUrl && syncParams) {
    next.url = updateUrlWithParams(next.url || '', next.params || [])
  }

  if (syncPathParams) {
    next.path_params = deepClone(defaultReq.path_params || [])
  } else if (syncUrl) {
    next.path_params = reconcilePathParamsFromUrl(next.url || '', next.path_params || [])
  }

  if (syncHeaders) {
    next.headers = cleanHeadersForSnapshot(defaultReq.headers)
  }
  if (syncVariables) {
    next.variables = deepClone(defaultReq.variables || [])
  }
  if (syncBody) {
    next.body = deepClone(defaultReq.body || { type: 'none', content: '' })
  }
  if (syncAuth) {
    next.auth = deepClone(defaultReq.auth || { type: 'inherit' })
    if (defaultReq.auth_envs) {
      next.auth_envs = deepClone(defaultReq.auth_envs)
    } else {
      delete next.auth_envs
    }
  }
  if (syncScripts) {
    if (defaultReq.scripts) {
      next.scripts = deepClone(defaultReq.scripts)
    } else {
      delete next.scripts
    }
  }

  next.updated_at = options?.now || new Date().toISOString()
  return next
}

/**
 * Syncs all examples on defaultReq from Default according to each example's sync_flags (or explicit groups).
 */
export function syncAllExamplesFromDefault(
  defaultReq: Request,
  groups?: ExampleSyncFlagKey[],
  options?: { now?: string }
): RequestExample[] {
  if (!Array.isArray(defaultReq.examples) || defaultReq.examples.length === 0) {
    return []
  }
  return defaultReq.examples.map(ex => syncExampleFromDefault(defaultReq, ex, groups, options))
}

/**
 * Builds the detached standalone Request data from an Example's effective configuration
 * and returns the remaining examples array with the detached example removed.
 */
export function detachExampleToRequestPayload(
  defaultReq: Request,
  exampleId: string,
  options?: { newName?: string }
): {
  detachedFields: Omit<Request, 'id' | 'created_at' | 'updated_at'>
  remainingExamples: RequestExample[]
  detachedExample: RequestExample
} | null {
  const examples = Array.isArray(defaultReq.examples) ? defaultReq.examples : []
  const idx = examples.findIndex(ex => ex && ex.id === exampleId)
  if (idx === -1) return null

  const target = examples[idx]
  const effective = resolveEffectiveRequest(defaultReq, target)
  const detachedName =
    options?.newName?.trim() ||
    (target.name?.trim() ? `${defaultReq.name} - ${target.name.trim()}` : `${defaultReq.name} (Example)`)

  const { id: _id, created_at: _c, updated_at: _u, examples: _exs, ...rest } = effective
  const remainingExamples = examples.filter((_, i) => i !== idx)

  return {
    detachedFields: {
      ...rest,
      name: detachedName,
      headers: cleanHeadersForSnapshot(rest.headers)
    },
    remainingExamples,
    detachedExample: target
  }
}

export interface FindExampleResult {
  example: RequestExample | null
  error?: string
  code?: 'NOT_FOUND' | 'VALIDATION'
}

/**
 * Resolves an example by ID (exact then case-insensitive) or case-insensitive Name.
 * Never falls back to Default when selector is non-empty.
 */
export function findExampleBySelector(
  examples: RequestExample[] | undefined | null,
  selector: string,
  requestName?: string
): FindExampleResult {
  const sel = (selector || '').trim()
  if (!sel) {
    return { example: null, error: 'Example selector is empty', code: 'VALIDATION' }
  }
  const list = Array.isArray(examples) ? examples : []
  const exactId = list.find(ex => ex && ex.id === sel)
  if (exactId) {
    return { example: exactId }
  }
  const lower = sel.toLowerCase()
  const caseId = list.find(ex => ex && (ex.id || '').toLowerCase() === lower)
  if (caseId) {
    return { example: caseId }
  }
  const nameMatches = list.filter(ex => ex && (ex.name || '').trim().toLowerCase() === lower)
  if (nameMatches.length === 1) {
    return { example: nameMatches[0] }
  }
  if (nameMatches.length > 1) {
    const ids = nameMatches.map(m => m.id).join(', ')
    return {
      example: null,
      code: 'VALIDATION',
      error: `Nhiều Example trùng tên "${sel}" trên Request${requestName ? ` "${requestName}"` : ''} (IDs: ${ids})`
    }
  }
  return {
    example: null,
    code: 'NOT_FOUND',
    error: `Example "${sel}" không tồn tại trên Request${requestName ? ` "${requestName}"` : ''}`
  }
}

/**
 * Resolves the effective Request for executing a FlowStep or CLI run with an optional exampleSelector.
 * When exampleSelector is non-empty and missing/ambiguous, returns an explicit error instead of falling back to Default.
 */
export function resolveRequestForStepExecution(
  defaultReq: Request,
  exampleSelector?: string | null
): {
  request: Request | null
  example: RequestExample | null
  error?: string
  code?: 'NOT_FOUND' | 'VALIDATION'
} {
  const sel = (exampleSelector || '').trim()
  if (!sel) {
    return { request: deepClone(defaultReq), example: null }
  }
  const found = findExampleBySelector(defaultReq.examples, sel, defaultReq.name)
  if (!found.example) {
    return {
      request: null,
      example: null,
      error: found.error || `Example "${sel}" không tồn tại`,
      code: found.code || 'NOT_FOUND'
    }
  }
  return {
    request: resolveEffectiveRequest(defaultReq, found.example),
    example: found.example
  }
}

export { parseUrl }
