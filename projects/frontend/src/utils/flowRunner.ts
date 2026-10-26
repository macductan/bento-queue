import type { AuthConfig } from '../stores/collectionStore'
import { resolveVariables } from './variables'
import {
  resolveHierarchyVariables,
  type FolderNodeLike,
  type VariableKVPair
} from './resolveHierarchyVariables'
import type {
  ScriptExecutionResult,
  ScriptTestResult,
  ScopedEnvUpdates,
  ScopedAuthUpdates
} from './scriptRunner'

export type FlowBranchConditionType = 'success' | 'error' | 'custom'
export type FlowBranchSource = 'status_code' | 'body_json' | 'variable'
export type FlowBranchOperator = '==' | '!=' | '>' | '<' | 'contains' | 'exists'

export interface FlowBranchCondition {
  type: FlowBranchConditionType | string
  source?: FlowBranchSource | string
  path?: string
  operator?: FlowBranchOperator | string
  value?: string
}

export interface FlowBranch {
  id: string
  name?: string
  condition: FlowBranchCondition
  nodes: FlowNode[]
}

export interface FlowStep {
  id: string
  request_id: string
  enabled: boolean
  timeout_ms?: number
}

export interface FlowNode {
  id: string
  steps: FlowStep[]
  branches?: FlowBranch[]
}

export interface Flow {
  id: string
  name: string
  description?: string
  layout: 'vertical' | 'horizontal' | string
  timeout_ms?: number
  max_steps?: number
  nodes: FlowNode[]
  created_at?: string
  updated_at?: string
}

export interface FlowFolder {
  id: string
  name: string
  order?: string[]
  created_at?: string
  updated_at?: string
}

export interface FlowTreeNode {
  id: string
  name: string
  type: 'flow_folder' | 'flow' | string
  description?: string
  layout?: string
  step_count?: number
  path: string
  children?: FlowTreeNode[]
  created_at?: string
}

export type StepFailureCategory =
  | 'deleted_request'
  | 'network_or_timeout'
  | 'script_error'
  | 'test_failed'
  | 'http_status'

export interface StepVerdictInput {
  requestMissing?: boolean
  networkError?: string | null
  scriptError?: string | null
  scriptTests?: ScriptTestResult[] | null
  statusCode?: number | null
}

export interface StepVerdictResult {
  passed: boolean
  failureReason?: string
  failureCategory?: StepFailureCategory
}

export interface BranchEvalContext {
  statusCode?: number | null
  responseBody?: string | null
  variables?: Record<string, string> | Map<string, string> | null
  requestMissing?: boolean
  networkError?: string | null
}

export interface BranchSelectionResult {
  matchedBranchId: string | null
  skippedBranchIds: string[]
}

export interface FlowMutableCollectionModel {
  id?: string
  name?: string
  variables?: VariableKVPair[]
  auth?: AuthConfig
  auth_envs?: Record<string, AuthConfig>
  active_env_id?: string
}

export interface FlowMutableEnvironmentModel {
  id: string
  name: string
  variables?: VariableKVPair[]
}

export interface HeadlessMutableState {
  collection?: FlowMutableCollectionModel | null
  environments?: FlowMutableEnvironmentModel[]
  activeEnvId?: string | null
  allFolders?: FolderNodeLike[]
  cliVarOverrides?: Record<string, string>
  orderedStepFolderIds?: string[]
}

export interface ParallelStepMutationItem {
  stepId?: string
  requestId?: string
  pathFolders?: FolderNodeLike[]
  scriptResult?: Partial<ScriptExecutionResult> | null
  preScriptResult?: Partial<ScriptExecutionResult> | null
  postScriptResult?: Partial<ScriptExecutionResult> | null
  envUpdates?: Record<string, string> | null
  scopedEnvUpdates?: Partial<ScopedEnvUpdates> | null
  scopedAuthUpdates?: Partial<ScopedAuthUpdates> | null
}

export interface MergedParallelState {
  collection: FlowMutableCollectionModel
  environments: FlowMutableEnvironmentModel[]
  activeEnvId: string | null
  allFolders: FolderNodeLike[]
  resolvedVariables: Record<string, string>
  mergedScriptResult: ScriptExecutionResult
}

function deepClone<T>(val: T): T {
  if (val === undefined || val === null) return val
  return JSON.parse(JSON.stringify(val))
}

function upsertVariableKVPair(list: VariableKVPair[], key: string, value: string): void {
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
  environments: FlowMutableEnvironmentModel[]
): string | null {
  if (!envSelector || envSelector === '__active__') {
    return activeEnvId || null
  }
  const trimmed = envSelector.trim()
  if (!trimmed) return activeEnvId || null
  const lower = trimmed.toLowerCase()
  const matched = environments.find(
    e => e && (e.id?.toLowerCase() === lower || e.name?.trim().toLowerCase() === lower)
  )
  return matched ? matched.id : trimmed
}

function normalizeSlashPath(raw: string): string {
  return raw
    .split('/')
    .map(seg => seg.trim().toLowerCase())
    .filter(Boolean)
    .join('/')
}

