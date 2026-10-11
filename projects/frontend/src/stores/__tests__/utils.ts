export function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    id: '1',
    name: 'test',
    method: 'POST',
    url: 'https://example.com',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    created_at: '',
    updated_at: '',
    ...overrides
  }
}
