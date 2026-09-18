export function flattenHeaders(headers: Record<string, string[]> | null | undefined): { key: string; value: string }[] {
  if (!headers) return [];
  const result: { key: string; value: string }[] = [];
  
  const keys = Object.keys(headers).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  
  for (const key of keys) {
    const values = headers[key] || [];
    for (const value of values) {
      result.push({ key, value });
    }
  }
  
  return result;
}
