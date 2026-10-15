import type { AuthConfig, TreeNode } from '../stores/collectionStore'
import type { KVPair } from '../stores/requestStore'
import { resolveVariables } from './variables'

export interface EffectiveAuthResult {
  auth: AuthConfig
  sourceNode?: TreeNode
  sourceCollection?: { id?: string; name?: string }
}

export interface ResolveEffectiveAuthOptions {
  activeEnvId?: string | null
  requestAuthEnvs?: Record<string, AuthConfig>
  collection?: {
    id?: string
    name?: string
    auth?: AuthConfig
    auth_envs?: Record<string, AuthConfig>
  } | null
}

function pickEntityAuth(
  globalAuth: AuthConfig | undefined,
  authEnvs: Record<string, AuthConfig> | undefined,
  activeEnvId: string | null | undefined
): AuthConfig | undefined {
  if (activeEnvId && authEnvs && authEnvs[activeEnvId]) {
    const envAuth = authEnvs[activeEnvId]
    if (envAuth && envAuth.type && envAuth.type !== 'inherit') {
      return envAuth
    }
  }
  return globalAuth
}

/**
 * Resolves the effective authentication for a request or folder by walking up the ancestor tree.
 * At each tier (Request -> Nearest Folder -> ... -> Root Folder -> Collection),
 * environment-scoped auth (auth_envs[activeEnvId]) takes precedence over global auth when non-inherit.
 * If no non-inherit auth is found, defaults to { type: 'none' }.
 */
export function resolveEffectiveAuth(
  auth: AuthConfig | undefined,
  pathNodes: TreeNode[] = [],
  options?: ResolveEffectiveAuthOptions
): EffectiveAuthResult {
  const activeEnvId = options?.activeEnvId

  const targetAuth = pickEntityAuth(auth, options?.requestAuthEnvs, activeEnvId)
  if (targetAuth && targetAuth.type && targetAuth.type !== 'inherit') {
    return { auth: targetAuth }
  }

  // Only inspect folder nodes in pathNodes (ignore request nodes)
  const folderNodes = (pathNodes || []).filter(n => n && n.type === 'folder')

  // Walk from nearest parent (last in folderNodes) up to root (first in folderNodes)
  for (let i = folderNodes.length - 1; i >= 0; i--) {
    const node = folderNodes[i]
    const nodeAuth = pickEntityAuth(node.auth, node.auth_envs, activeEnvId)
    if (nodeAuth && nodeAuth.type && nodeAuth.type !== 'inherit') {
      return {
        auth: nodeAuth,
        sourceNode: node
      }
    }
  }

  if (options?.collection) {
    const collAuth = pickEntityAuth(
      options.collection.auth,
      options.collection.auth_envs,
      activeEnvId
    )
    if (collAuth && collAuth.type && collAuth.type !== 'inherit') {
      return {
        auth: collAuth,
        sourceCollection: {
          id: options.collection.id,
          name: options.collection.name
        }
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