function resolveFolderIdInMemory(
  folderSelector: string | undefined | null,
  pathFolders: FolderNodeLike[],
  allFolders: FolderNodeLike[]
): string | null {
  if (!folderSelector || folderSelector === '__nearest__') {
    return pathFolders.length > 0 ? pathFolders[pathFolders.length - 1].id || null : null
  }
  const trimmed = folderSelector.trim()
  if (!trimmed || trimmed === '__nearest__') {
    return pathFolders.length > 0 ? pathFolders[pathFolders.length - 1].id || null : null
  }
  const lower = trimmed.toLowerCase()
  const isSlashSelector = trimmed.includes('/')
  const normalizedTargetPath = isSlashSelector ? normalizeSlashPath(trimmed) : ''

  // 1. Check pathFolders (from nearest folder to root)
  for (let i = pathFolders.length - 1; i >= 0; i--) {
    const f = pathFolders[i]
    if (!f) continue
    if (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower) {
      return f.id || null
    }
    if (isSlashSelector && normalizedTargetPath) {
      const cumulativePath = pathFolders
        .slice(0, i + 1)
        .map(node => (node?.name || '').trim().toLowerCase())
        .filter(Boolean)
        .join('/')
      if (
        cumulativePath === normalizedTargetPath ||
        cumulativePath.endsWith('/' + normalizedTargetPath)
      ) {
        return f.id || null
      }
    }
  }

  // 2. Check allFolders by direct ID or name
  const inAll = allFolders.find(
    f => f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower)
  )
  if (inAll) return inAll.id || null

  // 3. If slash-separated path, search nested folder trees or path suffixes in allFolders
  if (isSlashSelector && normalizedTargetPath) {
    type FolderTreeCandidate = FolderNodeLike & {
      path?: string
      children?: FolderTreeCandidate[]
    }
    const searchTree = (
      nodes: FolderTreeCandidate[],
      ancestors: string[]
    ): string | null => {
      for (const node of nodes) {
        if (!node) continue
        const nodeName = (node.name || '').trim().toLowerCase()
        const nextAncestors = nodeName ? [...ancestors, nodeName] : ancestors
        const fullSlash = nextAncestors.join('/')
        if (
          fullSlash === normalizedTargetPath ||
          fullSlash.endsWith('/' + normalizedTargetPath)
        ) {
          return node.id || null
        }
        if (typeof node.path === 'string' && node.path.trim() !== '') {
          const normNodePath = normalizeSlashPath(node.path.replace(/\\/g, '/'))
          if (
            normNodePath === normalizedTargetPath ||
            normNodePath.endsWith('/' + normalizedTargetPath)
          ) {
            return node.id || null
          }
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          const found = searchTree(node.children, nextAncestors)
          if (found) return found
        }
      }
      return null
    }
    const matchedFromTree = searchTree(allFolders as FolderTreeCandidate[], [])
    if (matchedFromTree) return matchedFromTree
  }

  return null
}

/**
 * Counts the total number of FlowStep items across a tree of FlowNodes (including nested branches).
 */
export function countStepsInNodes(nodes: FlowNode[] | undefined | null): number {
  if (!Array.isArray(nodes) || nodes.length === 0) return 0
  let total = 0
  for (const node of nodes) {
    if (!node) continue
    if (Array.isArray(node.steps)) {
      total += node.steps.length
    }
    if (Array.isArray(node.branches)) {
      for (const branch of node.branches) {
        if (branch && Array.isArray(branch.nodes)) {
          total += countStepsInNodes(branch.nodes)
        }
      }
    }
  }
  return total
}

/**
 * Evaluates whether a FlowStep execution passed or failed according to CAP-3 semantics:
 * 1. Missing original request -> failed ('deleted_request')
 * 2. Network/timeout/abort error -> failed ('network_or_timeout')
 * 3. Pre/Post runtime script error -> failed ('script_error')
 * 4. Any ha.test()/pm.test() assertion with passed === false -> failed ('test_failed')
 * 5. No scriptTests and HTTP status_code >= 400 -> failed ('http_status')
 * 6. Otherwise (including status_code >= 400 when >= 1 scriptTests exist and all pass) -> passed
 */
export function evaluateStepVerdict(input: StepVerdictInput | undefined | null): StepVerdictResult {
  if (!input) {
    return { passed: true }
  }

  if (input.requestMissing === true) {
    return {
      passed: false,
      failureCategory: 'deleted_request',
      failureReason: 'Request gốc đã bị xóa khỏi Collection'
    }
  }

  const netErr = typeof input.networkError === 'string' ? input.networkError.trim() : ''
  if (netErr !== '') {
    return {
      passed: false,
      failureCategory: 'network_or_timeout',
      failureReason: netErr
    }
  }

  const scriptErr = typeof input.scriptError === 'string' ? input.scriptError.trim() : ''
  if (scriptErr !== '') {
    return {
      passed: false,
      failureCategory: 'script_error',
      failureReason: scriptErr
    }
  }

  const tests = Array.isArray(input.scriptTests) ? input.scriptTests.filter(Boolean) : []
  const failedTests = tests.filter(t => t.passed === false)
  if (failedTests.length > 0) {
    const firstFailed = failedTests[0]
    const detail = firstFailed.error
      ? `${firstFailed.name}: ${firstFailed.error}`
      : `Test thất bại: ${firstFailed.name || 'assertion failed'}`
    return {
      passed: false,
      failureCategory: 'test_failed',
      failureReason: detail
    }
  }

  const statusCode = typeof input.statusCode === 'number' ? input.statusCode : 0
  if (tests.length === 0 && statusCode >= 400) {
    return {
      passed: false,
      failureCategory: 'http_status',
      failureReason: `HTTP ${statusCode}`
    }
  }

  return { passed: true }
}

