import type { Request, KVPair } from '../stores/requestStore';
import type { TreeNode } from '../stores/collectionStore';
import { buildExecuteRequest } from './buildExecuteRequest';
import { getInheritedHeaders } from './headers';

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
  let inheritedHeaders: KVPair[] = extraInheritedHeaders ? [...extraInheritedHeaders] : [];
  let pathNodes: TreeNode[] = extraPathNodes ? [...extraPathNodes] : [];
  let multiline = false;
  let dataFlag: '--data-raw' | '--data' | '-d' = '--data-raw';

  if (envOrOptions) {
    if (envOrOptions instanceof Map) {
      vars = extractVarsFromEnv(envOrOptions);
    } else if (
      'environment' in envOrOptions ||
      'vars' in envOrOptions ||
      'inheritedHeaders' in envOrOptions ||
      'pathNodes' in envOrOptions ||
      'multiline' in envOrOptions ||
      'dataFlag' in envOrOptions
    ) {
      const opts = envOrOptions as GenerateCurlOptions;
      if (opts.vars) {
        vars = new Map(opts.vars);
      } else if (opts.environment) {
        vars = extractVarsFromEnv(opts.environment);
      }
      if (opts.inheritedHeaders) inheritedHeaders = [...opts.inheritedHeaders];
      if (opts.pathNodes) pathNodes = [...opts.pathNodes];
      if (opts.multiline !== undefined) multiline = opts.multiline;
      if (opts.dataFlag !== undefined) dataFlag = opts.dataFlag;
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

  // Merge folder variables from pathNodes if present
  for (const node of pathNodes) {
    if (node.variables) {
      for (const v of node.variables) {
        if (v.enabled && typeof v.key === 'string' && v.key.trim() !== '') {
          vars.set(v.key.trim(), v.value || '');
        }
      }
    }
  }

  const execReq = buildExecuteRequest(req, vars, inheritedHeaders, pathNodes);

  const parts: string[] = ['curl'];

  // HTTP Method
  const method = (execReq.method || 'GET').trim().toUpperCase();
  parts.push(`-X ${method}`);

  // URL (enclosed in single quotes and escaped)
  parts.push(escapeShell(execReq.url));

  // Headers (enclosed in single quotes and escaped)
  for (const h of execReq.headers) {
    if (h.enabled && h.key && h.key.trim() !== '') {
      parts.push(`-H ${escapeShell(`${h.key.trim()}: ${h.value || ''}`)}`);
    }
  }

  // Body payload (for json or text body with content)
  if (execReq.body && (req.body?.type === 'json' || req.body?.type === 'text')) {
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
