import type { KVPair } from '../stores/requestStore'

export interface ParsedUrl {
  baseUrl: string
  params: KVPair[]
  hash: string
}

/**
 * Splits a string by a delimiter character, only when outside {{...}} blocks.
 * If limit is provided, splits at most that many times (e.g. limit = 2 for key=value).
 */
export function splitPreservingVars(str: string, delimiter: string, limit?: number): string[] {
  const result: string[] = []
  let current = ''
  let inVarDepth = 0
  let splitsCount = 0

  for (let i = 0; i < str.length; i++) {
    if (limit && splitsCount >= limit - 1) {
      current += str.substring(i)
      break
    }

    if (str[i] === '{' && str[i + 1] === '{') {
      inVarDepth++
      current += '{{'
      i++
      continue
    }

    if (str[i] === '}' && str[i + 1] === '}' && inVarDepth > 0) {
      inVarDepth--
      current += '}}'
      i++
      continue
    }

    if (inVarDepth === 0 && str[i] === delimiter) {
      result.push(current)
      current = ''
      splitsCount++
      continue
    }

    current += str[i]
  }

  result.push(current)
  return result
}

/**
 * Encodes a query component (key or value), preserving {{...}} variable blocks verbatim.
 */
export function encodeQueryComponent(str: string): string {
  if (!str) return ''
  const varRegex = /\{\{[^}]+\}\}/g
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = varRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      result += encodeURIComponent(str.substring(lastIndex, match.index))
    }
    result += match[0]
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < str.length) {
    result += encodeURIComponent(str.substring(lastIndex))
  }

  return result
}

function safeDecode(plain: string): string {
  try {
    return decodeURIComponent(plain)
  } catch {
    return plain
  }
}

/**
 * Decodes a query component (key or value), preserving {{...}} variable blocks.
 * Safely handles malformed percent-encoding and preserves literal '+'.
 */
export function decodeQueryComponent(str: string): string {
  if (!str) return ''
  const varRegex = /\{\{[^}]+\}\}/g
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = varRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      result += safeDecode(str.substring(lastIndex, match.index))
    }
    result += match[0]
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < str.length) {
    result += safeDecode(str.substring(lastIndex))
  }

  return result
}

/**
 * Parses a query string into an array of KVPairs with enabled: true.
 */
export function parseQueryParams(queryString: string): KVPair[] {
  if (!queryString) return []

  let cleanQuery = queryString
  if (cleanQuery.startsWith('?')) {
    cleanQuery = cleanQuery.slice(1)
  }
  if (!cleanQuery) return []

  const segments = splitPreservingVars(cleanQuery, '&')
  const params: KVPair[] = []

  for (const segment of segments) {
    if (segment.length === 0) continue

    const eqParts = splitPreservingVars(segment, '=', 2)
    const rawKey = eqParts[0]
    const rawVal = eqParts.length > 1 ? eqParts[1] : ''

    const key = decodeQueryComponent(rawKey)
    const value = decodeQueryComponent(rawVal)

    params.push({
      key,
      value,
      enabled: true
    })
  }

  return params
}

/**
 * Parses full URL into baseUrl, params list and hash fragment.
 */
export function parseUrl(url: string): ParsedUrl {
  if (!url) {
    return { baseUrl: '', params: [], hash: '' }
  }

  // 1. Extract hash fragment (first # outside variables)
  const hashParts = splitPreservingVars(url, '#', 2)
  const withoutHash = hashParts[0] ?? ''
  const hash = hashParts.length > 1 ? '#' + hashParts[1] : ''

  // 2. Extract query string (first ? outside variables)
  const queryParts = splitPreservingVars(withoutHash, '?', 2)
  const baseUrl = queryParts[0] ?? ''
  const rawQuery = queryParts.length > 1 ? queryParts[1] : ''

  const params = parseQueryParams(rawQuery)

  return { baseUrl, params, hash }
}

/**
 * Builds query string from an array of KVPairs.
 * Only includes enabled params with non-empty keys.
 * If value is empty (''), serializes as 'key' without '='.
 */
export function buildQueryString(params: KVPair[]): string {
  if (!params || params.length === 0) return ''

  const activeParams = params.filter(p => p.enabled && p.key !== '')
  if (activeParams.length === 0) return ''

  return activeParams
    .map(p => {
      const encodedKey = encodeQueryComponent(p.key)
      if (p.value === '') {
        return encodedKey
      }
      return `${encodedKey}=${encodeQueryComponent(p.value)}`
    })
    .join('&')
}

/**
 * Updates or sets query string in a URL while preserving baseUrl, port, path, and hash fragment.
 */
export function updateUrlWithParams(currentUrl: string, params: KVPair[]): string {
  if (!currentUrl) {
    const qs = buildQueryString(params)
    return qs ? `?${qs}` : ''
  }

  const { baseUrl, hash } = parseUrl(currentUrl)
  const qs = buildQueryString(params)

  if (!qs) {
    return `${baseUrl}${hash}`
  }

  return `${baseUrl}?${qs}${hash}`
}

/**
 * Deep equality check for KVPair arrays.
 */
export function areParamsEqual(a: KVPair[] | undefined | null, b: KVPair[] | undefined | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    const itemA = a[i]
    const itemB = b[i]
    if (
      itemA.key !== itemB.key ||
      itemA.value !== itemB.value ||
      itemA.enabled !== itemB.enabled
    ) {
      return false
    }
  }

  return true
}

/**
 * Reconciles parsed query params from URL with currentParams from store.
 * Preserves all disabled params (enabled: false) and merges existing properties (e.g. _isAuto).
 */
