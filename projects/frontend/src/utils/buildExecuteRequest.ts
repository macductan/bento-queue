import type { Request, KVPair } from '../stores/requestStore';
import type { TreeNode } from '../stores/collectionStore';
import { resolveVariables } from './variables';
import { mergeHeaders } from './headers';
import { resolveEffectiveAuth, getAuthArtifacts } from './auth';

export interface ExecuteRequest {
  method: string;
  url: string;
  headers: KVPair[];
  body: string;
}

export function buildExecuteRequest(
  req: Request,
  vars: Map<string, string> = new Map(),
  inheritedHeaders: KVPair[] = [],
  pathNodes: TreeNode[] = []
): ExecuteRequest {
  const method = req.method || 'GET';
  
  // 1. Resolve Auth and get auth headers and query params
  const { auth: effectiveAuth } = resolveEffectiveAuth(req.auth, pathNodes);
  const { headers: rawAuthHeaders, params: rawAuthParams } = getAuthArtifacts(effectiveAuth, vars);
  // Mark auth artifacts as resolved to avoid double variable expansion
  const authHeaders = rawAuthHeaders.map(h => ({ ...h, _authResolved: true }));
  const authParams = rawAuthParams.map(p => ({ ...p, _authResolved: true }));

  // 2. Merge headers:
  // authHeaders override inheritedHeaders, and req.headers overrides baseHeaders
  const baseHeaders = mergeHeaders(authHeaders, inheritedHeaders);
  const merged = mergeHeaders(req.headers || [], baseHeaders);

  // If body is json, automatically add Content-Type: application/json if not already present or explicitly disabled
  const hasContentType = merged.some(h => h.key.trim().toLowerCase() === 'content-type');
  const userExplicitlyDisabled = req.headers?.some(h => typeof h?.key === 'string' && h.key.trim().toLowerCase() === 'content-type' && !h.enabled);

  if (req.body?.type === 'json' && !hasContentType && !userExplicitlyDisabled) {
    merged.unshift({
      key: 'Content-Type',
      value: 'application/json',
      enabled: true
    });
  }

  // Headers - only substitute values, not keys
  const headers = merged
    .filter(h => h.enabled && h.key.trim() !== '')
    .map(h => ({
      key: h.key,
      value: (h as any)._authResolved ? h.value : resolveVariables(h.value, vars),
      enabled: h.enabled
    }));

  // 3. Query Params - combine auth query params with request params
  // Support suppression when user explicitly defines and disables matching query param
  const reqParamKeys = new Set<string>();
  const reqDisabledParamKeys = new Set<string>();
  for (const p of req.params || []) {
    if (p && typeof p.key === 'string' && p.key.trim() !== '') {
      const resolvedKey = resolveVariables(p.key, vars).trim();
      if (p.enabled) {
        reqParamKeys.add(resolvedKey);
      } else {
        reqDisabledParamKeys.add(resolvedKey.toLowerCase());
      }
    }
  }

  const activeAuthParams = authParams.filter(ap => 
    !reqParamKeys.has(ap.key) && !reqDisabledParamKeys.has(ap.key.toLowerCase())
  );
  const rawParams = [...activeAuthParams, ...(req.params || [])];

  const params = rawParams
    .filter(p => p.enabled)
    .map(p => ({
      key: (p as any)._authResolved ? p.key : resolveVariables(p.key, vars),
      value: (p as any)._authResolved ? p.value : resolveVariables(p.value, vars),
      enabled: p.enabled
    }))
    .filter(p => p.key.trim() !== '');

  let url = resolveVariables(req.url || '', vars);
  
  if (params.length > 0) {
    const queryString = params.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    
    const appendToUrl = (baseStr: string, queryStr: string) => {
      if (baseStr.endsWith('&')) {
        return baseStr + queryStr;
      }
      if (baseStr.endsWith('?') && baseStr.indexOf('?') === baseStr.length - 1) {
        return baseStr + queryStr;
      }
      return baseStr + (baseStr.includes('?') ? '&' : '?') + queryStr;
    };
    
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      const base = url.substring(0, hashIndex);
      const hash = url.substring(hashIndex);
      url = appendToUrl(base, queryString) + hash;
    } else {
      url = appendToUrl(url, queryString);
    }
  }

  // Body
  let bodyContent = '';
  if (req.body?.type === 'json' || req.body?.type === 'text') {
    bodyContent = resolveVariables(req.body.content || '', vars);
  }

  return {
    method,
    url,
    headers,
    body: bodyContent
  };
}