function toVariablesMap(
  variables: Record<string, string> | Map<string, string> | null | undefined
): Map<string, string> {
  if (!variables) return new Map()
  if (variables instanceof Map) return variables
  return new Map(Object.entries(variables))
}

function extractJsonPathValue(
  rawBody: string | null | undefined,
  rawPath: string | null | undefined
): { exists: boolean; value: unknown } {
  if (typeof rawBody !== 'string' || rawBody.trim() === '') {
    return { exists: false, value: undefined }
  }
  const trimmedPath = (rawPath || '').trim()
  if (!trimmedPath) {
    return { exists: false, value: undefined }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { exists: false, value: undefined }
  }

  // Normalize optional leading `$` or `$.`
  let normalizedPath = trimmedPath
  if (normalizedPath === '$') {
    const exists = parsed !== undefined
    return { exists, value: exists ? parsed : undefined }
  }
  if (normalizedPath.startsWith('$.')) {
    normalizedPath = normalizedPath.slice(2)
  } else if (normalizedPath.startsWith('$[')) {
    normalizedPath = normalizedPath.slice(1)
  } else if (normalizedPath.startsWith('.')) {
    normalizedPath = normalizedPath.slice(1)
  }

  const tokens: Array<{ type: 'prop' | 'index'; key: string; index?: number }> = []
  let pos = 0
  while (pos < normalizedPath.length) {
    if (normalizedPath[pos] === '.') {
      pos++
      if (pos >= normalizedPath.length || normalizedPath[pos] === '.') {
        return { exists: false, value: undefined }
      }
      continue
    }
    if (normalizedPath[pos] === '[') {
      const closeBracket = normalizedPath.indexOf(']', pos + 1)
      if (closeBracket === -1) {
        return { exists: false, value: undefined }
      }
      const rawInner = normalizedPath.slice(pos + 1, closeBracket).trim()
      if (!rawInner) {
        return { exists: false, value: undefined }
      }
      if (
        (rawInner.startsWith('"') && rawInner.endsWith('"') && rawInner.length >= 2) ||
        (rawInner.startsWith("'") && rawInner.endsWith("'") && rawInner.length >= 2)
      ) {
        tokens.push({ type: 'prop', key: rawInner.slice(1, -1) })
      } else if (/^-?\d+$/.test(rawInner)) {
        tokens.push({ type: 'index', key: rawInner, index: Number(rawInner) })
      } else {
        tokens.push({ type: 'prop', key: rawInner })
      }
      pos = closeBracket + 1
      continue
    }
    if (normalizedPath[pos] === ']') {
      return { exists: false, value: undefined }
    }
    let nextSep = pos
    while (
      nextSep < normalizedPath.length &&
      normalizedPath[nextSep] !== '.' &&
      normalizedPath[nextSep] !== '[' &&
      normalizedPath[nextSep] !== ']'
    ) {
      nextSep++
    }
    if (nextSep < normalizedPath.length && normalizedPath[nextSep] === ']') {
      return { exists: false, value: undefined }
    }
    const propName = normalizedPath.slice(pos, nextSep)
    if (!propName) {
      return { exists: false, value: undefined }
    }
    tokens.push({ type: 'prop', key: propName })
    pos = nextSep
  }

  if (tokens.length === 0) {
    return { exists: false, value: undefined }
  }

  let current: unknown = parsed
  for (const token of tokens) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { exists: false, value: undefined }
    }
    if (Array.isArray(current)) {
      const idx =
        token.type === 'index' && token.index !== undefined
          ? token.index
          : /^-?\d+$/.test(token.key)
            ? Number(token.key)
            : NaN
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return { exists: false, value: undefined }
      }
      current = current[idx]
    } else {
      const obj = current as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(obj, token.key)) {
        return { exists: false, value: undefined }
      }
      current = obj[token.key]
    }
  }

  if (current === undefined) {
    return { exists: false, value: undefined }
  }
  return { exists: true, value: current }
}

function parseFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }
  return null
}

function isLosslessNumericString(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed === '') return false
  const num = Number(trimmed)
  return Number.isFinite(num) && String(num) === trimmed
}

function valuesAreEqual(actual: unknown, expected: string): boolean {
  const expectedTrimmed = String(expected).trim()
  if (typeof actual === 'number') {
    if (Number.isFinite(actual) && isLosslessNumericString(expectedTrimmed)) {
      return actual === Number(expectedTrimmed)
    }
    return String(actual) === String(expected)
  }
  if (typeof actual === 'string') {
    const actualTrimmed = actual.trim()
    if (isLosslessNumericString(actualTrimmed) && isLosslessNumericString(expectedTrimmed)) {
      return Number(actualTrimmed) === Number(expectedTrimmed)
    }
    return actual === String(expected)
  }
  if (typeof actual === 'object' && actual !== null) {
    try {
      return JSON.stringify(actual) === expected
    } catch {
      return String(actual) === expected
    }
  }
  return String(actual) === String(expected)
}

