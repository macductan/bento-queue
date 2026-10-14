import type { KVPair } from '../stores/requestStore'
import type { TreeNode } from '../stores/collectionStore'

/**
 * Extracts inherited headers from parent folder nodes (ancestor to direct parent).
 * Headers with empty keys are ignored.
 * Subfolder headers override parent folder headers when keys match (case-insensitive).
 * If a subfolder has the same key disabled, it suppresses the parent header.
 */
export function getInheritedHeaders(pathNodes: TreeNode[] = []): (KVPair & { folderLevel?: number; folderName?: string })[] {
  if (!pathNodes || pathNodes.length === 0) return []

  const folderNodes = pathNodes.filter(n => n && n.type === 'folder')
  if (folderNodes.length === 0) return []

  let effectiveHeaders: (KVPair & { folderLevel?: number; folderName?: string })[] = []

  for (let i = 0; i < folderNodes.length; i++) {
    const folder = folderNodes[i]
    if (!folder.headers || folder.headers.length === 0) continue

    const subfolderHeaders = folder.headers
      .filter(h => h && typeof h.key === 'string' && h.key.trim() !== '')
      .map(h => ({
        ...h,
        folderLevel: i + 1,
        folderName: folder.name
      }))

    effectiveHeaders = mergeHeaders(subfolderHeaders, effectiveHeaders)
  }

  return effectiveHeaders
}

/**
 * Merges request headers with inherited folder headers.
 * Request headers override inherited headers case-insensitively:
 * - If request has enabled header(s) for a key, they replace the inherited header(s). All enabled occurrences are preserved.
 * - If request defines a key but all its occurrences are disabled, the inherited header for that key is suppressed.
 * - If request does not define a key, the inherited header is kept.
 * - Headers with empty or non-string keys are omitted.
 */
export function mergeHeaders(requestHeaders: KVPair[] = [], inheritedHeaders: KVPair[] = []): KVPair[] {
  const reqHeaders = requestHeaders || []
  const inhHeaders = inheritedHeaders || []

  // Determine keys explicitly defined in request headers
  const reqKeySet = new Set<string>()
  for (const h of reqHeaders) {
    if (!h || h._isAuto || typeof h.key !== 'string') continue
    const trimmedKey = h.key.trim()
    if (!trimmedKey) continue
    reqKeySet.add(trimmedKey.toLowerCase())
  }

  const result: KVPair[] = []

  // 1. Add inherited headers that are NOT overridden/defined in request
  for (const h of inhHeaders) {
    if (!h || typeof h.key !== 'string') continue
    const trimmedKey = h.key.trim()
    if (!trimmedKey || !h.enabled) continue
    const lowerKey = trimmedKey.toLowerCase()

    if (!reqKeySet.has(lowerKey)) {
      result.push({
        ...h,
        key: trimmedKey,
        value: h.value || '',
        enabled: true
      })
    }
  }

  // 2. Add all enabled request headers (preserving multiple values with the same key)
  for (const h of reqHeaders) {
    if (!h || h._isAuto || typeof h.key !== 'string') continue
    const trimmedKey = h.key.trim()
    if (!trimmedKey || !h.enabled) continue

    result.push({
      ...h,
      key: trimmedKey,
      value: h.value || '',
      enabled: true
    })
  }

  return result
}

export interface DefaultHeaderItem {
  key: string
  value: string
  source: 'folder' | 'auto' | 'auth'
  authSource?: 'folder' | 'request'
  folderLevel?: number
  folderName?: string
  overridden: boolean
  disabled?: boolean
}

/**
 * Computes default headers (inherited from folders + auth headers + auto-generated like Content-Type)
 * for a request, marking whether each default header is overridden or disabled by a request header.
 */
export function getDefaultHeaders(
  req: { headers?: KVPair[]; body?: { type?: string } } | null | undefined,
  inheritedHeaders: (KVPair & { folderLevel?: number; folderName?: string })[] = [],
  authHeaders: (KVPair & { authSource?: 'folder' | 'request'; folderLevel?: number; folderName?: string })[] = []
): DefaultHeaderItem[] {
  const items: DefaultHeaderItem[] = []
  const safeInherited = inheritedHeaders || []
  const safeAuth = authHeaders || []

  // Check request headers to know what keys the request explicitly defines
  // Distinguishing enabled vs disabled request headers (ignoring enabled _isAuto headers)
  const reqEnabledKeys = new Set<string>()
  const reqDisabledKeys = new Set<string>()
  if (req?.headers) {
    for (const h of req.headers) {
      if (h && typeof h.key === 'string') {
        if (h._isAuto && h.enabled) continue
        const trimmed = h.key.trim()
        if (trimmed) {
          const lower = trimmed.toLowerCase()
          if (h.enabled) {
            reqEnabledKeys.add(lower)
          } else {
            reqDisabledKeys.add(lower)
          }
        }
      }
    }
  }

  const checkStatus = (lowerKey: string): { overridden: boolean; disabled: boolean } => {
    if (reqEnabledKeys.has(lowerKey)) {
      return { overridden: true, disabled: false }
    }
    if (reqDisabledKeys.has(lowerKey)) {
      return { overridden: false, disabled: true }
    }
    return { overridden: false, disabled: false }
  }

  // Pre-collect active auth header keys to mark matching inherited folder headers as overridden
  const authKeySet = new Set<string>()
  for (const h of safeAuth) {
    if (h && typeof h.key === 'string' && h.key.trim() && h.enabled) {
      authKeySet.add(h.key.trim().toLowerCase())
    }
  }

  // 1. Inherited folder headers
  for (const h of safeInherited) {
    if (!h || typeof h.key !== 'string') continue
    const trimmedKey = h.key.trim()
    if (!trimmedKey || !h.enabled) continue
    const lowerKey = trimmedKey.toLowerCase()
    const { overridden, disabled } = checkStatus(lowerKey)
    const isOverriddenByAuth = authKeySet.has(lowerKey)

    items.push({
      key: trimmedKey,
      value: h.value || '',
      source: 'folder',
      folderLevel: h.folderLevel ?? 1,
      folderName: h.folderName,
      overridden: overridden || isOverriddenByAuth,
      disabled
    })
  }

  // 2. Auth headers (e.g. Authorization or custom API key header)
  for (const h of safeAuth) {
    if (!h || typeof h.key !== 'string') continue
    const trimmedKey = h.key.trim()
    if (!trimmedKey || !h.enabled) continue
    const lowerKey = trimmedKey.toLowerCase()
    const { overridden, disabled } = checkStatus(lowerKey)

    items.push({
      key: trimmedKey,
      value: h.value || '',
      source: 'auth',
      authSource: h.authSource,
      folderLevel: h.folderLevel,
      folderName: h.folderName,
      overridden,
      disabled
    })
  }

  // 3. Auto-generated Content-Type when body type is json
  if (req?.body?.type === 'json') {
    const hasInheritedContentType = items.some(item => item.key.toLowerCase() === 'content-type')
    if (!hasInheritedContentType) {
      const { overridden, disabled } = checkStatus('content-type')
      items.push({
        key: 'Content-Type',
        value: 'application/json',
        source: 'auto',
        overridden,
        disabled
      })
    }
  }

  return items
}
