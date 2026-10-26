import { describe, it, expect } from 'vitest'
import {
  countStepsInNodes,
  evaluateStepVerdict,
  evaluateCustomBranchCondition,
  selectMatchingBranch,
  mergeParallelScriptUpdates,
  type FlowNode,
  type FlowBranch
} from '../flowRunner'
import * as HeadlessEngine from '../headless-engine'

describe('flowRunner.ts — Shared Flow Runner Logic', () => {
  describe('headless-engine exports', () => {
    it('exports all flowRunner functions on HectoEngine and HectoHeadless', () => {
      expect(typeof HeadlessEngine.countStepsInNodes).toBe('function')
      expect(typeof HeadlessEngine.evaluateStepVerdict).toBe('function')
      expect(typeof HeadlessEngine.evaluateCustomBranchCondition).toBe('function')
      expect(typeof HeadlessEngine.selectMatchingBranch).toBe('function')
      expect(typeof HeadlessEngine.mergeParallelScriptUpdates).toBe('function')

      const globalEngine = (globalThis as any).HectoEngine
      expect(globalEngine).toBeDefined()
      expect(typeof globalEngine.evaluateStepVerdict).toBe('function')
      expect(typeof globalEngine.evaluateCustomBranchCondition).toBe('function')
      expect(typeof globalEngine.selectMatchingBranch).toBe('function')
      expect(typeof globalEngine.mergeParallelScriptUpdates).toBe('function')
      expect(typeof globalEngine.countStepsInNodes).toBe('function')
    })
  })

  describe('countStepsInNodes', () => {
    it('returns 0 for empty or nullish nodes', () => {
      expect(countStepsInNodes(undefined)).toBe(0)
      expect(countStepsInNodes(null)).toBe(0)
      expect(countStepsInNodes([])).toBe(0)
    })

    it('counts sequential, parallel, and nested branch steps accurately', () => {
      const nodes: FlowNode[] = [
        {
          id: 'n1',
          steps: [{ id: 's1', request_id: 'r1', enabled: true }]
        },
        {
          id: 'n2',
          steps: [
            { id: 's2', request_id: 'r2', enabled: true },
            { id: 's3', request_id: 'r3', enabled: false }
          ],
          branches: [
            {
              id: 'b1',
              condition: { type: 'success' },
              nodes: [
                {
                  id: 'n3',
                  steps: [{ id: 's4', request_id: 'r4', enabled: true }]
                }
              ]
            },
            {
              id: 'b2',
              condition: { type: 'error' },
              nodes: [
                {
                  id: 'n4',
                  steps: [
                    { id: 's5', request_id: 'r5', enabled: true },
                    { id: 's6', request_id: 'r6', enabled: true }
                  ]
                }
              ]
            }
          ]
        }
      ]
      expect(countStepsInNodes(nodes)).toBe(6)
    })
  })

  describe('evaluateStepVerdict', () => {
    it('fails with deleted_request when requestMissing is true', () => {
      const res = evaluateStepVerdict({
        requestMissing: true,
        statusCode: 200
      })
      expect(res.passed).toBe(false)
      expect(res.failureCategory).toBe('deleted_request')
      expect(res.failureReason).toContain('xóa')
    })

    it('fails with network_or_timeout when networkError is non-empty', () => {
      const res = evaluateStepVerdict({
        networkError: 'TIMEOUT: Request timed out after 50ms',
        statusCode: 0
      })
      expect(res.passed).toBe(false)
      expect(res.failureCategory).toBe('network_or_timeout')
      expect(res.failureReason).toBe('TIMEOUT: Request timed out after 50ms')
    })

    it('fails with script_error when scriptError is non-empty', () => {
      const res = evaluateStepVerdict({
        scriptError: 'ReferenceError: foo is not defined',
        statusCode: 200
      })
      expect(res.passed).toBe(false)
      expect(res.failureCategory).toBe('script_error')
      expect(res.failureReason).toBe('ReferenceError: foo is not defined')
    })

    it('fails with test_failed if any ha.test() has passed === false', () => {
      const res = evaluateStepVerdict({
        statusCode: 200,
        scriptTests: [
          { name: 'Status is 200', passed: true },
          { name: 'Token exists', passed: false, error: 'Expected token to be defined' }
        ]
      })
      expect(res.passed).toBe(false)
      expect(res.failureCategory).toBe('test_failed')
      expect(res.failureReason).toContain('Token exists: Expected token to be defined')
    })

    it('fails with http_status when scriptTests is empty and statusCode >= 400', () => {
      const res = evaluateStepVerdict({
        statusCode: 400,
        scriptTests: []
      })
      expect(res.passed).toBe(false)
      expect(res.failureCategory).toBe('http_status')
      expect(res.failureReason).toBe('HTTP 400')
    })

    it('passes on Negative Test when statusCode >= 400 but at least 1 ha.test() exists and all pass', () => {
      const res = evaluateStepVerdict({
        statusCode: 400,
        scriptTests: [{ name: 'Expect 400 Bad Request', passed: true }]
      })
      expect(res.passed).toBe(true)
      expect(res.failureCategory).toBeUndefined()
    })

    it('passes when statusCode < 400 and no errors or failing tests exist', () => {
      expect(evaluateStepVerdict({ statusCode: 201 })).toEqual({ passed: true })
      expect(
        evaluateStepVerdict({
          statusCode: 200,
          scriptTests: [{ name: 'OK', passed: true }]
        })
      ).toEqual({ passed: true })
    })
  })

  describe('evaluateCustomBranchCondition', () => {
    it('evaluates status_code with ==, !=, >, < and variable resolution', () => {
      const ctx = {
        statusCode: 429,
        variables: { expected_status: '429', min_err: '400' }
      }
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: '==', value: '{{expected_status}}' },
          ctx
        )
      ).toBe(true)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: '!=', value: '200' },
          ctx
        )
      ).toBe(true)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: '>', value: '{{min_err}}' },
          ctx
        )
      ).toBe(true)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: '<', value: '500' },
          ctx
        )
      ).toBe(true)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: 'exists' },
          ctx
        )
      ).toBe(true)

      // Network error or missing request -> status_code does not exist
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: 'exists' },
          { statusCode: 0, networkError: 'CONNECTION_ERROR' }
        )
      ).toBe(false)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'status_code', operator: '!=', value: '200' },
          { statusCode: 200, requestMissing: true }
        )
      ).toBe(false)
    })

    it('evaluates body_json with dot paths and array indices', () => {
      const body = JSON.stringify({
        data: {
          status: 'RATE_LIMITED',
          retryAfter: 15,
          items: [
            { id: 101, code: 'ERR_QUOTA', tags: ['urgent', 'billing'] },
            { id: 102, code: 'OK' }
          ],
          nullField: null
        }
      })
      const ctx = {
        statusCode: 200,
        responseBody: body,
        variables: { expected_code: 'ERR_QUOTA' }
      }

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[0].code',
            operator: '==',
            value: '{{expected_code}}'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[0].id',
            operator: '==',
            value: '101'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.retryAfter',
            operator: '>',
            value: '10'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[0].tags',
            operator: 'contains',
            value: 'billing'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.status',
            operator: 'contains',
            value: 'LIMIT'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[1].code',
            operator: 'exists'
          },
          ctx
        )
      ).toBe(true)

      // null or non-existent path -> exists is false
      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.nullField',
            operator: 'exists'
          },
          ctx
        )
      ).toBe(false)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[99].id',
            operator: 'exists'
          },
          ctx
        )
      ).toBe(false)

      // Invalid JSON body -> returns false
      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.status',
            operator: '==',
            value: 'OK'
          },
          { statusCode: 200, responseBody: 'not-json' }
        )
      ).toBe(false)
    })

    it('handles leading-zero strings, unclosed brackets, and null JSON properties accurately', () => {
      const ctx = {
        statusCode: 200,
        responseBody: JSON.stringify({
          code: '0123',
          data: {
            items: [{ id: 1 }],
            nullProp: null
          }
        }),
        variables: {
          pin: '0123'
        }
      }

      // Leading-zero string "0123" must NOT equal "123"
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'body_json', path: 'code', operator: '==', value: '123' },
          ctx
        )
      ).toBe(false)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'body_json', path: 'code', operator: '!=', value: '123' },
          ctx
        )
      ).toBe(true)
      expect(
        evaluateCustomBranchCondition(
          { type: 'custom', source: 'variable', path: 'pin', operator: '==', value: '0123' },
          ctx
        )
      ).toBe(true)

      // Unclosed bracket in JSON path -> exists: false
      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[0',
            operator: 'exists'
          },
          ctx
        )
      ).toBe(false)

      // null JSON property: exists is false, != "foo" is true, != "null" is false
      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.nullProp',
            operator: 'exists'
          },
          ctx
        )
      ).toBe(false)
      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.nullProp',
            operator: '!=',
            value: 'foo'
          },
          ctx
        )
      ).toBe(true)
      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.nullProp',
            operator: '!=',
            value: 'null'
          },
          ctx
        )
      ).toBe(false)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.nullProp',
            operator: '==',
            value: 'null'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.nullProp',
            operator: '==',
            value: 'something'
          },
          ctx
        )
      ).toBe(false)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'body_json',
            path: 'data.items[{{idx}}].id',
            operator: '==',
            value: '1'
          },
          { ...ctx, variables: { idx: '0' } }
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            target: 'status_code' as any,
            operator: '==',
            value: '200'
          } as any,
          ctx
        )
      ).toBe(true)
    })

    it('evaluates variable source across operators', () => {
      const ctx = {
        statusCode: 200,
        variables: {
          role: 'super_admin',
          attempt_count: '3',
          target_role: 'admin'
        }
      }

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'variable',
            path: 'role',
            operator: 'contains',
            value: '{{target_role}}'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'variable',
            path: 'attempt_count',
            operator: '<',
            value: '5'
          },
          ctx
        )
      ).toBe(true)

      expect(
        evaluateCustomBranchCondition(
          {
            type: 'custom',
            source: 'variable',
            path: 'missing_var',
            operator: 'exists'
          },
          ctx
        )
      ).toBe(false)
    })
  })

  describe('selectMatchingBranch', () => {
    const branches: FlowBranch[] = [
      {
        id: 'br-success',
        name: 'Thành công',
        condition: { type: 'success' },
        nodes: []
      },
      {
        id: 'br-error',
        name: 'Khi Lỗi',
        condition: { type: 'error' },
        nodes: []
      },
      {
        id: 'br-custom-429',
        name: 'Rate Limit 429',
        condition: {
          type: 'custom',
          source: 'status_code',
          operator: '==',
          value: '429'
        },
        nodes: []
      },
      {
        id: 'br-custom-vip',
        name: 'VIP Tier',
        condition: {
          type: 'custom',
          source: 'body_json',
          path: 'user.tier',
          operator: '==',
          value: '{{vip_tier}}'
        },
        nodes: []
      }
    ]

    it('prioritizes custom branches in declaration order before success/error', () => {
      // Even though nodePassed is false (HTTP 429), custom branch br-custom-429 matches before br-error!
      const res429 = selectMatchingBranch(branches, false, {
        statusCode: 429,
        responseBody: '{"error":"too many requests"}'
      })
      expect(res429.matchedBranchId).toBe('br-custom-429')
      expect(res429.skippedBranchIds).toEqual(['br-success', 'br-error', 'br-custom-vip'])

      // Even though nodePassed is true (HTTP 200), custom branch br-custom-vip matches before br-success!
      const resVip = selectMatchingBranch(branches, true, {
        statusCode: 200,
        responseBody: '{"user":{"tier":"PLATINUM"}}',
        variables: { vip_tier: 'PLATINUM' }
      })
      expect(resVip.matchedBranchId).toBe('br-custom-vip')
      expect(resVip.skippedBranchIds).toEqual(['br-success', 'br-error', 'br-custom-429'])
    })

    it('falls back to success branch when nodePassed is true and no custom branch matches', () => {
      const res = selectMatchingBranch(branches, true, {
        statusCode: 200,
        responseBody: '{"user":{"tier":"STANDARD"}}',
        variables: { vip_tier: 'PLATINUM' }
      })
      expect(res.matchedBranchId).toBe('br-success')
      expect(res.skippedBranchIds).toEqual(['br-error', 'br-custom-429', 'br-custom-vip'])
    })

    it('falls back to error branch when nodePassed is false and no custom branch matches', () => {
      const res = selectMatchingBranch(branches, false, {
        statusCode: 500,
        responseBody: '{"error":"internal"}'
      })
      expect(res.matchedBranchId).toBe('br-error')
      expect(res.skippedBranchIds).toEqual(['br-success', 'br-custom-429', 'br-custom-vip'])
    })

    it('returns matchedBranchId: null when no branch matches', () => {
      const onlyErrorBranch: FlowBranch[] = [
        { id: 'br-only-err', condition: { type: 'error' }, nodes: [] }
      ]
      const res = selectMatchingBranch(onlyErrorBranch, true, { statusCode: 200 })
      expect(res.matchedBranchId).toBeNull()
      expect(res.skippedBranchIds).toEqual(['br-only-err'])
    })
  })

  describe('mergeParallelScriptUpdates', () => {
    it('merges parallel step updates deterministically in declaration order and normalizes __nearest__', () => {
      const folderUsers = {
        id: 'folder-users-id',
        name: 'Users',
        type: 'folder' as const,
        path: '/coll/users',
        variables: [{ key: 'existing_u', value: 'u0', enabled: true }]
      }
      const folderCatalog = {
        id: 'folder-catalog-id',
        name: 'Catalog',
        type: 'folder' as const,
        path: '/coll/catalog',
        variables: []
      }

      const baseState = {
        collection: {
          id: 'coll-1',
          name: 'E-Commerce',
          active_env_id: 'env-stg',
          variables: [{ key: 'shared', value: 'initial', enabled: true }]
        },
        environments: [
          {
            id: 'env-stg',
            name: 'Staging',
            variables: [{ key: 'env_shared', value: 'init_env', enabled: true }]
          }
        ],
        activeEnvId: 'env-stg',
        allFolders: [folderUsers, folderCatalog],
        cliVarOverrides: { cli_var: 'from-cli' }
      }

      const merged = mergeParallelScriptUpdates(baseState, [
        {
          stepId: 'step-1',
          requestId: 'req-1',
          pathFolders: [folderUsers],
          envUpdates: { active_var_1: 'a1', active_conflict: 'from_step_1' },
          scopedEnvUpdates: {
            collection: { shared: 'from1', varA: '1' },
            globalEnvs: { Staging: { stg_1: 's1' } },
            folderGlobals: { __nearest__: { folder_u_var: 'u1' } },
            folderEnvs: [
              { folder: '__nearest__', env: '__active__', key: 'tier4_u', value: 't4_u1' }
            ]
          },
          scopedAuthUpdates: {
            folderGlobals: {
              __nearest__: { type: 'bearer', bearer: { token: 'users-token' } }
            },
            folderEnvs: []
          }
        },
        {
          stepId: 'step-2',
          requestId: 'req-2',
          pathFolders: [folderCatalog],
          envUpdates: { active_var_2: 'a2', active_conflict: 'from_step_2' },
          scopedEnvUpdates: {
            collection: { shared: 'from2', varB: '2' },
            globalEnvs: {},
            folderGlobals: { __nearest__: { folder_c_var: 'c2' } },
            folderEnvs: []
          },
          scopedAuthUpdates: {
            collectionGlobal: { type: 'bearer', bearer: { token: 'coll-token-2' } },
            folderGlobals: {
              __nearest__: { type: 'bearer', bearer: { token: 'catalog-token' } }
            },
            folderEnvs: []
          }
        }
      ])

      // 1. Collection variables merged in order: shared == "from2", varA == "1", varB == "2"
      expect(merged.mergedScriptResult.scopedEnvUpdates.collection).toEqual({
        shared: 'from2',
        varA: '1',
        varB: '2'
      })
      expect(merged.resolvedVariables.shared).toBe('from2')
      expect(merged.resolvedVariables.varA).toBe('1')
      expect(merged.resolvedVariables.varB).toBe('2')

      // 2. Active environment variables merged in order: active_conflict == "from_step_2"
      expect(merged.mergedScriptResult.envUpdates).toEqual({
        active_var_1: 'a1',
        active_var_2: 'a2',
        active_conflict: 'from_step_2'
      })
      expect(merged.resolvedVariables.active_conflict).toBe('from_step_2')
      expect(merged.resolvedVariables.stg_1).toBe('s1')

      // 3. __nearest__ normalized to each step's own folder UUID without collision!
      expect(merged.mergedScriptResult.scopedEnvUpdates.folderGlobals).toEqual({
        'folder-users-id': { folder_u_var: 'u1' },
        'folder-catalog-id': { folder_c_var: 'c2' }
      })
      expect(merged.mergedScriptResult.scopedEnvUpdates.folderEnvs).toEqual([
        {
          folder: 'folder-users-id',
          env: 'env-stg',
          key: 'tier4_u',
          value: 't4_u1'
        }
      ])

      // 4. Scoped Auth updates normalized by folder UUID
      expect(merged.mergedScriptResult.scopedAuthUpdates.folderGlobals).toEqual({
        'folder-users-id': { type: 'bearer', bearer: { token: 'users-token' } },
        'folder-catalog-id': { type: 'bearer', bearer: { token: 'catalog-token' } }
      })
      expect(merged.mergedScriptResult.scopedAuthUpdates.collectionGlobal).toEqual({
        type: 'bearer',
        bearer: { token: 'coll-token-2' }
      })

      // 5. Resolved variables include Tier 1..4 and CLI overrides
      expect(merged.resolvedVariables.folder_u_var).toBe('u1')
      expect(merged.resolvedVariables.folder_c_var).toBe('c2')
      expect(merged.resolvedVariables.tier4_u).toBe('t4_u1')
      expect(merged.resolvedVariables.cli_var).toBe('from-cli')
    })

    it('preserves Tier 3 folderGlobals over Tier 2 envUpdates and lets script mutations override cliVarOverrides', () => {
      const folderA = {
        id: 'folder-a-id',
        name: 'FolderA',
        type: 'folder' as const,
        path: '/coll/folder-a',
        variables: []
      }
      const folderSubB = {
        id: 'folder-sub-b-id',
        name: 'SubB',
        type: 'folder' as const,
        path: '/coll/folder-a/sub-b',
        variables: []
      }

      const baseState = {
        collection: {
          id: 'coll-1',
          name: 'Test',
          active_env_id: 'env-1',
          variables: []
        },
        environments: [
          {
            id: 'env-1',
            name: 'Dev',
            variables: []
          }
        ],
        activeEnvId: 'env-1',
        allFolders: [folderA, folderSubB],
        cliVarOverrides: {
          mutated_by_script: 'initial-cli-val',
          unmutated_cli: 'stays-cli-val'
        }
      }

      const merged = mergeParallelScriptUpdates(baseState, [
        {
          stepId: 'step-1',
          requestId: 'req-1',
          pathFolders: [folderA, folderSubB],
          envUpdates: {
            x: 'tier2',
            mutated_by_script: 'updated-by-script'
          }
        },
        {
          stepId: 'step-2',
          requestId: 'req-2',
          pathFolders: [folderA, folderSubB],
          scopedEnvUpdates: {
            folderGlobals: {
              'FolderA / SubB': { x: 'tier3' },
              NonExistentFolder: { ignored_var: 'ignored' }
            }
          }
        }
      ])

      // Tier 3 folderGlobals ("tier3") must win over Tier 2 envUpdates ("tier2")
      expect(merged.resolvedVariables.x).toBe('tier3')
      // Slash-path "FolderA / SubB" resolved to folder-sub-b-id, and NonExistentFolder was ignored (null)
      expect(merged.mergedScriptResult.scopedEnvUpdates.folderGlobals).toEqual({
        'folder-sub-b-id': { x: 'tier3' }
      })
      // Script mutation overrides initial cliVarOverrides for mutated_by_script, while unmutated_cli remains
      expect(merged.resolvedVariables.mutated_by_script).toBe('updated-by-script')
      expect(merged.resolvedVariables.unmutated_cli).toBe('stays-cli-val')
    })
  })
})

