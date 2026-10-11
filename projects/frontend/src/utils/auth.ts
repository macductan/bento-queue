import type { AuthConfig, TreeNode } from '../stores/collectionStore'
import type { KVPair } from '../stores/requestStore'
import { resolveVariables } from './variables'

export interface EffectiveAuthResult {
  auth: AuthConfig
  sourceNode?: TreeNode
}

/**
 * Resolves the effective authentication for a request or folder by walking up the ancestor tree.
 * If auth is undefined or type is 'inherit', it traverses pathNodes from nearest parent to root.
 * If no non-inherit auth is found, defaults to { type: 'none' }.
 */
export function resolveEffectiveAuth(
  auth: AuthConfig | undefined,
  pathNodes: TreeNode[] = []
): EffectiveAuthResult {
  if (auth && auth.type && auth.type !== 'inherit') {
    return { auth }
  }

  // Only inspect folder nodes in pathNodes (ignore request nodes)
  const folderNodes = (pathNodes || []).filter(n => n && n.type === 'folder')

  // Walk from nearest parent (last in folderNodes) up to root (first in folderNodes)
  for (let i = folderNodes.length - 1; i >= 0; i--) {
    const node = folderNodes[i]
    if (node.auth && node.auth.type && node.auth.type !== 'inherit') {
      return {
        auth: node.auth,
        sourceNode: node
      }
    }
  }

  return {
    auth: { type: 'none' }
  }
}

/**
 * Encodes string to Base64 in a UTF-8 safe way without throwing DOMException.
 */
export function toBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str)
    const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    return btoa(binString)
  } catch {
    return ''
  }
}

export interface AppliedAuth {
  headers: KVPair[]
  params: KVPair[]
}

/**
 * Generates the HTTP headers and query params for the given AuthConfig after resolving variables.
 */
export function getAuthArtifacts(
  auth: AuthConfig,
  vars: Map<string, string> = new Map()
): AppliedAuth {
  const headers: KVPair[] = []
  const params: KVPair[] = []

  if (!auth || !auth.type || auth.type === 'none' || auth.type === 'inherit') {
    return { headers, params }
  }

  switch (auth.type) {
    case 'bearer': {
      const rawToken = auth.bearer?.token || ''
      const token = resolveVariables(rawToken, vars).trim()
      if (token !== '') {
        headers.push({
          key: 'Authorization',
          value: `Bearer ${token}`,
          enabled: true
        })
      }
      break
    }
    case 'basic': {
      const rawUser = auth.basic?.username || ''
      const rawPass = auth.basic?.password || ''
      const user = resolveVariables(rawUser, vars)
      const pass = resolveVariables(rawPass, vars)
      if (user !== '' || pass !== '') {
        const encoded = toBase64(`${user}:${pass}`)
        headers.push({
          key: 'Authorization',
          value: `Basic ${encoded}`,
          enabled: true
        })
      }
      break
    }
    case 'apiKey': {
      const rawKey = auth.apiKey?.key || ''
      const rawVal = auth.apiKey?.value || ''
      const key = resolveVariables(rawKey, vars).trim()
      const value = resolveVariables(rawVal, vars).trim()
      const addTo = auth.apiKey?.addTo || 'header'

      if (key !== '') {
        if (addTo === 'query') {
          params.push({
            key,
            value,
            enabled: true
          })
        } else {
          headers.push({
            key,
            value,
            enabled: true
          })
        }
      }
      break
    }
  }

  return { headers, params }
}