/**
 * Evaluates a 3-field custom branch condition (`source`, `operator`, `value` with `{{var}}` resolution).
 */
export function evaluateCustomBranchCondition(
  condition: FlowBranchCondition | undefined | null,
  ctx: BranchEvalContext | undefined | null
): boolean {
  if (!condition || !ctx) return false

  const condType = (condition.type || '').trim().toLowerCase()
  if (condType !== 'custom') return false

  const source = (condition.source || (condition as any).target || '').trim().toLowerCase()
  const operator = (condition.operator || '').trim().toLowerCase()
  const varsMap = toVariablesMap(ctx.variables)
  const resolvedExpected = resolveVariables(String(condition.value ?? ''), varsMap)

  let exists = false
  let actualValue: unknown = undefined

  if (source === 'status_code') {
    const hasNetErr = typeof ctx.networkError === 'string' && ctx.networkError.trim() !== ''
    if (
      !ctx.requestMissing &&
      !hasNetErr &&
      typeof ctx.statusCode === 'number' &&
      ctx.statusCode > 0
    ) {
      exists = true
      actualValue = ctx.statusCode
    }
  } else if (source === 'body_json') {
    const rawJsonPath = condition.path || (condition as any).json_path || ''
    const jsonPath = resolveVariables(String(rawJsonPath), varsMap)
    const extracted = extractJsonPathValue(ctx.responseBody, jsonPath)
    exists = extracted.exists
    actualValue = extracted.value
    if (operator === 'exists') {
      return extracted.exists && extracted.value !== null && extracted.value !== undefined
    }
    if (operator === '==' && extracted.exists && extracted.value === null) {
      return resolvedExpected.trim().toLowerCase() === 'null'
    }
    if (operator === '!=' && extracted.exists && extracted.value === null) {
      return resolvedExpected.trim().toLowerCase() !== 'null'
    }
  } else if (source === 'variable') {
    const rawVarName = (
      condition.path ||
      (condition as any).variable ||
      (condition as any).variable_name ||
      ''
    ).trim()
    const varName = resolveVariables(String(rawVarName), varsMap).trim()
    if (varName !== '' && varsMap.has(varName)) {
      const val = varsMap.get(varName)
      if (val !== undefined && val !== null) {
        exists = true
        actualValue = val
      }
    }
  } else {
    return false
  }

  if (operator === 'exists') {
    return exists && actualValue !== undefined && actualValue !== null
  }

  if (!exists || actualValue === undefined || actualValue === null) {
    return false
  }

  switch (operator) {
    case '==':
      return valuesAreEqual(actualValue, resolvedExpected)
    case '!=':
      return !valuesAreEqual(actualValue, resolvedExpected)
    case '>': {
      const numActual = parseFiniteNumber(actualValue)
      const numExpected = parseFiniteNumber(resolvedExpected)
      if (numActual === null || numExpected === null) return false
      return numActual > numExpected
    }
    case '<': {
      const numActual = parseFiniteNumber(actualValue)
      const numExpected = parseFiniteNumber(resolvedExpected)
      if (numActual === null || numExpected === null) return false
      return numActual < numExpected
    }
    case '>=': {
      const numActual = parseFiniteNumber(actualValue)
      const numExpected = parseFiniteNumber(resolvedExpected)
      if (numActual === null || numExpected === null) return false
      return numActual >= numExpected
    }
    case '<=': {
      const numActual = parseFiniteNumber(actualValue)
      const numExpected = parseFiniteNumber(resolvedExpected)
      if (numActual === null || numExpected === null) return false
      return numActual <= numExpected
    }
    case 'contains': {
      if (Array.isArray(actualValue)) {
        return actualValue.some(
          item => item !== undefined && item !== null && valuesAreEqual(item, resolvedExpected)
        )
      }
      if (
        typeof actualValue === 'string' ||
        typeof actualValue === 'number' ||
        typeof actualValue === 'boolean'
      ) {
        return String(actualValue).includes(String(resolvedExpected))
      }
      return false
    }
    case 'matches': {
      try {
        const re = new RegExp(resolvedExpected)
        return re.test(String(actualValue))
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

/**
 * Selects the first matching branch for a FlowNode:
 * 1. Evaluates all `custom` branches in declaration order first.
 * 2. If no `custom` branch matches, picks the first `success` branch (when nodePassed === true)
 *    or first `error` branch (when nodePassed === false).
 * 3. Marks all other branches as skipped.
 */
export function selectMatchingBranch(
  branches: FlowBranch[] | undefined | null,
  nodePassed: boolean,
  ctx: BranchEvalContext
): BranchSelectionResult {
  if (!Array.isArray(branches) || branches.length === 0) {
    return { matchedBranchId: null, skippedBranchIds: [] }
  }

  let matchedIdx = -1

  // 1. Check "custom" branches in declaration order
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i]
    if (!branch || !branch.condition) continue
    const condType = (branch.condition.type || '').trim().toLowerCase()
    if (condType === 'custom') {
      if (evaluateCustomBranchCondition(branch.condition, ctx)) {
        matchedIdx = i
        break
      }
    }
  }

  // 2. Fallback to first "success" or "error" branch
  if (matchedIdx === -1) {
    const fallbackType = nodePassed ? 'success' : 'error'
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i]
      if (!branch || !branch.condition) continue
      const condType = (branch.condition.type || '').trim().toLowerCase()
      if (condType === fallbackType) {
        matchedIdx = i
        break
      }
    }
  }

  const matchedBranchId = matchedIdx >= 0 ? branches[matchedIdx].id : null
  const skippedBranchIds: string[] = []
  for (let i = 0; i < branches.length; i++) {
    if (i !== matchedIdx && branches[i] && branches[i].id) {
      skippedBranchIds.push(branches[i].id)
    }
  }

  return { matchedBranchId, skippedBranchIds }
}

