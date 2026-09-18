export interface VariableSegment {
  type: 'text' | 'resolved' | 'missing';
  value: string;
  original?: string;
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

export function parseVariables(input: string, vars: Map<string, string>): VariableSegment[] {
  if (!input) return [];

  const segments: VariableSegment[] = [];
  let lastIndex = 0;
  
  const pattern = new RegExp(VARIABLE_PATTERN_STR, 'g');
  let match;

  while ((match = pattern.exec(input)) !== null) {
    const textBefore = input.substring(lastIndex, match.index);
    if (textBefore) {
      segments.push({ type: 'text', value: textBefore });
    }

    const trimmedKey = match[1].trim();
    if (vars.has(trimmedKey)) {
      segments.push({
        type: 'resolved',
        value: vars.get(trimmedKey)!,
        original: match[0]
      });
    } else {
      segments.push({
        type: 'missing',
        value: match[0]
      });
    }

    lastIndex = match.index + match[0].length;
  }

  const textAfter = input.substring(lastIndex);
  if (textAfter) {
    segments.push({ type: 'text', value: textAfter });
  }

  return segments;
}
