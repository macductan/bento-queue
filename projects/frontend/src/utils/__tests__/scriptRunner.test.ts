import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { executeScript } from '../scriptRunner'
import { useResponseStore } from '@/stores/responseStore'
import { useRequestStore } from '@/stores/requestStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  SendRequest: vi.fn(),
  AbortRequest: vi.fn(),
  ListEnvironments: vi.fn(),
  SaveEnvironment: vi.fn(),
  DeleteEnvironment: vi.fn(),
}))

import * as AppBinding from '../../../wailsjs/go/main/App'

describe('scriptRunner', () => {
  it('supports ha.environment.get, set, unset and ha.variables alias (plus pm compatibility)', () => {
    const vars = new Map<string, string>([
      ['BASE_URL', 'https://api.example.com'],
      ['OLD_VAR', 'remove-me'],
    ])
    const res = executeScript(
      `
      const initial = ha.environment.get('BASE_URL');
      ha.environment.set('TOKEN', 'abc-123');
      ha.environment.set('PORT', 8080);
      ha.variables.set('EXTRA', initial + '/v1');
      ha.environment.unset('OLD_VAR');
      `,
      {
        variables: vars,
      }
    )

    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(res.envUpdates).toEqual({
      TOKEN: 'abc-123',
      PORT: '8080',
      EXTRA: 'https://api.example.com/v1',
      OLD_VAR: '',
    })
    expect(vars.has('OLD_VAR')).toBe(false)
    expect(vars.get('TOKEN')).toBe('abc-123')
  })

  it('supports ha.response.json(), text(), code, status, headers, responseTime in post-response context', () => {
    const vars = new Map<string, string>()
    const res = executeScript(
      `
      if (ha.response.code === 200) {
        const body = ha.response.json();
        ha.environment.set('ACCESS_TOKEN', body.data.access_token);
        ha.environment.set('RAW_LEN', String(ha.response.text().length));
        ha.environment.set('CT', ha.response.headers['Content-Type'][0]);
      }
      `,
      {
        variables: vars,
        response: {
          status_code: 200,
          status_text: '200 OK',
          headers: { 'Content-Type': ['application/json'] },
          body: '{"data":{"access_token":"jwt-xyz-999"}}',
          time_ms: 42,
          size_bytes: 39,
          timestamp: '2026-10-15T00:00:00Z',
          truncated: false,
          is_binary: false,
        },
      }
    )

    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(res.envUpdates).toEqual({
      ACCESS_TOKEN: 'jwt-xyz-999',
      RAW_LEN: '39',
      CT: 'application/json',
    })
  })

  it('captures console.log, warn, error output', () => {
    const res = executeScript(
      `
      console.log('hello', { a: 1 });
      console.warn('careful');
      `,
      { variables: new Map() }
    )

    expect(res.success).toBe(true)
    expect(res.error).toBeUndefined()
    expect(res.logs).toEqual(['hello {"a":1}', '[WARN] careful'])
  })

  it('captures runtime errors cleanly without throwing', () => {
    const res = executeScript(
      `
      const data = ha.response.json();
      `,
      {
        variables: new Map(),
        response: {
          status_code: 500,
          status_text: '500 Internal Server Error',
          headers: {},
          body: 'not valid json <<<',
          time_ms: 12,
          size_bytes: 18,
          timestamp: '2026-10-15T00:00:00Z',
          truncated: false,
          is_binary: false,
        },
      }
    )

    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
  })

  describe('responseStore.send() integration with pre-request and post-response scripts', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
      vi.clearAllMocks()
    })

    it('runs pre-request script before variable interpolation and post-response script after SendRequest', async () => {
      const envStore = useEnvironmentStore()
      const requestStore = useRequestStore()
      const responseStore = useResponseStore()

      envStore.activeEnvId = 'env-dev-1'
      envStore.environments = [
        {
          id: 'env-dev-1',
          name: 'Dev',
          variables: [{ key: 'HOST', value: 'api.test.local', enabled: true }],
          created_at: '2026-10-15',
          updated_at: '2026-10-15',
          convertValues: () => {},
        },
      ]
      vi.mocked(AppBinding.SaveEnvironment).mockResolvedValue({ success: true } as any)

      vi.mocked(AppBinding.SendRequest).mockImplementation((async (execReq: any) => {
        expect(execReq.url).toBe('https://api.test.local/items?nonce=pre-123')
        return {
          success: true,
          data: {
            status_code: 200,
            status_text: '200 OK',
            headers: { 'Content-Type': ['application/json'] },
            body: JSON.stringify({ token: 'post-jwt-777' }),
            size_bytes: 25,
            time_ms: 15,
            timestamp: '2026-10-15T00:00:00Z',
            truncated: false,
            is_binary: false,
          },
        }
      }) as any)

      requestStore.current = {
        id: 'req-script-1',
        name: 'Scripted Request',
        method: 'GET',
        url: 'https://{{HOST}}/items?nonce={{NONCE}}',
        headers: [],
        params: [],
        body: { type: 'none', content: '' },
        scripts: {
          pre_request: `ha.environment.set('NONCE', 'pre-123'); console.log('pre done');`,
          post_response: `const data = ha.response.json(); ha.environment.set('SAVED_TOKEN', data.token); console.log('post done');`,
        },
        created_at: '2026-10-15',
        updated_at: '2026-10-15',
      }

      await responseStore.send()

      expect(AppBinding.SendRequest).toHaveBeenCalledTimes(1)
      expect(envStore.variablesMap.get('NONCE')).toBe('pre-123')
      expect(envStore.variablesMap.get('SAVED_TOKEN')).toBe('post-jwt-777')
      expect(responseStore.scriptLogs).toEqual(['[Pre-request] pre done', '[Post-response] post done'])
      expect(responseStore.scriptError).toBeNull()
    })
  })
})