function normalizeStepScriptResult(
  raw: Partial<ScriptExecutionResult>,
  stepPathFolders: FolderNodeLike[],
  allFolders: FolderNodeLike[],
  activeEnvId: string | null | undefined,
  environments: FlowMutableEnvironmentModel[]
): ScriptExecutionResult {
  const normalized: ScriptExecutionResult = {
    success: raw.success !== false,
    logs: Array.isArray(raw.logs) ? [...raw.logs] : [],
    logEntries: Array.isArray(raw.logEntries) ? deepClone(raw.logEntries) : [],
    testResults: Array.isArray(raw.testResults) ? deepClone(raw.testResults) : [],
    envUpdates: raw.envUpdates ? { ...raw.envUpdates } : {},
    scopedEnvUpdates: {
      collection: raw.scopedEnvUpdates?.collection
        ? { ...raw.scopedEnvUpdates.collection }
        : {},
      globalEnvs: {},
      folderGlobals: {},
      folderEnvs: []
    },
    scopedAuthUpdates: {
      folderGlobals: {},
      folderEnvs: [],
      collectionGlobal: raw.scopedAuthUpdates?.collectionGlobal
        ? deepClone(raw.scopedAuthUpdates.collectionGlobal)
        : undefined,
      collectionEnvs: []
    },
    requestMutations: raw.requestMutations ? deepClone(raw.requestMutations) : {},
    error: raw.error
  }

  if (raw.scopedEnvUpdates?.globalEnvs) {
    for (const [envSel, kvMap] of Object.entries(raw.scopedEnvUpdates.globalEnvs)) {
      const resolvedEnv = resolveEnvIdInMemory(envSel, activeEnvId, environments) || envSel
      if (!normalized.scopedEnvUpdates.globalEnvs[resolvedEnv]) {
        normalized.scopedEnvUpdates.globalEnvs[resolvedEnv] = {}
      }
      Object.assign(normalized.scopedEnvUpdates.globalEnvs[resolvedEnv], kvMap || {})
    }
  }

  if (raw.scopedEnvUpdates?.folderGlobals) {
    for (const [folderSel, kvMap] of Object.entries(raw.scopedEnvUpdates.folderGlobals)) {
      const fId = resolveFolderIdInMemory(folderSel, stepPathFolders, allFolders)
      if (!fId) continue
      if (!normalized.scopedEnvUpdates.folderGlobals[fId]) {
        normalized.scopedEnvUpdates.folderGlobals[fId] = {}
      }
      Object.assign(normalized.scopedEnvUpdates.folderGlobals[fId], kvMap || {})
    }
  }

  if (Array.isArray(raw.scopedEnvUpdates?.folderEnvs)) {
    for (const item of raw.scopedEnvUpdates!.folderEnvs) {
      if (!item) continue
      const fId = resolveFolderIdInMemory(item.folder, stepPathFolders, allFolders)
      const eId = resolveEnvIdInMemory(item.env, activeEnvId, environments)
      if (!fId || !eId) continue
      const existingIdx = normalized.scopedEnvUpdates.folderEnvs.findIndex(
        x => x.folder === fId && x.env === eId && x.key === item.key
      )
      if (existingIdx >= 0) {
        normalized.scopedEnvUpdates.folderEnvs[existingIdx].value = item.value
      } else {
        normalized.scopedEnvUpdates.folderEnvs.push({
          folder: fId,
          env: eId,
          key: item.key,
          value: item.value
        })
      }
    }
  }

  if (raw.scopedAuthUpdates?.collectionEnvs) {
    for (const item of raw.scopedAuthUpdates.collectionEnvs) {
      if (!item || !item.auth) continue
      const eId = resolveEnvIdInMemory(item.env, activeEnvId, environments)
      if (!eId) continue
      const existingIdx = normalized.scopedAuthUpdates.collectionEnvs!.findIndex(
        x => x.env === eId
      )
      if (existingIdx >= 0) {
        normalized.scopedAuthUpdates.collectionEnvs![existingIdx].auth = deepClone(item.auth)
      } else {
        normalized.scopedAuthUpdates.collectionEnvs!.push({
          env: eId,
          auth: deepClone(item.auth)
        })
      }
    }
  }

  if (raw.scopedAuthUpdates?.folderGlobals) {
    for (const [folderSel, authCfg] of Object.entries(raw.scopedAuthUpdates.folderGlobals)) {
      if (!authCfg) continue
      const fId = resolveFolderIdInMemory(folderSel, stepPathFolders, allFolders)
      if (!fId) continue
      normalized.scopedAuthUpdates.folderGlobals[fId] = deepClone(authCfg)
    }
  }

  if (Array.isArray(raw.scopedAuthUpdates?.folderEnvs)) {
    for (const item of raw.scopedAuthUpdates!.folderEnvs) {
      if (!item || !item.auth) continue
      const fId = resolveFolderIdInMemory(item.folder, stepPathFolders, allFolders)
      const eId = resolveEnvIdInMemory(item.env, activeEnvId, environments)
      if (!fId || !eId) continue
      const existingIdx = normalized.scopedAuthUpdates.folderEnvs.findIndex(
        x => x.folder === fId && x.env === eId
      )
      if (existingIdx >= 0) {
        normalized.scopedAuthUpdates.folderEnvs[existingIdx].auth = deepClone(item.auth)
      } else {
        normalized.scopedAuthUpdates.folderEnvs.push({
          folder: fId,
          env: eId,
          auth: deepClone(item.auth)
        })
      }
    }
  }

  return normalized
}