export function reconcileParamsFromUrl(url: string, currentParams: KVPair[] = []): KVPair[] {
  const { params: parsedList } = parseUrl(url)

  if (parsedList.length === 0) {
    // If no query params in URL, retain only disabled params from store
    return currentParams.filter(p => !p.enabled)
  }

  const result: KVPair[] = []
  let parsedIdx = 0

  for (const item of currentParams) {
    if (!item.enabled) {
      // Always preserve disabled parameters in their positions
      result.push({ ...item })
    } else {
      if (parsedIdx < parsedList.length) {
        // Merge existing item properties (_isAuto, etc.) with new values from URL
        result.push({ ...item, ...parsedList[parsedIdx] })
        parsedIdx++
      }
    }
  }

  while (parsedIdx < parsedList.length) {
    result.push({ ...parsedList[parsedIdx] })
    parsedIdx++
  }

  return result
}

export const formatUrl = updateUrlWithParams

export interface PathParamTokenMatch {
  name: string
  raw: string
  startIndex: number
  endIndex: number
}

/**
 * Finds all `:param` tokens in a URL string (excluding scheme://, user:pass@ authority, :port, and {{...}} blocks).
 */
export function findPathParamTokens(url: string): PathParamTokenMatch[] {
  if (!url) return []

  // Mask {{...}} blocks with spaces of identical length so indices stay exact
  const masked = url.replace(/\{\{[^}]*\}\}/g, m => ' '.repeat(m.length))

  // Only scan the pathname (stop before query '?' or hash '#')
  const queryOrHashIdx = masked.search(/[?#]/)
  const scanEnd = queryOrHashIdx === -1 ? masked.length : queryOrHashIdx

  // Determine start offset after scheme://authority or host:port authority
  let scanStart = 0
  const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(masked)
  if (schemeMatch) {
    const afterScheme = schemeMatch[0].length
    const slashIdx = masked.indexOf('/', afterScheme)
    if (slashIdx === -1 || slashIdx >= scanEnd) {
      return []
    }
    scanStart = slashIdx
  } else if (!masked.startsWith('/') && !masked.startsWith(':')) {
    const slashIdx = masked.indexOf('/')
    if (slashIdx === -1 || slashIdx >= scanEnd) {
      return []
    }
    scanStart = slashIdx
  }

  const matches: PathParamTokenMatch[] = []
  const regex = /:([a-zA-Z_][a-zA-Z0-9_-]*)/g
  regex.lastIndex = scanStart

  let m: RegExpExecArray | null
  while ((m = regex.exec(masked)) !== null) {
    if (m.index >= scanEnd) {
      break
    }
    const afterIdx = m.index + m[0].length
    if (afterIdx > scanEnd) {
      break
    }
    // Ensure not followed by '//' (like https://)
    if (masked.slice(afterIdx, afterIdx + 2) === '//') {
      continue
    }
    matches.push({
      name: m[1],
      raw: m[0],
      startIndex: m.index,
      endIndex: afterIdx
    })
  }

  return matches
}

/**
 * Extracts unique `:param` variable names from a URL in order of appearance.
 */
export function extractPathParamKeys(url: string): string[] {
  const tokens = findPathParamTokens(url)
  const seen = new Set<string>()
  const keys: string[] = []
  for (const t of tokens) {
    if (!seen.has(t.name)) {
      seen.add(t.name)
      keys.push(t.name)
    }
  }
  return keys
}

/**
 * Reconciles `:param` path variables extracted from URL with existing `path_params` array.
 * Preserves existing values, enabled state, and descriptions for matching keys.
 */
export function reconcilePathParamsFromUrl(url: string, currentPathParams: KVPair[] = []): KVPair[] {
  const keys = extractPathParamKeys(url)
  if (keys.length === 0) {
    return []
  }

  const existingByKey = new Map<string, KVPair>()
  for (const item of currentPathParams || []) {
    if (item && item.key && !existingByKey.has(item.key)) {
      existingByKey.set(item.key, item)
    }
  }

  return keys.map(key => {
    const existing = existingByKey.get(key)
    if (existing) {
      return {
        ...existing,
        key,
        value: existing.value ?? '',
        enabled: existing.enabled !== undefined ? existing.enabled : true
      }
    }
    return {
      key,
      value: '',
      enabled: true
    }
  })
}

/**
 * Substitutes `:param` tokens in `url` using enabled `pathParams` (or `fallbackVars` when pathParam value is empty).
 */
export function resolvePathParamsInUrl(
  url: string,
  pathParams: KVPair[] = [],
  fallbackVars?: Map<string, string>
): string {
  if (!url) return ''
  const tokens = findPathParamTokens(url)
  if (tokens.length === 0) return url

  const paramMap = new Map<string, { value: string; enabled: boolean }>()
  for (const item of pathParams || []) {
    if (item && item.key) {
      paramMap.set(item.key, { value: item.value ?? '', enabled: item.enabled !== false })
    }
  }

  let result = ''
  let lastIndex = 0
  for (const token of tokens) {
    result += url.slice(lastIndex, token.startIndex)
    const entry = paramMap.get(token.name)
    let replacement: string | undefined
    if (entry && entry.enabled && entry.value !== '') {
      replacement = entry.value
    } else if ((!entry || entry.enabled) && fallbackVars?.has(token.name)) {
      replacement = fallbackVars.get(token.name)
    }

    if (replacement !== undefined) {
      result += replacement
    } else {
      result += token.raw
    }
    lastIndex = token.endIndex
  }
  result += url.slice(lastIndex)
  return result
}

