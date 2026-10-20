import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { executeScript } from '../scriptRunner'
import { useResponseStore } from '@/stores/responseStore'
import { useRequestStore } from '@/stores/requestStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

import { useCollectionStore } from '@/stores/collectionStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  SendRequest: vi.fn(),
  AbortRequest: vi.fn(),
  ListEnvironments: vi.fn(),
  SaveEnvironment: vi.fn(),
  DeleteEnvironment: vi.fn(),
  LoadFolder: vi.fn(),
  UpdateFolder: vi.fn(),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
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

  it('inspects active environment via ha.environment.name, id, getName, getCurrent, getActive and pm.environment.name', () => {
    const vars = new Map<string, string>()
    const envs = [
      {
        id: 'env-prod-99',
        name: 'Production',
        variables: [{ key: 'HOST', value: 'api.prod.com', enabled: true }],
        created_at: '2026-10-15',
        updated_at: '2026-10-15',
        convertValues: () => {},
      },
    ]

    const res = executeScript(
      `
      ha.environment.set('ENV_NAME_PROP', ha.environment.name);
      ha.environment.set('ENV_ID_PROP', ha.environment.id);
      ha.environment.set('ENV_NAME_METHOD', ha.environment.getName());
      ha.environment.set('CURRENT_JSON', JSON.stringify(ha.environment.getCurrent()));
      ha.environment.set('ACTIVE_JSON', JSON.stringify(ha.environment.getActive()));
      ha.environment.set('PM_NAME_PROP', pm.environment.name);
      `,
      {
        variables: vars,
        activeEnvId: 'env-prod-99',
        environments: envs as any,
      }
    )

    expect(res.success).toBe(true)
    expect(res.envUpdates).toEqual({
      ENV_NAME_PROP: 'Production',
      ENV_ID_PROP: 'env-prod-99',
      ENV_NAME_METHOD: 'Production',
      CURRENT_JSON: JSON.stringify({ id: 'env-prod-99', name: 'Production' }),
      ACTIVE_JSON: JSON.stringify({ id: 'env-prod-99', name: 'Production' }),
      PM_NAME_PROP: 'Production',
    })

    // When no active environment is selected
    const resNoEnv = executeScript(
      `
      ha.environment.set('ENV_NAME', ha.environment.name);
      ha.environment.set('ENV_ID', ha.environment.id);
      ha.environment.set('HAS_CURRENT', String(ha.environment.getCurrent() === undefined));
      `,
      {
        variables: new Map(),
        activeEnvId: undefined,
        environments: envs as any,
      }
    )

    expect(resNoEnv.success).toBe(true)
    expect(resNoEnv.envUpdates).toEqual({
      ENV_NAME: '',
      ENV_ID: '',
      HAS_CURRENT: 'true',
    })
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
      expect(responseStore.executionLogs.map(l => l.phase)).toEqual(['pre-request', 'http', 'post-response'])
      expect(responseStore.executionLogs[1]?.detail?.statusCode).toBe(200)
      expect(responseStore.scriptError).toBeNull()
    })

    it('applies pre-request ha.request / pm.request mutations (query, pathParams, headers, body) to outgoing SendRequest', async () => {
      const requestStore = useRequestStore()
      const responseStore = useResponseStore()

      let capturedExecReq: any = null
      vi.mocked(AppBinding.SendRequest).mockImplementation((async (execReq: any) => {
        capturedExecReq = execReq
        return {
          success: true,
          data: {
            status_code: 201,
            status_text: '201 Created',
            headers: {},
            body: '{"ok":true}',
            size_bytes: 11,
            time_ms: 8,
            timestamp: '2026-10-16T00:00:00Z',
            truncated: false,
            is_binary: false,
          },
        }
      }) as any)

      requestStore.current = {
        id: 'req-mut-1',
        name: 'Mutated Request',
        method: 'POST',
        url: 'https://api.example.com/v1/:api_key/orders',
        headers: [],
        params: [{ key: 'page', value: '1', enabled: true }],
        path_params: [{ key: 'api_key', value: 'initial-key', enabled: true }],
        body: { type: 'json', content: '{}' },
        scripts: {
          pre_request: `
            pm.request.query.set('page', '5');
            ha.request.pathParams.set('api_key', 'dynamic-key-99');
            pm.request.headers.set('X-Request-Id', 'req-abc');
            ha.request.body.set({ updated: true });
          `,
          post_response: '',
        },
        created_at: '2026-10-16',
        updated_at: '2026-10-16',
      }

      await responseStore.send()

      expect(capturedExecReq).toBeTruthy()
      expect(capturedExecReq.url).toBe('https://api.example.com/v1/dynamic-key-99/orders?page=5')
      expect(capturedExecReq.headers).toContainEqual({ key: 'X-Request-Id', value: 'req-abc', enabled: true })
      expect(JSON.parse(capturedExecReq.body)).toEqual({ updated: true })
    })

    it('supports ha.folderAuth, ha.folderAuthEnv, and ha.collectionAuth in scripts', () => {
      const res = executeScript(
        `
        ha.folderAuth.setBearer('folder-global-token');
        ha.folderAuthEnv.setBearer('dev-token-999', 'UsersFolder', 'Dev');
        ha.folderAuth.env('Prod').setBasic('admin', 'prod-secret');
        ha.collectionAuth.setBearer('coll-token-111');
        ha.request.auth.setBearer('req-token-override');
        `,
        {
          variables: new Map(),
          request: {
            url: 'https://api.example.com',
            auth: { type: 'inherit' }
          }
        }
      )

      expect(res.success).toBe(true)
      expect(res.scopedAuthUpdates.folderGlobals['__nearest__']).toEqual({
        type: 'bearer',
        bearer: { token: 'folder-global-token' }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'UsersFolder',
        env: 'Dev',
        auth: { type: 'bearer', bearer: { token: 'dev-token-999' } }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: '__nearest__',
        env: 'Prod',
        auth: { type: 'basic', basic: { username: 'admin', password: 'prod-secret' } }
      })
      expect(res.scopedAuthUpdates.collectionGlobal).toEqual({
        type: 'bearer',
        bearer: { token: 'coll-token-111' }
      })
      expect(res.requestMutations.auth).toEqual({
        type: 'bearer',
        bearer: { token: 'req-token-override' }
      })
    })

    it('supports JSON auth configs with type + value, API key, inherit, and polymorphic folder targeting', () => {
      const res = executeScript(
        `
        // 1. Pass JSON with type + apiKey (shorthand: folder first, then json)
        ha.folderAuth.set('AuthFolder', {
          type: 'apiKey',
          key: 'X-API-KEY',
          value: 'secret-key-123',
          addTo: 'header'
        });

        // 2. Pass JSON with type + value for bearer
        ha.folderAuth.set('BearerFolder', {
          type: 'bearer',
          value: 'jwt-bearer-xyz'
        });

        // 3. Inherit on a specific folder
        ha.folderAuth.inherit('ChildFolder');

        // 4. None on a specific folder
        ha.folderAuth.none('NoAuthFolder');

        // 5. Shorthand setApiKey with folder as 3rd param
        ha.folderAuth.setApiKey('X-Direct-Key', 'direct-val', 'DirectFolder');

        // 6. Chain env with JSON
        ha.folderAuth.env('Dev', 'EnvFolder').set({
          type: 'apiKey',
          key: 'X-DEV-KEY',
          value: 'dev-secret'
        });

        // 7. Request auth with JSON
        ha.request.auth.set({
          type: 'apiKey',
          key: 'X-REQ-KEY',
          value: 'req-secret-key'
        });

        // 8. Basic auth with JSON
        ha.folderAuth.set('BasicFolder', {
          type: 'basic',
          username: 'admin',
          password: 'secret-password'
        });
        `,
        {
          variables: new Map(),
          request: {
            url: 'https://api.example.com',
            auth: { type: 'inherit' }
          }
        }
      )

      expect(res.success).toBe(true)
      expect(res.scopedAuthUpdates.folderGlobals['AuthFolder']).toEqual({
        type: 'apiKey',
        apiKey: { key: 'X-API-KEY', value: 'secret-key-123', addTo: 'header' }
      })
      expect(res.scopedAuthUpdates.folderGlobals['BearerFolder']).toEqual({
        type: 'bearer',
        bearer: { token: 'jwt-bearer-xyz' }
      })
      expect(res.scopedAuthUpdates.folderGlobals['BasicFolder']).toEqual({
        type: 'basic',
        basic: { username: 'admin', password: 'secret-password' }
      })
      expect(res.scopedAuthUpdates.folderGlobals['ChildFolder']).toEqual({
        type: 'inherit'
      })
      expect(res.scopedAuthUpdates.folderGlobals['NoAuthFolder']).toEqual({
        type: 'none'
      })
      expect(res.scopedAuthUpdates.folderGlobals['DirectFolder']).toEqual({
        type: 'apiKey',
        apiKey: { key: 'X-Direct-Key', value: 'direct-val', addTo: 'header' }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'EnvFolder',
        env: 'Dev',
        auth: {
          type: 'apiKey',
          apiKey: { key: 'X-DEV-KEY', value: 'dev-secret', addTo: 'header' }
        }
      })
      expect(res.requestMutations.auth).toEqual({
        type: 'apiKey',
        apiKey: { key: 'X-REQ-KEY', value: 'req-secret-key', addTo: 'header' }
      })
    })

    it('supports ha.env() and ha.environment.env() chaining with object batch sets', () => {
      const vars = new Map<string, string>()
      const envs = [
        {
          id: 'env-dev-1',
          name: 'Dev',
          variables: [{ key: 'HOST', value: 'api.dev.local', enabled: true }],
          created_at: '2026-10-15',
          updated_at: '2026-10-15',
          convertValues: () => {},
        },
      ]

      const res = executeScript(
        `
        // Gán qua ha.env('Dev') dạng object
        ha.env('Dev').set({
          TOKEN: 'dev-token-abc',
          PORT: 8080
        });

        // Lấy biến qua ha.env('Dev')
        const token = ha.env('Dev').get('TOKEN');
        ha.env('Dev').set('TOKEN_COPY', token);

        // Gán qua ha.environment.env('Dev')
        ha.environment.env('Dev').set('DIRECT_KEY', 'direct-val');

        // Gán vào active env (không truyền tên)
        ha.env().set({
          ACTIVE_KEY: 'active-value'
        });
        `,
        {
          variables: vars,
          activeEnvId: 'env-dev-1',
          environments: envs as any,
        }
      )

      expect(res.success).toBe(true)
      expect(res.scopedEnvUpdates.globalEnvs['Dev']).toEqual({
        TOKEN: 'dev-token-abc',
        PORT: '8080',
        TOKEN_COPY: 'dev-token-abc',
        DIRECT_KEY: 'direct-val',
      })
      expect(vars.get('ACTIVE_KEY')).toBe('active-value')
    })

    it('applies pre-request ha.request.auth to outgoing SendRequest', async () => {
      const requestStore = useRequestStore()
      const responseStore = useResponseStore()

      let capturedExecReq: any = null
      vi.mocked(AppBinding.SendRequest).mockImplementation((async (execReq: any) => {
        capturedExecReq = execReq
        return {
          success: true,
          data: {
            status_code: 200,
            status_text: '200 OK',
            headers: {},
            body: '{"auth_ok":true}',
            size_bytes: 16,
            time_ms: 10,
            timestamp: '2026-10-19T00:00:00Z',
            truncated: false,
            is_binary: false,
          },
        }
      }) as any)

      requestStore.current = {
        id: 'req-auth-test',
        name: 'Auth Script Request',
        method: 'GET',
        url: 'https://api.example.com/secure',
        headers: [],
        params: [],
        body: { type: 'none', content: '' },
        auth: { type: 'none' },
        scripts: {
          pre_request: `
            ha.request.auth.setBearer('dynamic-pre-bearer-token');
          `,
          post_response: '',
        },
        created_at: '2026-10-19',
        updated_at: '2026-10-19',
      }

      await responseStore.send()

      expect(capturedExecReq).toBeTruthy()
      expect(capturedExecReq.headers).toContainEqual({
        key: 'Authorization',
        value: 'Bearer dynamic-pre-bearer-token',
        enabled: true
      })
    })

    it('handles full lifecycle: get, set, inherit, none, unset, clear across folderAuth, folderAuthEnv, collectionAuth, and request.auth with deep cloning', () => {
      const pathFolders = [
        {
          id: 'f-1',
          name: 'Users Folder',
          auth: { type: 'bearer' as const, bearer: { token: 'initial-folder-token' } },
          auth_envs: {
            'env-dev': { type: 'basic' as const, basic: { username: 'dev-user', password: 'dev-password' } }
          }
        }
      ]
      const collAuth = { type: 'bearer' as const, bearer: { token: 'initial-coll-token' } }
      const collAuthEnvs = {
        'env-dev': { type: 'apiKey' as const, apiKey: { key: 'X-Coll', value: 'dev-key', addTo: 'header' as const } }
      }
      const environments = [{ id: 'env-dev', name: 'Development' }]

      const res = executeScript(
        `
        // 1. Initial reads
        const initFolder = ha.folderAuth.get();
        const initFolderEnv = ha.folderAuthEnv.get('Users Folder', 'Development');
        const initColl = ha.collectionAuth.get();
        const initCollEnv = ha.collectionAuth.env('Development').get();
        const initReq = ha.request.auth.get();

        // Verify deep cloning (mutating returned copy does not affect state)
        if (initFolder && initFolder.bearer) {
          initFolder.bearer.token = 'MUTATED_LEAK';
        }

        // 2. Chained and direct methods
        ha.folderAuth.none();
        ha.folderAuthEnv.inherit('Users Folder', 'Development');
        ha.collectionAuth.env('Development').setBearer('chained-coll-dev-token');
        ha.collectionAuth.clear();
        ha.request.auth.setBasic('req-user', 'req-pass');

        // 3. Reads after mutations in same script
        const readBackReq = ha.request.auth.get();
        const readBackCollDev = ha.collectionAuth.env('Development').get();
        const readBackFolder = ha.folderAuth.get();

        ha.environment.set('READ_BACK_REQ_USER', readBackReq.basic.username);
        ha.environment.set('READ_BACK_COLL_DEV_TOKEN', readBackCollDev.bearer.token);
        ha.environment.set('READ_BACK_FOLDER_TYPE', readBackFolder.type);
        `,
        {
          variables: new Map(),
          request: {
            url: 'https://api.example.com',
            auth: { type: 'inherit' }
          },
          pathFolders,
          collectionAuth: collAuth,
          collectionAuthEnvs: collAuthEnvs,
          environments,
          activeEnvId: 'env-dev'
        }
      )

      expect(res.success).toBe(true)
      // Verify initial folder auth was not mutated by the script's clone mutation
      expect(pathFolders[0].auth.bearer.token).toBe('initial-folder-token')
      // Verify read backs
      expect(res.envUpdates['READ_BACK_REQ_USER']).toBe('req-user')
      expect(res.envUpdates['READ_BACK_COLL_DEV_TOKEN']).toBe('chained-coll-dev-token')
      expect(res.envUpdates['READ_BACK_FOLDER_TYPE']).toBe('none')

      // Verify scoped updates output
      expect(res.scopedAuthUpdates.folderGlobals['__nearest__']).toEqual({ type: 'none' })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'Users Folder',
        env: 'Development',
        auth: { type: 'inherit' }
      })
      expect(res.scopedAuthUpdates.collectionGlobal).toEqual({ type: 'inherit' })
      expect(res.scopedAuthUpdates.collectionEnvs).toContainEqual({
        env: 'Development',
        auth: { type: 'bearer', bearer: { token: 'chained-coll-dev-token' } }
      })
      expect(res.requestMutations.auth).toEqual({
        type: 'basic',
        basic: { username: 'req-user', password: 'req-pass' }
      })
    })

    it('verifies pm.* compatibility aliases for all auth methods', () => {
      const res = executeScript(
        `
        pm.folderAuth.setBearer('pm-folder-token');
        pm.folderAuthEnv.setApiKey('X-Env-Key', 'env-secret', 'query', 'F1', 'Staging');
        pm.collectionAuth.setBasic('pm-admin', 'pm-pass');
        pm.request.auth.setBearer('pm-req-token');
        `,
        {
          variables: new Map(),
          request: { url: 'https://api.example.com', auth: { type: 'inherit' } }
        }
      )

      expect(res.success).toBe(true)
      expect(res.scopedAuthUpdates.folderGlobals['__nearest__']).toEqual({
        type: 'bearer',
        bearer: { token: 'pm-folder-token' }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'F1',
        env: 'Staging',
        auth: {
          type: 'apiKey',
          apiKey: { key: 'X-Env-Key', value: 'env-secret', addTo: 'query' }
        }
      })
      expect(res.scopedAuthUpdates.collectionGlobal).toEqual({
        type: 'basic',
        basic: { username: 'pm-admin', password: 'pm-pass' }
      })
      expect(res.requestMutations.auth).toEqual({
        type: 'bearer',
        bearer: { token: 'pm-req-token' }
      })
    })

    it('handles normalizeAuthConfig edge cases (non-string tokens, numeric passwords, apiKey query/header)', () => {
      const res = executeScript(
        `
        // 1. Bearer with numeric token
        ha.folderAuth.set({ type: 'bearer', token: 998877 });
        // 2. Bearer with bearer object containing numeric token
        ha.collectionAuth.set({ bearer: { token: 12345 } });
        // 3. Basic with numeric username/password
        ha.folderAuthEnv.set({ type: 'basic', username: 101, password: 404 }, 'FolderA', 'Dev');
        // 4. ApiKey with query addTo
        ha.request.auth.set({ type: 'apiKey', key: 'api_token', value: 8888, addTo: 'query' });
        // 5. Malformed/empty input defaults to inherit
        ha.folderAuth.env('Prod').set(null);
        `,
        {
          variables: new Map(),
          request: { url: 'https://api.example.com', auth: { type: 'inherit' } }
        }
      )

      expect(res.success).toBe(true)
      expect(res.scopedAuthUpdates.folderGlobals['__nearest__']).toEqual({
        type: 'bearer',
        bearer: { token: '998877' }
      })
      expect(res.scopedAuthUpdates.collectionGlobal).toEqual({
        type: 'bearer',
        bearer: { token: '12345' }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'FolderA',
        env: 'Dev',
        auth: {
          type: 'basic',
          basic: { username: '101', password: '404' }
        }
      })
      expect(res.requestMutations.auth).toEqual({
        type: 'apiKey',
        apiKey: { key: 'api_token', value: '8888', addTo: 'query' }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: '__nearest__',
        env: 'Prod',
        auth: { type: 'inherit' }
      })
    })

    it('applyScopedAuthUpdates persists folder auth to disk via LoadFolder/UpdateFolder and notifies UI', async () => {
      const envStore = useEnvironmentStore()
      const collectionStore = useCollectionStore()

      // Setup mock folder in collectionStore.tree
      const mockFolderNode: any = {
        id: 'f-target',
        name: 'Target Folder',
        type: 'folder',
        path: 'Target Folder',
        created_at: '2026-10-19',
        children: []
      }
      collectionStore.tree = [mockFolderNode]
      vi.mocked(AppBinding.GetCollectionTree).mockImplementation(async () => ({
        success: true,
        data: [mockFolderNode]
      } as any))

      envStore.environments = [
        { id: 'env-prod-id', name: 'Production', variables: [], is_active: false } as any
      ]
      envStore.activeEnvId = 'env-prod-id'

      vi.mocked(AppBinding.LoadFolder).mockResolvedValue({
        success: true,
        data: {
          id: 'f-target',
          name: 'Target Folder',
          variables: [],
          auth: { type: 'inherit' },
          auth_envs: {}
        }
      } as any)

      let updatedPayload: any = null
      vi.mocked(AppBinding.UpdateFolder).mockImplementation(async (payload: any) => {
        updatedPayload = payload
        mockFolderNode.auth = payload.auth
        mockFolderNode.auth_envs = payload.auth_envs
        return { success: true } as any
      })

      let customEventDetail: any = null
      const listener = (e: Event) => {
        customEventDetail = (e as CustomEvent).detail
      }
      window.addEventListener('hecto:folder-updated', listener)

      try {
        await envStore.applyScopedAuthUpdates(
          {
            folderGlobals: {
              'target folder': { type: 'bearer', bearer: { token: 'persisted-token' } }
            },
            folderEnvs: [
              {
                folder: 'f-target',
                env: 'Production',
                auth: { type: 'basic', basic: { username: 'admin', password: '123' } }
              }
            ]
          },
          []
        )

        expect(AppBinding.LoadFolder).toHaveBeenCalledWith('f-target')
        expect(AppBinding.UpdateFolder).toHaveBeenCalled()
        expect(updatedPayload).toBeTruthy()
        expect(updatedPayload.auth).toEqual({
          type: 'bearer',
          bearer: { token: 'persisted-token' }
        })
        expect(updatedPayload.auth_envs['env-prod-id']).toEqual({
          type: 'basic',
          basic: { username: 'admin', password: '123' }
        })

        // Tree node is updated in memory
        const treeNode = collectionStore.findNode(collectionStore.tree, 'f-target')
        expect(treeNode?.auth).toEqual({
          type: 'bearer',
          bearer: { token: 'persisted-token' }
        })

        // DOM event was dispatched
        expect(customEventDetail).toBeTruthy()
        expect(customEventDetail.id).toBe('f-target')
      } finally {
        window.removeEventListener('hecto:folder-updated', listener)
      }
    })

    it('verifies ha.folder and ha.env chaining with variables and auth', () => {
      const res = executeScript(
        `
        // 1. ha.folder with global variables
        ha.folder('Users').set({ folder_host: 'users.api.local', max_pool: '50' });
        ha.folder('Users').unset('max_pool');

        // 2. ha.folder with env variables
        ha.folder('Users').env('Dev').set({ folder_db: 'dev-db' });
        ha.folder('Users').env('Dev').set('single_key', 'single_val');

        // 3. ha.folder auth variants
        ha.folder('Users').auth.set({ type: 'bearer', value: 'user-bearer-token' });
        ha.folder('Orders').auth.set({ type: 'apiKey', key: 'X-Order-Key', value: 'ord-secret' });
        ha.folder('Admin').auth.set({ type: 'basic', username: 'adm', password: 'pwd' });
        ha.folder('Public').auth.none();
        ha.folder('Child').auth.inherit();

        // 4. ha.folder auth per environment
        ha.folder('Users').auth.env('Dev').set({ type: 'bearer', value: 'user-dev-bearer' });
        ha.folder('Users').env('Prod').auth.set({ type: 'bearer', value: 'user-prod-bearer' });

        // 5. ha.folder() defaults to nearest folder
        ha.folder().set({ nearest_var: 'near-val' });
        ha.folder().auth.set({ type: 'bearer', value: 'nearest-token' });
        ha.folder().auth.inherit();

        // 6. ha.env chaining with folder
        ha.env('Staging').folder('Billing').set('billing_rate', '9.99');
        ha.env('Staging').folder('Billing').auth.set({ type: 'bearer', value: 'stage-bill-token' });

        // 7. ha.env active environment inspection & batch set
        ha.env().set({ active_batch_1: 'val1', active_batch_2: 'val2' });
        `,
        {
          variables: new Map(),
          request: { url: 'https://api.example.com', auth: { type: 'inherit' } },
          environments: [{ id: 'env-dev-id', name: 'Dev', variables: [] }],
          activeEnvId: 'env-dev-id'
        }
      )

      expect(res.success).toBe(true)
      // Folder globals
      expect(res.scopedEnvUpdates.folderGlobals['Users']['folder_host']).toBe('users.api.local')
      expect(res.scopedEnvUpdates.folderGlobals['Users']['max_pool']).toBe('')

      // Folder envs
      expect(res.scopedEnvUpdates.folderEnvs).toContainEqual({
        folder: 'Users',
        env: 'Dev',
        key: 'folder_db',
        value: 'dev-db'
      })
      expect(res.scopedEnvUpdates.folderEnvs).toContainEqual({
        folder: 'Users',
        env: 'Dev',
        key: 'single_key',
        value: 'single_val'
      })

      // Folder auth
      expect(res.scopedAuthUpdates.folderGlobals['Users']).toEqual({
        type: 'bearer',
        bearer: { token: 'user-bearer-token' }
      })
      expect(res.scopedAuthUpdates.folderGlobals['Orders']).toEqual({
        type: 'apiKey',
        apiKey: { key: 'X-Order-Key', value: 'ord-secret', addTo: 'header' }
      })
      expect(res.scopedAuthUpdates.folderGlobals['Admin']).toEqual({
        type: 'basic',
        basic: { username: 'adm', password: 'pwd' }
      })
      expect(res.scopedAuthUpdates.folderGlobals['Public']).toEqual({ type: 'none' })
      expect(res.scopedAuthUpdates.folderGlobals['Child']).toEqual({ type: 'inherit' })

      // Folder auth envs
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'Users',
        env: 'Dev',
        auth: { type: 'bearer', bearer: { token: 'user-dev-bearer' } }
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'Users',
        env: 'Prod',
        auth: { type: 'bearer', bearer: { token: 'user-prod-bearer' } }
      })

      // Nearest folder
      expect(res.scopedEnvUpdates.folderGlobals['__nearest__']['nearest_var']).toBe('near-val')
      expect(res.scopedAuthUpdates.folderGlobals['__nearest__']).toEqual({ type: 'inherit' })

      // ha.env('Staging').folder('Billing')
      expect(res.scopedEnvUpdates.folderEnvs).toContainEqual({
        folder: 'Billing',
        env: 'Staging',
        key: 'billing_rate',
        value: '9.99'
      })
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'Billing',
        env: 'Staging',
        auth: { type: 'bearer', bearer: { token: 'stage-bill-token' } }
      })

      // ha.env().set batch
      expect(res.envUpdates['active_batch_1']).toBe('val1')
      expect(res.envUpdates['active_batch_2']).toBe('val2')
    })

    it('executes user chained script ha.folder(Backoffice).auth.env(ha.environment.name).set from response.json().data.token', () => {
      const res = executeScript(
        `
        ha.folder('Backoffice').auth.env(ha.environment.name).set({
          type: 'bearer',
          value: ha.response.json().data.token
        });
        ha.environment.folder('Backoffice').set('backoffice_flag', 'ready');
        `,
        {
          variables: new Map(),
          request: {
            id: 'req-bo',
            name: 'Login Backoffice',
            method: 'POST',
            url: 'https://api.example.com/login',
            headers: [],
            params: [],
            body: { type: 'none', content: '' },
            auth: { type: 'inherit' },
            scripts: { pre_request: '', post_response: '' },
            created_at: '',
            updated_at: ''
          },
          response: {
            status_code: 200,
            status_text: 'OK',
            time_ms: 45,
            size_bytes: 120,
            headers: {},
            body: JSON.stringify({ data: { token: 'jwt-backoffice-xyz-999' } }),
            timestamp: new Date().toISOString(),
            truncated: false,
            is_binary: false
          },
          environments: [
            { id: 'env-prod-1', name: 'Production', variables: [], is_active: true } as any
          ],
          activeEnvId: 'env-prod-1',
          pathFolders: [{ id: 'f-bo', name: 'Backoffice', children: [] } as any],
          allFolders: [{ id: 'f-bo', name: 'Backoffice', children: [] } as any]
        }
      )

      expect(res.success).toBe(true)
      expect(res.error).toBeUndefined()
      expect(res.scopedAuthUpdates.folderEnvs).toContainEqual({
        folder: 'Backoffice',
        env: 'Production',
        auth: {
          type: 'bearer',
          bearer: { token: 'jwt-backoffice-xyz-999' }
        }
      })
      expect(res.scopedEnvUpdates.folderGlobals['Backoffice']['backoffice_flag']).toBe('ready')
    })
  })
})