function applyNormalizedUpdatesToState(
  norm: ScriptExecutionResult,
  collection: FlowMutableCollectionModel,
  environments: FlowMutableEnvironmentModel[],
  activeEnvId: string | null | undefined,
  stepPathFolders: FolderNodeLike[],
  allFolders: FolderNodeLike[]
): void {
  const syncFolderNodes = (folderId: string, updater: (node: FolderNodeLike) => void) => {
    for (const pf of stepPathFolders) {
      if (pf && pf.id === folderId) updater(pf)
    }
    for (const af of allFolders) {
      if (af && af.id === folderId) updater(af)
    }
  }

  // 1. Default envUpdates
  const envEntries = Object.entries(norm.envUpdates || {})
  if (envEntries.length > 0) {
    let appliedToActiveEnv = false
    if (activeEnvId) {
      const activeEnv = environments.find(e => e && e.id === activeEnvId)
      if (activeEnv) {
        if (!Array.isArray(activeEnv.variables)) activeEnv.variables = []
        for (const [k, v] of envEntries) {
          upsertVariableKVPair(activeEnv.variables, k, v)
        }
        appliedToActiveEnv = true
      }
    }
    if (!appliedToActiveEnv) {
      if (!Array.isArray(collection.variables)) collection.variables = []
      for (const [k, v] of envEntries) {
        upsertVariableKVPair(collection.variables, k, v)
      }
    }
  }

  // 2. Scoped variable updates
  const scoped = norm.scopedEnvUpdates
  if (scoped) {
    const collEntries = Object.entries(scoped.collection || {})
    if (collEntries.length > 0) {
      if (!Array.isArray(collection.variables)) collection.variables = []
      for (const [k, v] of collEntries) {
        upsertVariableKVPair(collection.variables, k, v)
      }
    }

    for (const [envId, kvMap] of Object.entries(scoped.globalEnvs || {})) {
      const targetEnv = environments.find(e => e && e.id === envId)
      if (targetEnv) {
        if (!Array.isArray(targetEnv.variables)) targetEnv.variables = []
        for (const [k, v] of Object.entries(kvMap || {})) {
          upsertVariableKVPair(targetEnv.variables, k, v)
        }
      }
    }

    for (const [fId, kvMap] of Object.entries(scoped.folderGlobals || {})) {
      syncFolderNodes(fId, node => {
        if (!Array.isArray(node.variables)) node.variables = []
        for (const [k, v] of Object.entries(kvMap || {})) {
          upsertVariableKVPair(node.variables as VariableKVPair[], k, v)
        }
      })
    }

    for (const item of scoped.folderEnvs || []) {
      syncFolderNodes(item.folder, node => {
        if (!node.folder_envs || typeof node.folder_envs !== 'object') {
          node.folder_envs = {}
        }
        if (!Array.isArray(node.folder_envs[item.env])) {
          node.folder_envs[item.env] = []
        }
        upsertVariableKVPair(
          node.folder_envs[item.env] as VariableKVPair[],
          item.key,
          item.value
        )
      })
    }
  }

  // 3. Scoped Auth updates
  const authUpdates = norm.scopedAuthUpdates
  if (authUpdates) {
    if (authUpdates.collectionGlobal) {
      collection.auth = deepClone(authUpdates.collectionGlobal)
    }
    for (const item of authUpdates.collectionEnvs || []) {
      if (!collection.auth_envs || typeof collection.auth_envs !== 'object') {
        collection.auth_envs = {}
      }
      collection.auth_envs[item.env] = deepClone(item.auth)
    }
    for (const [fId, authCfg] of Object.entries(authUpdates.folderGlobals || {})) {
      if (!authCfg) continue
      syncFolderNodes(fId, node => {
        node.auth = deepClone(authCfg)
      })
    }
    for (const item of authUpdates.folderEnvs || []) {
      if (!item.auth) continue
      syncFolderNodes(item.folder, node => {
        if (!node.auth_envs || typeof node.auth_envs !== 'object') {
          node.auth_envs = {}
        }
        node.auth_envs[item.env] = deepClone(item.auth)
      })
    }
  }
}

