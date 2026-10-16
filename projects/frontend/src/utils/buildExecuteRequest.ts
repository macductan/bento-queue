import type { Request, KVPair } from '../stores/requestStore';
import type { TreeNode } from '../stores/collectionStore';
import { resolveVariables } from './variables';
import { mergeHeaders } from './headers';
import { resolveEffectiveAuth, getAuthArtifacts, type ResolveEffectiveAuthOptions } from './auth';
import { parseUrl, encodeQueryComponent, splitPreservingVars, resolvePathParamsInUrl } from './urlParams';
import { stripJsoncToJson } from './jsonEditor';

export interface ExecuteRequest {
  method: string;
  url: string;
  headers: KVPair[];
  body: string;
  body_type?: string;
  form_data?: KVPair[];
}

const AUTO_EXEC_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded'
};

export function buildExecuteRequest(
  req: Request,
  vars: Map<string, string> = new Map(),
  inheritedHeaders: KVPair[] = [],
  pathNodes: TreeNode[] = [],
  authOptions?: ResolveEffectiveAuthOptions
): ExecuteRequest {
  const method = req.method || 'GET';
  
  // 1. Resolve Auth and get auth headers and query params
  const { auth: effectiveAuth } = resolveEffectiveAuth(req.auth, pathNodes, {
    ...authOptions,
    requestAuthEnvs: authOptions?.requestAuthEnvs ?? req.auth_envs
  });
  const { headers: rawAuthHeaders, params: rawAuthParams } = getAuthArtifacts(effectiveAuth, vars);
  // Mark auth artifacts as resolved to avoid double variable expansion
  const authHeaders = rawAuthHeaders.map(h => ({ ...h, _authResolved: true }));
  const authParams = rawAuthParams.map(p => ({ ...p, _authResolved: true }));

  // 2. Merge headers:
  // authHeaders override inheritedHeaders, and req.headers overrides baseHeaders
  const baseHeaders = mergeHeaders(authHeaders, inheritedHeaders);
  const merged = mergeHeaders(req.headers || [], baseHeaders);

  // Automatically add Content-Type for json, xml, or urlencoded if not already present or explicitly disabled
  const hasContentType = merged.some(h => h.key.trim().toLowerCase() === 'content-type');
  const userExplicitlyDisabled = req.headers?.some(h => typeof h?.key === 'string' && h.key.trim().toLowerCase() === 'content-type' && !h.enabled);
  const autoCt = req.body?.type ? AUTO_EXEC_CONTENT_TYPES[req.body.type] : undefined;

  if (autoCt && !hasContentType && !userExplicitlyDisabled) {
    merged.unshift({
      key: 'Content-Type',
      value: autoCt,
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

  // Resolve :param path variables from req.path_params and fallback to environment vars
  const resolvedPathParams: KVPair[] = [];
  const seenPathKeys = new Set<string>();
  const disabledPathKeys = new Set<string>();
  for (const pp of req.path_params || []) {
    if (!pp || typeof pp.key !== 'string' || pp.key.trim() === '') continue;
    const k = pp.key.trim();
    if (!pp.enabled) {
      disabledPathKeys.add(k);
      continue;
    }
    const rawVal = pp.value || '';
    const resolvedVal = rawVal !== '' ? resolveVariables(rawVal, vars) : (vars.get(k) ?? '');
    if (resolvedVal !== '') {
      resolvedPathParams.push({ key: k, value: resolvedVal, enabled: true });
      seenPathKeys.add(k);
    }
  }
  for (const [k, v] of vars.entries()) {
    if (!seenPathKeys.has(k) && !disabledPathKeys.has(k) && v !== '') {
      resolvedPathParams.push({ key: k, value: v, enabled: true });
    }
  }

  const urlWithPathParams = resolvePathParamsInUrl(req.url || '', resolvedPathParams);
  let url = resolveVariables(urlWithPathParams, vars);
  
  if (params.length > 0) {
    const { params: existingUrlParams } = parseUrl(url);

    const existingCounts = new Map<string, number>();
    for (const ep of existingUrlParams) {
      const k = JSON.stringify([ep.key, ep.value]);
      existingCounts.set(k, (existingCounts.get(k) || 0) + 1);
    }

    const paramsToAppend: { key: string; value: string }[] = [];
    for (const p of params) {
      const k = JSON.stringify([p.key, p.value]);
      const count = existingCounts.get(k) || 0;
      if (count > 0) {
        existingCounts.set(k, count - 1);
      } else {
        paramsToAppend.push(p);
      }
    }

    if (paramsToAppend.length > 0) {
      const queryString = paramsToAppend
        .map(p => p.value === '' ? encodeQueryComponent(p.key) : `${encodeQueryComponent(p.key)}=${encodeQueryComponent(p.value)}`)
        .join('&');
      
      const appendToUrl = (baseStr: string, queryStr: string) => {
        if (baseStr.endsWith('&')) {
          return baseStr + queryStr;
        }
        if (baseStr.endsWith('?') && baseStr.indexOf('?') === baseStr.length - 1) {
          return baseStr + queryStr;
        }
        return baseStr + (baseStr.includes('?') ? '&' : '?') + queryStr;
      };
      
      const [base, hash] = splitPreservingVars(url, '#', 2);
      if (hash !== undefined) {
        url = appendToUrl(base, queryString) + '#' + hash;
      } else {
        url = appendToUrl(url, queryString);
      }
    }
  }

  // Body
  let bodyContent = '';
  const bodyType = req.body?.type || 'none';
  if (bodyType === 'json') {
    bodyContent = stripJsoncToJson(resolveVariables(stripJsoncToJson(req.body?.content || ''), vars));
  } else if (bodyType === 'text' || bodyType === 'xml') {
    bodyContent = resolveVariables(req.body?.content || '', vars);
  } else if (bodyType === 'urlencoded') {
    if (Array.isArray(req.body?.urlencoded) && req.body.urlencoded.length > 0) {
      bodyContent = req.body.urlencoded
        .filter(item => item && item.enabled && typeof item.key === 'string' && item.key.trim() !== '')
        .map(item => {
          const k = encodeURIComponent(resolveVariables(item.key.trim(), vars));
          const v = encodeURIComponent(resolveVariables(item.value || '', vars));
          return `${k}=${v}`;
        })
        .join('&');
    } else if (req.body?.content) {
      bodyContent = resolveVariables(req.body.content, vars);
    }
  } else if (bodyType === 'formdata') {
    const formData = (req.body?.form_data || [])
      .filter(item => item && item.enabled && typeof item.key === 'string' && item.key.trim() !== '')
      .map(item => ({
        key: resolveVariables(item.key.trim(), vars),
        value: resolveVariables(item.value || '', vars),
        enabled: true
      }));
    return {
      method,
      url,
      headers,
      body: '',
      body_type: 'formdata',
      form_data: formData
    };
  }

  return {
    method,
    url,
    headers,
    body: bodyContent
  };
}
