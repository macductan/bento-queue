import type { Request, KVPair } from '../stores/requestStore';
import { resolveVariables } from './variables';

export interface ExecuteRequest {
  method: string;
  url: string;
  headers: KVPair[];
  body: string;
}

export function buildExecuteRequest(req: Request, vars: Map<string, string> = new Map()): ExecuteRequest {
  const method = req.method || 'GET';
  
  // Headers - only substitute values, not keys
  const headers = req.headers
    .filter(h => h.enabled && h.key.trim() !== '')
    .map(h => ({
      ...h,
      value: resolveVariables(h.value, vars)
    }));

  // Query Params - substitute both keys and values, filter empty keys AFTER resolution
  const params = req.params
    .filter(p => p.enabled)
    .map(p => ({
      ...p,
      key: resolveVariables(p.key, vars),
      value: resolveVariables(p.value, vars)
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
  if (req.body.type === 'json' || req.body.type === 'text') {
    bodyContent = resolveVariables(req.body.content, vars);
  }

  return {
    method,
    url,
    headers,
    body: bodyContent
  };
}