function accumulateMergedScriptResult(
  dst: ScriptExecutionResult,
  src: ScriptExecutionResult
): void {
  if (!src.success) {
    dst.success = false
    if (src.error) {
      dst.error = dst.error ? `${dst.error}; ${src.error}` : src.error
    }
  }
  if (Array.isArray(src.logs) && src.logs.length > 0) {
    dst.logs.push(...src.logs)
  }
  if (Array.isArray(src.logEntries) && src.logEntries.length > 0) {
    dst.logEntries.push(...src.logEntries)
  }
  if (Array.isArray(src.testResults) && src.testResults.length > 0) {
    dst.testResults.push(...src.testResults)
  }

  Object.assign(dst.envUpdates, src.envUpdates || {})
  Object.assign(dst.scopedEnvUpdates.collection, src.scopedEnvUpdates?.collection || {})

  for (const [envId, kvMap] of Object.entries(src.scopedEnvUpdates?.globalEnvs || {})) {
    if (!dst.scopedEnvUpdates.globalEnvs[envId]) {
      dst.scopedEnvUpdates.globalEnvs[envId] = {}
    }
    Object.assign(dst.scopedEnvUpdates.globalEnvs[envId], kvMap || {})
  }

  for (const [fId, kvMap] of Object.entries(src.scopedEnvUpdates?.folderGlobals || {})) {
    if (!dst.scopedEnvUpdates.folderGlobals[fId]) {
      dst.scopedEnvUpdates.folderGlobals[fId] = {}
    }
    Object.assign(dst.scopedEnvUpdates.folderGlobals[fId], kvMap || {})
  }

  for (const item of src.scopedEnvUpdates?.folderEnvs || []) {
    const idx = dst.scopedEnvUpdates.folderEnvs.findIndex(
      x => x.folder === item.folder && x.env === item.env && x.key === item.key
    )
    if (idx >= 0) {
      dst.scopedEnvUpdates.folderEnvs[idx].value = item.value
    } else {
      dst.scopedEnvUpdates.folderEnvs.push({ ...item })
    }
  }

  if (src.scopedAuthUpdates?.collectionGlobal) {
    dst.scopedAuthUpdates.collectionGlobal = deepClone(src.scopedAuthUpdates.collectionGlobal)
  }

  for (const item of src.scopedAuthUpdates?.collectionEnvs || []) {
    if (!dst.scopedAuthUpdates.collectionEnvs) {
      dst.scopedAuthUpdates.collectionEnvs = []
    }
    const idx = dst.scopedAuthUpdates.collectionEnvs.findIndex(x => x.env === item.env)
    if (idx >= 0) {
      dst.scopedAuthUpdates.collectionEnvs[idx].auth = deepClone(item.auth)
    } else {
      dst.scopedAuthUpdates.collectionEnvs.push({
        env: item.env,
        auth: deepClone(item.auth)
      })
    }
  }

  for (const [fId, authCfg] of Object.entries(src.scopedAuthUpdates?.folderGlobals || {})) {
    dst.scopedAuthUpdates.folderGlobals[fId] = deepClone(authCfg)
  }

  for (const item of src.scopedAuthUpdates?.folderEnvs || []) {
    const idx = dst.scopedAuthUpdates.folderEnvs.findIndex(
      x => x.folder === item.folder && x.env === item.env
    )
    if (idx >= 0) {
      dst.scopedAuthUpdates.folderEnvs[idx].auth = deepClone(item.auth)
    } else {
      dst.scopedAuthUpdates.folderEnvs.push({
        folder: item.folder,
        env: item.env,
        auth: deepClone(item.auth)
      })
    }
  }
}

function wasVariableMutatedInScriptResult(key: string, res: ScriptExecutionResult): boolean {
  if (!key) return false
  if (res.envUpdates && Object.prototype.hasOwnProperty.call(res.envUpdates, key)) {
    return true
  }
  const scoped = res.scopedEnvUpdates
  if (!scoped) return false
  if (scoped.collection && Object.prototype.hasOwnProperty.call(scoped.collection, key)) {
    return true
  }
  for (const kvMap of Object.values(scoped.globalEnvs || {})) {
    if (kvMap && Object.prototype.hasOwnProperty.call(kvMap, key)) {
      return true
    }
  }
  for (const kvMap of Object.values(scoped.folderGlobals || {})) {
    if (kvMap && Object.prototype.hasOwnProperty.call(kvMap, key)) {
      return true
    }
  }
  for (const item of scoped.folderEnvs || []) {
    if (item && item.key === key) {
      return true
    }
  }
  return false
}

/**
 * Deterministically merges variable and auth mutations produced by parallel steps in a FlowNode
 * according to their declaration order in `node.Steps` (`index 0 -> 1 -> ...`).
 * Normalizes `"__nearest__"` folder references using each step's own `pathFolders` so the merged
 * `mergedScriptResult` can be persisted to disk in a single atomic batch.
 */
