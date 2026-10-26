import { describe, it, expect } from 'vitest'
import {
  prepareHeadlessExecution,
  runHeadlessPostResponse,
  reconcileUrlAndParams,
  resolveHeaders,
  resolveAuth,
  stripJsonComments,
  parseCurlCommand
} from '../headless-engine'
import type { Request } from '../../stores/requestStore'
import type { TreeNode } from '../../stores/collectionStore'

describe('headless-engine', () => {
  it('reconciles URL and params bidirectionally and resolves 4-tier variables + CLI overrides', () => {
    const req: Request = {
      id: 'req-1',
      name: 'Get User',
      method: 'GET',
      url: 'https://{{host}}/users/:userId/items?page=1',
      headers: [{ key: 'X-Custom', value: '{{custom_val}}', enabled: true }],
      params: [{ key: 'limit', value: '{{limit_val}}', enabled: true }],
      path_params: [{ key: 'userId', value: '{{user_id}}', enabled: true }],
      body: { type: 'none', content: '' },
      auth: { type: 'inherit' },
      created_at: '2026-10-23T00:00:00Z',
      updated_at: '2026-10-23T00:00:00Z'
    }

    const folder1: TreeNode = {
      id: 'f-root',
      name: 'Users',
      type: 'folder',
      path: '/tmp/Users',
      created_at: '2026-10-23T00:00:00Z',
      variables: [
        { key: 'user_id', value: 'folder-user', enabled: true },
        { key: 'custom_val', value: 'from-folder-global', enabled: true }
      ],
      folder_envs: {
        'env-stg': [{ key: 'user_id', value: 'stg-folder-user', enabled: true }]
      },
      headers: [{ key: 'X-Folder-Header', value: 'folder-{{host}}', enabled: true }],
      auth: { type: 'bearer', bearer: { token: '{{auth_token}}' } }
    }

    const out = prepareHeadlessExecution({
      request: req,
      collection: {
        id: 'default',
        name: 'Default',
        variables: [
          { key: 'host', value: 'coll.example.com', enabled: true },
          { key: 'limit_val', value: '10', enabled: true },
          { key: 'auth_token', value: 'coll-secret', enabled: true }
        ],
        active_env_id: 'env-stg'
      },
      environments: [
        {
          id: 'env-stg',
          name: 'Staging',
          variables: [{ key: 'host', value: 'stg.example.com', enabled: true }]
        }
      ],
      activeEnvId: 'env-stg',
      pathFolders: [folder1],
      allFolders: [folder1],
      cliVarOverrides: {
        limit_val: '50'
      }
    })

    expect(out.executeRequest.url).toBe('https://stg.example.com/users/stg-folder-user/items?page=1&limit=50')
    expect(out.executeRequest.headers).toEqual([
      { key: 'X-Folder-Header', value: 'folder-stg.example.com', enabled: true },
      { key: 'Authorization', value: 'Bearer coll-secret', enabled: true },
      { key: 'X-Custom', value: 'from-folder-global', enabled: true }
    ])
  })

  it('applies pre-request script variable, scoped variable, scoped auth, and request mutations immediately in-memory', () => {
    const req: Request = {
      id: 'req-2',
      name: 'Create Order',
      method: 'POST',
      url: 'https://{{host}}/orders/:orderId',
      headers: [],
      params: [],
      path_params: [],
      body: {
        type: 'json',
        content: '{\n  // JSONC comment\n  "org": "{{org}}",\n  "envToken": "{{env_tok}}",\n}'
      },
      auth: { type: 'inherit' },
      scripts: {
        pre_request: `
          ha.variables.set("env_tok", "tok-from-pre");
          ha.collectionVariables.set("host", "api.mutated.io");
          ha.folderVariables.set("org", "acme-corp");
          ha.folderEnvVariables.set("orderId", "ord-999");
          ha.collectionAuth.setBearer("pre-bearer-jwt");
          ha.request.headers.set("X-From-Pre", "yes");
          console.log("pre-request executed");
        `,
        post_response: ''
      },
      created_at: '2026-10-23T00:00:00Z',
      updated_at: '2026-10-23T00:00:00Z'
    }

    const folder: TreeNode = {
      id: 'f-orders',
      name: 'Orders',
      type: 'folder',
      path: '/tmp/Orders',
      created_at: '2026-10-23T00:00:00Z',
      variables: [],
      auth: { type: 'inherit' }
    }

    const out = prepareHeadlessExecution({
      request: req,
      collection: {
        id: 'default',
        name: 'Default',
        variables: [{ key: 'host', value: 'initial.io', enabled: true }],
        auth: { type: 'none' }
      },
      environments: [
        {
          id: 'env-1',
          name: 'Dev',
          variables: []
        }
      ],
      activeEnvId: 'env-1',
      pathFolders: [folder],
      allFolders: [folder]
    })

    expect(out.preScriptResult?.success).toBe(true)
    expect(out.executeRequest.url).toBe('https://api.mutated.io/orders/ord-999')
    expect(JSON.parse(out.executeRequest.body)).toEqual({
      org: 'acme-corp',
      envToken: 'tok-from-pre'
    })
    expect(out.executeRequest.headers).toContainEqual({
      key: 'Authorization',
      value: 'Bearer pre-bearer-jwt',
      enabled: true
    })
    expect(out.executeRequest.headers).toContainEqual({
      key: 'X-From-Pre',
      value: 'yes',
      enabled: true
    })
  })

  it('executes post-response scripts with mutated state from pre-request', () => {
    const req: Request = {
      id: 'req-3',
      name: 'Login',
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      scripts: {
        pre_request: 'ha.folderVariables.set("pre_flag", "ready");',
        post_response: `
          const data = ha.response.json();
          ha.test("status is 200", () => {
            if (ha.response.code !== 200) throw new Error("bad status");
          });
          ha.test("saw pre_flag", () => {
            if (ha.folderVariables.get("pre_flag") !== "ready") throw new Error("missing pre_flag");
          });
          ha.test("failing assertion", () => {
            throw new Error("intentional failure");
          });
          ha.test("runs after failure", () => {
            if (data.token !== "secret-jwt") throw new Error("bad token");
          });
          ha.folderVariables.set("jwt", data.token);
        `
      },
      created_at: '2026-10-23T00:00:00Z',
      updated_at: '2026-10-23T00:00:00Z'
    }

    const folder: TreeNode = {
      id: 'f-auth',
      name: 'AuthFlow',
      type: 'folder',
      path: '/tmp/AuthFlow',
      created_at: '2026-10-23T00:00:00Z',
      variables: []
    }

    const preOut = prepareHeadlessExecution({
      request: req,
      collection: { id: 'default', name: 'Default', variables: [] },
      environments: [],
      activeEnvId: null,
      pathFolders: [folder],
      allFolders: [folder]
    })

    const postRes = runHeadlessPostResponse({
      effectiveRequest: preOut.effectiveRequest,
      response: {
        status_code: 200,
        status_text: '200 OK',
        headers: { 'Content-Type': ['application/json'] },
        body: JSON.stringify({ token: 'secret-jwt' }),
        time_ms: 15,
        size_bytes: 23
      },
      resolvedVariables: preOut.resolvedVariables,
      collection: preOut.mutatedCollection,
      environments: preOut.mutatedEnvironments,
      activeEnvId: null,
      pathFolders: preOut.mutatedPathFolders,
      allFolders: preOut.mutatedAllFolders
    })

    expect(postRes).not.toBeNull()
    expect(postRes!.success).toBe(true)
    expect(postRes!.testResults).toEqual([
      { name: 'status is 200', passed: true },
      { name: 'saw pre_flag', passed: true },
      { name: 'failing assertion', passed: false, error: 'intentional failure' },
      { name: 'runs after failure', passed: true }
    ])
    expect(postRes!.scopedEnvUpdates.folderGlobals['__nearest__']).toEqual({
      jwt: 'secret-jwt'
    })
  })

  it('re-exports helper utilities accurately', () => {
    const sync = reconcileUrlAndParams('https://example.com/:id?a=1', [], [])
    expect(sync.params).toEqual([{ key: 'a', value: '1', enabled: true }])
    expect(sync.path_params).toEqual([{ key: 'id', value: '', enabled: true }])

    const vars = new Map([['v', '123']])
    const headers = resolveHeaders([{ key: 'X-Test', value: '{{v}}', enabled: true }], [], vars)
    expect(headers).toEqual([{ key: 'X-Test', value: '123', enabled: true }])

    const auth = resolveAuth({ type: 'bearer', bearer: { token: '{{v}}' } }, [], vars)
    expect(auth.headers).toEqual([{ key: 'Authorization', value: 'Bearer 123', enabled: true }])

    expect(stripJsonComments('{\n // comment\n "a": 1,\n}')).toContain('"a": 1')
    const parsed = parseCurlCommand('curl -X POST https://example.com/api -d \'{"x":1}\'')
    expect(parsed.method).toBe('POST')
    expect(parsed.url).toBe('https://example.com/api')
  })
})
