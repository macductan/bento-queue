import type { Request, KVPair } from '../stores/requestStore';
import type { TreeNode, AuthConfig } from '../stores/collectionStore';
import { buildExecuteRequest } from './buildExecuteRequest';
import { getInheritedHeaders } from './headers';

export interface ParsedCurlResult {
  method: string;
  url: string;
  params: KVPair[];
  headers: KVPair[];
  body: {
    type: 'none' | 'json' | 'text' | 'xml' | 'urlencoded' | 'formdata';
    content: string;
    form_data?: KVPair[];
    urlencoded?: KVPair[];
  };
  auth?: AuthConfig;
}

/**
 * Checks whether a string looks like a cURL command pasted by a user.
 */
export function isCurlCommand(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^curl(?:\s|\\)/i.test(trimmed);
}

/**
 * Tokenizes a shell command string (supporting single quotes, double quotes,
 * ANSI-C $'...' quotes, backslash escapes, and multiline backslash continuations).
 */
export function tokenizeShellCommand(input: string): string[] {
  // Normalize line continuations: backslash followed by optional spaces/tabs and newline
  const normalized = input.replace(/\\[ \t]*\r?\n/g, ' ');
  const tokens: string[] = [];
  let current = '';
  let hasToken = false;
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    const ch = normalized[i];

    // Whitespace outside quotes separates tokens
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      i++;
      continue;
    }

    // ANSI-C quoting: $'...'
    if (ch === '$' && i + 1 < len && normalized[i + 1] === "'") {
      hasToken = true;
      i += 2;
      while (i < len && normalized[i] !== "'") {
        if (normalized[i] === '\\' && i + 1 < len) {
          i++;
          const esc = normalized[i];
          if (esc === 'n') current += '\n';
          else if (esc === 'r') current += '\r';
          else if (esc === 't') current += '\t';
          else if (esc === "'" || esc === '\\' || esc === '"') current += esc;
          else current += esc;
        } else {
          current += normalized[i];
        }
        i++;
      }
      if (i < len && normalized[i] === "'") i++;
      continue;
    }

    // Single quotes: preserve everything literally until closing '
    if (ch === "'") {
      hasToken = true;
      i++;
      while (i < len && normalized[i] !== "'") {
        current += normalized[i];
        i++;
      }
      if (i < len && normalized[i] === "'") i++;
      continue;
    }

    // Double quotes: allow backslash escapes for ", \, $, `, and newline
    if (ch === '"') {
      hasToken = true;
      i++;
      while (i < len && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < len) {
          const next = normalized[i + 1];
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            current += next;
            i += 2;
            continue;
          }
          if (next === 'n') {
            current += '\n';
            i += 2;
            continue;
          }
          if (next === 'r') {
            current += '\r';
            i += 2;
            continue;
          }
          if (next === 't') {
            current += '\t';
            i += 2;
            continue;
          }
        }
        current += normalized[i];
        i++;
      }
      if (i < len && normalized[i] === '"') i++;
      continue;
    }

    // Backslash escape outside quotes
    if (ch === '\\' && i + 1 < len) {
      hasToken = true;
      current += normalized[i + 1];
      i += 2;
      continue;
    }

    hasToken = true;
    current += ch;
    i++;
  }

  if (hasToken) {
    tokens.push(current);
  }

  return tokens;
}

function safeDecodeParam(val: string): string {
  try {
    return decodeURIComponent(val.replace(/\+/g, ' '));
  } catch {
    return val;
  }
}

function extractQueryParamsFromUrl(rawUrl: string): KVPair[] {
  const qIndex = rawUrl.indexOf('?');
  if (qIndex === -1) return [];
  const hashIndex = rawUrl.indexOf('#', qIndex);
  const queryString = hashIndex === -1 ? rawUrl.slice(qIndex + 1) : rawUrl.slice(qIndex + 1, hashIndex);
  if (!queryString) return [];

  const pairs: KVPair[] = [];
  for (const part of queryString.split('&')) {
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) {
      pairs.push({ key: safeDecodeParam(part), value: '', enabled: true });
    } else {
      const k = safeDecodeParam(part.slice(0, eqIdx));
      const v = safeDecodeParam(part.slice(eqIdx + 1));
      pairs.push({ key: k, value: v, enabled: true });
    }
  }
  return pairs;
}