export function mergeParallelScriptUpdates(
  baseState: HeadlessMutableState | undefined | null,
  stepOutputs: ParallelStepMutationItem[] | undefined | null,
  initialOrderedFolderIds?: string[]
): MergedParallelState {
  const collection: FlowMutableCollectionModel = deepClone(
    baseState?.collection || { id: 'default', name: 'Default', variables: [] }
  )
  const environments: FlowMutableEnvironmentModel[] = deepClone(baseState?.environments || [])
  const allFolders: FolderNodeLike[] = deepClone(baseState?.allFolders || [])
  const rawActiveEnvId =
    baseState?.activeEnvId !== undefined
      ? baseState.activeEnvId
      : (collection.active_env_id || null)
  const activeEnvId = resolveEnvIdInMemory(rawActiveEnvId, rawActiveEnvId, environments)

  const mergedScriptResult: ScriptExecutionResult = {
    success: true,
    logs: [],
    logEntries: [],
    testResults: [],
    envUpdates: {},
    scopedEnvUpdates: {
      collection: {},
      globalEnvs: {},
      folderGlobals: {},
      folderEnvs: []
    },
    scopedAuthUpdates: {
      folderGlobals: {},
      folderEnvs: [],
      collectionEnvs: []
    },
    requestMutations: {}
  }

  const orderedStepFolderIds: string[] = []
  const recordOrderedFolderId = (fid: string | undefined | null) => {
    if (!fid) return
    const existingIdx = orderedStepFolderIds.indexOf(fid)
    if (existingIdx !== -1) {
      orderedStepFolderIds.splice(existingIdx, 1)
    }
    orderedStepFolderIds.push(fid)
  }

  const seedFolders = initialOrderedFolderIds || baseState?.orderedStepFolderIds || []
  for (const fid of seedFolders) {
    recordOrderedFolderId(fid)
  }

  const items = Array.isArray(stepOutputs) ? stepOutputs : []

  for (const item of items) {
    if (!item) continue
    const stepPathFolders: FolderNodeLike[] = deepClone(item.pathFolders || [])
    for (const pf of stepPathFolders) {
      if (!pf || !pf.id) continue
      if (!allFolders.some(af => af && af.id === pf.id)) {
        allFolders.push(deepClone(pf))
      }
      recordOrderedFolderId(pf.id)
    }

    const rawResults: Array<Partial<ScriptExecutionResult>> = []
    if (item.preScriptResult) rawResults.push(item.preScriptResult)
    if (item.postScriptResult) rawResults.push(item.postScriptResult)
    if (item.scriptResult) rawResults.push(item.scriptResult)
    if (
      !item.scriptResult &&
      !item.preScriptResult &&
      !item.postScriptResult &&
      (item.envUpdates || item.scopedEnvUpdates || item.scopedAuthUpdates)
    ) {
      rawResults.push({
        envUpdates: item.envUpdates || {},
        scopedEnvUpdates: {
          collection: item.scopedEnvUpdates?.collection || {},
          globalEnvs: item.scopedEnvUpdates?.globalEnvs || {},
          folderGlobals: item.scopedEnvUpdates?.folderGlobals || {},
          folderEnvs: item.scopedEnvUpdates?.folderEnvs || []
        },
        scopedAuthUpdates: {
          folderGlobals: item.scopedAuthUpdates?.folderGlobals || {},
          folderEnvs: item.scopedAuthUpdates?.folderEnvs || [],
          collectionGlobal: item.scopedAuthUpdates?.collectionGlobal,
          collectionEnvs: item.scopedAuthUpdates?.collectionEnvs || []
        }
      })
    }

    for (const rawRes of rawResults) {
      const normalized = normalizeStepScriptResult(
        rawRes,
        stepPathFolders,
        allFolders,
        activeEnvId,
        environments
      )
      for (const fId of Object.keys(normalized.scopedEnvUpdates?.folderGlobals || {})) {
        recordOrderedFolderId(fId)
      }
      for (const fe of normalized.scopedEnvUpdates?.folderEnvs || []) {
        if (fe?.folder) recordOrderedFolderId(fe.folder)
      }
      applyNormalizedUpdatesToState(
        normalized,
        collection,
        environments,
        activeEnvId,
        stepPathFolders,
        allFolders
      )
      accumulateMergedScriptResult(mergedScriptResult, normalized)
    }
  }

  const effectivePathFolders: FolderNodeLike[] = orderedStepFolderIds
    .map(fid => allFolders.find(f => f && f.id === fid))
    .filter((f): f is FolderNodeLike => Boolean(f))

  const activeEnv = activeEnvId ? environments.find(e => e && e.id === activeEnvId) : undefined
  const varsMap = resolveHierarchyVariables({
    collectionVariables: collection.variables || [],
    activeEnvVariables: activeEnv?.variables || [],
    pathFolders: effectivePathFolders,
    activeEnvId: activeEnvId || null
  })

  for (const [k, v] of Object.entries(mergedScriptResult.envUpdates || {})) {
    const trimmedKey = k.trim()
    if (trimmedKey !== '' && !varsMap.has(trimmedKey)) {
      varsMap.set(trimmedKey, v)
    }
  }

  if (baseState?.cliVarOverrides) {
    for (const [k, v] of Object.entries(baseState.cliVarOverrides)) {
      const trimmedKey = k.trim()
      if (
        trimmedKey !== '' &&
        !wasVariableMutatedInScriptResult(trimmedKey, mergedScriptResult)
      ) {
        varsMap.set(trimmedKey, v)
      }
    }
  }

  return {
    collection,
    environments,
    activeEnvId: activeEnvId || null,
    allFolders,
    resolvedVariables: Object.fromEntries(varsMap),
    mergedScriptResult
  }
}

