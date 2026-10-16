import { findPathParamTokens } from './urlParams';

export interface VariableSegment {
  type: 'text' | 'resolved' | 'missing';
  value: string;
  original?: string;
  key?: string;
  kind?: 'template' | 'path';
}

export interface ParseVariablesOptions {
  enablePathParams?: boolean;
  pathParams?: Array<{ key: string; value: string; enabled?: boolean }> | Map<string, string> | null;
}

const VARIABLE_PATTERN_STR = '\\{\\{([^}]+)\\}\\}';

export function resolveVariables(input: string, vars: Map<string, string>): string {
  if (!input) return input;
  
  const pattern = new RegExp(VARIABLE_PATTERN_STR, 'g');
  return input.replace(pattern, (match, key) => {
    const trimmedKey = key.trim();
    if (vars.has(trimmedKey)) {
      return vars.get(trimmedKey)!;
    }
    return match; // missing variables are kept as is
  });
}

function resolvePathParamValue(
  key: string,
  vars: Map<string, string>,
  pathParams?: Array<{ key: string; value: string; enabled?: boolean }> | Map<string, string> | null
): string | undefined {
  let explicitlyDisabled = false;
  if (pathParams) {
    if (pathParams instanceof Map) {
      if (pathParams.has(key)) {
        const val = pathParams.get(key) ?? '';
        if (val !== '') {
          return resolveVariables(val, vars);
        }
      }
    } else if (Array.isArray(pathParams)) {
      for (const item of pathParams) {
        if (item && typeof item.key === 'string' && item.key.trim() === key) {
          if (item.enabled === false) {
            explicitlyDisabled = true;
          } else if (item.value && item.value !== '') {
            return resolveVariables(item.value, vars);
          }
        }
      }
    }
  }
  if (!explicitlyDisabled && vars.has(key)) {
    const envVal = vars.get(key)!;
    if (envVal !== '') {
      return envVal;
    }
  }
  return undefined;
}

export function parseVariables(
  input: string,
  vars: Map<string, string>,
  options?: ParseVariablesOptions
): VariableSegment[] {
  if (!input) return [];

  const tokens: Array<{
    start: number;
    end: number;
    key: string;
    original: string;
    kind: 'template' | 'path';
  }> = [];

  const pattern = new RegExp(VARIABLE_PATTERN_STR, 'g');
  let match;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      key: match[1].trim(),
      original: match[0],
      kind: 'template'
    });
  }

  if (options?.enablePathParams) {
    const pathTokens = findPathParamTokens(input);
    for (const pt of pathTokens) {
      const overlaps = tokens.some(t => pt.startIndex < t.end && pt.endIndex > t.start);
      if (!overlaps) {
        tokens.push({
          start: pt.startIndex,
          end: pt.endIndex,
          key: pt.name,
          original: pt.raw,
          kind: 'path'
        });
      }
    }
    tokens.sort((a, b) => a.start - b.start);
  }

  const segments: VariableSegment[] = [];
  let lastIndex = 0;

  for (const tok of tokens) {
    const textBefore = input.substring(lastIndex, tok.start);
    if (textBefore) {
      segments.push({ type: 'text', value: textBefore });
    }

    if (tok.kind === 'path') {
      const resolvedVal = resolvePathParamValue(tok.key, vars, options?.pathParams);
      if (resolvedVal !== undefined) {
        segments.push({
          type: 'resolved',
          value: resolvedVal,
          original: tok.original,
          key: tok.key,
          kind: 'path'
        });
      } else {
        segments.push({
          type: 'missing',
          value: tok.original,
          key: tok.key,
          kind: 'path'
        });
      }
    } else {
      if (vars.has(tok.key)) {
        segments.push({
          type: 'resolved',
          value: vars.get(tok.key)!,
          original: tok.original,
          key: tok.key
        });
      } else {
        segments.push({
          type: 'missing',
          value: tok.original,
          key: tok.key
        });
      }
    }

    lastIndex = tok.end;
  }

  const textAfter = input.substring(lastIndex);
  if (textAfter) {
    segments.push({ type: 'text', value: textAfter });
  }

  return segments;
}