const IGNORED_VALUE_FLAGS = new Set([
  '-o', '--output',
  '-D', '--dump-header',
  '-w', '--write-out',
  '-m', '--max-time',
  '--connect-timeout',
  '-x', '--proxy',
  '-E', '--cert',
  '--cacert',
  '--key'
]);

/**
 * Parses a cURL command string into structured Request fields:
 * method, url, params, headers, body, and optional Basic auth.
 */
export function parseCurlCommand(text: string): ParsedCurlResult {
  const tokens = tokenizeShellCommand(text.trim());
  if (tokens.length > 0 && /^curl$/i.test(tokens[0])) {
    tokens.shift();
  }

  let explicitMethod: string | null = null;
  let forceGet = false;
  let isHead = false;
  let url = '';
  const headers: KVPair[] = [];
  const dataParts: string[] = [];
  const formDataParts: KVPair[] = [];
  let usedDataUrlencode = false;
  let auth: AuthConfig | undefined;

  const parseFormPart = (raw: string) => {
    const eqIdx = raw.indexOf('=');
    if (eqIdx === -1) {
      formDataParts.push({ key: raw.trim(), value: '', enabled: true });
    } else {
      formDataParts.push({
        key: raw.slice(0, eqIdx).trim(),
        value: raw.slice(eqIdx + 1),
        enabled: true
      });
    }
  };

  const parseHeaderLine = (headerStr: string) => {
    const colonIdx = headerStr.indexOf(':');
    if (colonIdx !== -1) {
      const key = headerStr.slice(0, colonIdx).trim();
      const value = headerStr.slice(colonIdx + 1).trim();
      if (key) {
        headers.push({ key, value, enabled: true });
      }
    } else if (headerStr.endsWith(';')) {
      const key = headerStr.slice(0, -1).trim();
      if (key) {
        headers.push({ key, value: '', enabled: true });
      }
    }
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      if (i + 1 < tokens.length) {
        explicitMethod = tokens[++i].trim().toUpperCase();
      }
      i++;
      continue;
    }
    if (token.startsWith('-X') && token.length > 2) {
      explicitMethod = token.slice(2).trim().toUpperCase();
      i++;
      continue;
    }
    if (token.startsWith('--request=')) {
      explicitMethod = token.slice('--request='.length).trim().toUpperCase();
      i++;
      continue;
    }

    if (token === '-H' || token === '--header') {
      if (i + 1 < tokens.length) {
        parseHeaderLine(tokens[++i]);
      }
      i++;
      continue;
    }
    if (token.startsWith('-H') && token.length > 2) {
      parseHeaderLine(token.slice(2));
      i++;
      continue;
    }
    if (token.startsWith('--header=')) {
      parseHeaderLine(token.slice('--header='.length));
      i++;
      continue;
    }

    if (token === '-F' || token === '--form' || token === '--form-string') {
      if (i + 1 < tokens.length) {
        parseFormPart(tokens[++i]);
      }
      i++;
      continue;
    }
    if (token.startsWith('-F') && token.length > 2 && !token.startsWith('--')) {
      parseFormPart(token.slice(2));
      i++;
      continue;
    }
    const formPrefixMatch = token.match(/^--(form|form-string)=(.*)$/s);
    if (formPrefixMatch) {
      parseFormPart(formPrefixMatch[2]);
      i++;
      continue;
    }

    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii' ||
      token === '--data-urlencode'
    ) {
      if (token === '--data-urlencode') {
        usedDataUrlencode = true;
      }
      if (i + 1 < tokens.length) {
        dataParts.push(tokens[++i]);
      }
      i++;
      continue;
    }
    if (token.startsWith('-d') && token.length > 2 && !token.startsWith('--')) {
      dataParts.push(token.slice(2));
      i++;
      continue;
    }
    const dataPrefixMatch = token.match(/^--(data|data-raw|data-binary|data-ascii|data-urlencode)=(.*)$/s);
    if (dataPrefixMatch) {
      if (dataPrefixMatch[1] === 'data-urlencode') {
        usedDataUrlencode = true;
      }
      dataParts.push(dataPrefixMatch[2]);
      i++;
      continue;
    }

    if (token === '-u' || token === '--user') {
      if (i + 1 < tokens.length) {
        const creds = tokens[++i];
        const colonIdx = creds.indexOf(':');
        const username = colonIdx === -1 ? creds : creds.slice(0, colonIdx);
        const password = colonIdx === -1 ? '' : creds.slice(colonIdx + 1);
        auth = {
          type: 'basic',
          basic: { username, password }
        };
      }
      i++;
      continue;
    }
    if (token.startsWith('-u') && token.length > 2 && !token.startsWith('--')) {
      const creds = token.slice(2);
      const colonIdx = creds.indexOf(':');
      const username = colonIdx === -1 ? creds : creds.slice(0, colonIdx);
      const password = colonIdx === -1 ? '' : creds.slice(colonIdx + 1);
      auth = {
        type: 'basic',
        basic: { username, password }
      };
      i++;
      continue;
    }
    if (token.startsWith('--user=')) {
      const creds = token.slice('--user='.length);
      const colonIdx = creds.indexOf(':');
      const username = colonIdx === -1 ? creds : creds.slice(0, colonIdx);
      const password = colonIdx === -1 ? '' : creds.slice(colonIdx + 1);
      auth = {
        type: 'basic',
        basic: { username, password }
      };
      i++;
      continue;
    }

    if (token === '-A' || token === '--user-agent') {
      if (i + 1 < tokens.length) {
        headers.push({ key: 'User-Agent', value: tokens[++i], enabled: true });
      }
      i++;
      continue;
    }
    if (token === '-e' || token === '--referer') {
      if (i + 1 < tokens.length) {
        headers.push({ key: 'Referer', value: tokens[++i], enabled: true });
      }
      i++;
      continue;
    }
    if (token === '-b' || token === '--cookie') {
      if (i + 1 < tokens.length) {
        headers.push({ key: 'Cookie', value: tokens[++i], enabled: true });
      }
      i++;
      continue;
    }

    if (token === '--url') {
      if (i + 1 < tokens.length) {
        url = tokens[++i].trim();
      }
      i++;
      continue;
    }
    if (token.startsWith('--url=')) {
      url = token.slice('--url='.length).trim();
      i++;
      continue;
    }

    if (token === '-G' || token === '--get') {
      forceGet = true;
      i++;
      continue;
    }

    if (token === '-I' || token === '--head') {
      isHead = true;
      i++;
      continue;
    }

    if (IGNORED_VALUE_FLAGS.has(token)) {
      i += 2;
      continue;
    }

    if (token.startsWith('-')) {
      i++;
      continue;
    }

    // Positional argument: treat as URL if not already set (or if it starts with http/https/{{)
    if (!url || /^https?:\/\//i.test(token) || token.startsWith('{{')) {
      url = token.trim();
    }
    i++;
  }

  const hasData = dataParts.length > 0 || formDataParts.length > 0;
  const bodyContent = dataParts.join('&');

  // If -G / --get is used with -d, append dataParts to URL query string if no body is intended
  if (forceGet && dataParts.length > 0 && url) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}${bodyContent}`;
  }

  let method = 'GET';
  if (explicitMethod) {
    method = explicitMethod;
  } else if (forceGet) {
    method = 'GET';
  } else if (isHead) {
    method = 'HEAD';
  } else if (hasData) {
    method = 'POST';
  }

  let bodyType: 'none' | 'json' | 'text' | 'xml' | 'urlencoded' | 'formdata' = 'none';
  let finalBodyContent = '';
  let urlencodedPairs: KVPair[] | undefined;

  if (formDataParts.length > 0 && !forceGet) {
    bodyType = 'formdata';
  } else if (dataParts.length > 0 && !forceGet) {
    finalBodyContent = bodyContent;
    const contentTypeHeader = headers.find(h => h.key.toLowerCase() === 'content-type');
    const ctVal = contentTypeHeader ? contentTypeHeader.value.toLowerCase() : '';
    const isContentTypeJson = ctVal.includes('json');
    const isContentTypeXml = ctVal.includes('xml');
    const isContentTypeUrlencoded = ctVal.includes('x-www-form-urlencoded');
    const isContentTypeText = ctVal.includes('text/plain');
    const trimmedBody = finalBodyContent.trim();
    let looksLikeJson = false;
    if (
      (trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) ||
      (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmedBody);
        looksLikeJson = true;
      } catch {
        // Also allow JSON templates containing {{var}} placeholders
        looksLikeJson = /\{\{[^{}]+\}\}/.test(trimmedBody);
      }
    }
    const looksLikeXml = /^<[a-zA-Z?_!][\s\S]*>$/.test(trimmedBody);

    if (isContentTypeUrlencoded || usedDataUrlencode) {
      bodyType = 'urlencoded';
      urlencodedPairs = finalBodyContent
        .split('&')
        .filter(Boolean)
        .map(part => {
          const eqIdx = part.indexOf('=');
          if (eqIdx === -1) {
            return { key: safeDecodeParam(part), value: '', enabled: true };
          }
          return {
            key: safeDecodeParam(part.slice(0, eqIdx)),
            value: safeDecodeParam(part.slice(eqIdx + 1)),
            enabled: true
          };
        });
    } else if (isContentTypeJson) {
      bodyType = 'json';
    } else if (isContentTypeXml) {
      bodyType = 'xml';
    } else if (isContentTypeText) {
      bodyType = 'text';
    } else if (looksLikeJson) {
      bodyType = 'json';
    } else if (looksLikeXml) {
      bodyType = 'xml';
    } else {
      bodyType = 'text';
    }
  }

  const params = extractQueryParamsFromUrl(url);

  return {
    method,
    url,
    params,
    headers,
    body: {
      type: bodyType,
      content: finalBodyContent,
      ...(formDataParts.length > 0 ? { form_data: formDataParts } : {}),
      ...(urlencodedPairs ? { urlencoded: urlencodedPairs } : {})
    },
    ...(auth ? { auth } : {})
  };
}

/**
 * Escapes a string for safe use in POSIX shell (Bash, Zsh) using single quotes.
 * Every character inside single quotes is preserved verbatim, and single quotes
 * are escaped via '\''.
 */
export function escapeShell(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export type EnvInput = 
  | Map<string, string> 
  | { variables?: Array<{ key: string; value: string; enabled?: boolean }> } 
  | Record<string, string>;

export interface GenerateCurlOptions {
  environment?: EnvInput;
  vars?: Map<string, string>;
  inheritedHeaders?: KVPair[];
  pathNodes?: TreeNode[];
  multiline?: boolean;
  dataFlag?: '--data-raw' | '--data' | '-d';
  activeEnvId?: string | null;
  collection?: any;
}

function extractVarsFromEnv(env: EnvInput | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!env) return map;

  if (env instanceof Map) {
    for (const [k, v] of env.entries()) {
      if (k && k.trim()) {
        map.set(k.trim(), v || '');
      }
    }
  } else if ('variables' in env && Array.isArray(env.variables)) {
    for (const v of env.variables) {
      if (v && v.enabled !== false && v.key?.trim()) {
        map.set(v.key.trim(), v.value || '');
      }
    }
  } else if (typeof env === 'object') {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string' && k.trim()) {
        map.set(k.trim(), v);
      }
    }
  }
  return map;
}

/**
 * Generates a valid POSIX/Bash cURL command from a Request and environment context.
 */
export function generateCurlCommand(
  req: Request,
  envOrOptions?: EnvInput | GenerateCurlOptions,
  extraInheritedHeaders?: KVPair[],
  extraPathNodes?: TreeNode[]
): string {
  let vars = new Map<string, string>();
  let hasExplicitVars = false;
  let inheritedHeaders: KVPair[] = extraInheritedHeaders ? [...extraInheritedHeaders] : [];
  let pathNodes: TreeNode[] = extraPathNodes ? [...extraPathNodes] : [];
  let multiline = false;
  let dataFlag: '--data-raw' | '--data' | '-d' = '--data-raw';
  let activeEnvId: string | null | undefined;
  let collection: any;

  if (envOrOptions) {
    if (envOrOptions instanceof Map) {
      vars = extractVarsFromEnv(envOrOptions);
    } else if (
      'environment' in envOrOptions ||
      'vars' in envOrOptions ||
      'inheritedHeaders' in envOrOptions ||
      'pathNodes' in envOrOptions ||
      'multiline' in envOrOptions ||
      'dataFlag' in envOrOptions ||
      'activeEnvId' in envOrOptions ||
      'collection' in envOrOptions
    ) {
      const opts = envOrOptions as GenerateCurlOptions;
      if (opts.vars) {
        vars = new Map(opts.vars);
        hasExplicitVars = true;
      } else if (opts.environment) {
        vars = extractVarsFromEnv(opts.environment);
      }
      if (opts.inheritedHeaders) inheritedHeaders = [...opts.inheritedHeaders];
      if (opts.pathNodes) pathNodes = [...opts.pathNodes];
      if (opts.multiline !== undefined) multiline = opts.multiline;
      if (opts.dataFlag !== undefined) dataFlag = opts.dataFlag;
      if (opts.activeEnvId !== undefined) activeEnvId = opts.activeEnvId;
      if (opts.collection !== undefined) collection = opts.collection;
    } else if ('variables' in envOrOptions && Array.isArray((envOrOptions as any).variables)) {
      vars = extractVarsFromEnv(envOrOptions as any);
    } else if (typeof envOrOptions === 'object') {
      vars = extractVarsFromEnv(envOrOptions as Record<string, string>);
    }
  }

  // If pathNodes is provided but inheritedHeaders was not explicitly supplied, derive them
  if (pathNodes.length > 0 && inheritedHeaders.length === 0) {
    inheritedHeaders = getInheritedHeaders(pathNodes);
  }

  // Merge folder variables from pathNodes only when pre-resolved vars were not explicitly supplied
  if (!hasExplicitVars) {
    for (const node of pathNodes) {
      if (node.variables) {
        for (const v of node.variables) {
          if (v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
            vars.set(v.key.trim(), v.value || '');
          }
        }
      }
    }
  }

  const execReq = buildExecuteRequest(req, vars, inheritedHeaders, pathNodes, {
    activeEnvId,
    requestAuthEnvs: req.auth_envs,
    collection
  });

  const parts: string[] = ['curl'];

  // HTTP Method
  const method = (execReq.method || 'GET').trim().toUpperCase();
  parts.push(`-X ${method}`);

  // URL (enclosed in single quotes and escaped)
  parts.push(escapeShell(execReq.url));

  // Headers (enclosed in single quotes and escaped)
  for (const h of execReq.headers) {
    if (h.enabled && h.key && h.key.trim() !== '') {
      // Omit unboundaried multipart/form-data header when generating curl -F
      if (
        req.body?.type === 'formdata' &&
        h.key.trim().toLowerCase() === 'content-type' &&
        h.value.trim().toLowerCase() === 'multipart/form-data'
      ) {
        continue;
      }
      parts.push(`-H ${escapeShell(`${h.key.trim()}: ${h.value || ''}`)}`);
    }
  }

  // Body payload
  if (req.body?.type === 'formdata' && execReq.form_data && execReq.form_data.length > 0) {
    for (const item of execReq.form_data) {
      if (item.enabled && item.key && item.key.trim() !== '') {
        parts.push(`-F ${escapeShell(`${item.key.trim()}=${item.value || ''}`)}`);
      }
    }
  } else if (
    execReq.body &&
    (req.body?.type === 'json' ||
      req.body?.type === 'text' ||
      req.body?.type === 'xml' ||
      req.body?.type === 'urlencoded')
  ) {
    parts.push(`${dataFlag} ${escapeShell(execReq.body)}`);
  }

  if (multiline) {
    if (parts.length <= 2) {
      return parts.join(' ');
    }
    const firstLine = `${parts[0]} ${parts[1]}`;
    const rest = parts.slice(2);
    return `${firstLine} \\\n  ${rest.join(' \\\n  ')}`;
  }

  return parts.join(' ');
}
