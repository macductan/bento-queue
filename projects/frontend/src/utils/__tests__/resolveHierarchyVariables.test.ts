import { describe, it, expect } from 'vitest'
import { resolveHierarchyVariables } from '../resolveHierarchyVariables'

describe('resolveHierarchyVariables', () => {
  it('Scenario 1: Only Collection Env (Level 1)', () => {
    const collVars = [
      { key: 'host', value: 'base.api.com', enabled: true },
      { key: 'version', value: 'v1', enabled: true },
      { key: 'ignored', value: 'skip', enabled: false }
    ]

    const result = resolveHierarchyVariables(collVars, null, null, null)

    expect(result.size).toBe(2)
    expect(result.get('host')).toBe('base.api.com')
    expect(result.get('version')).toBe('v1')
    expect(result.has('ignored')).toBe(false)
  })

  it('Scenario 2: Global Env overrides Collection Env (Level 2 > Level 1)', () => {
    const collVars = [
      { key: 'host', value: 'base.api.com', enabled: true },
      { key: 'timeout', value: '5000', enabled: true }
    ]
    const envVars = [
      { key: 'host', value: 'dev.api.com', enabled: true },
      { key: 'envName', value: 'development', enabled: true }
    ]

    const result = resolveHierarchyVariables(collVars, envVars, null, 'env-dev-id')

    expect(result.get('host')).toBe('dev.api.com')
    expect(result.get('timeout')).toBe('5000')
    expect(result.get('envName')).toBe('development')
  })

  it('Scenario 2b: Global Env with Map<string, string> input', () => {
    const collVars = [{ key: 'host', value: 'base.api.com', enabled: true }]
    const envMap = new Map<string, string>([['host', 'stage.api.com']])

    const result = resolveHierarchyVariables(collVars, envMap, null, 'env-stage-id')

    expect(result.get('host')).toBe('stage.api.com')
  })

  it('Scenario 3: Folder Global Env overrides Global Env and Collection Env (Level 3 > Level 2 > Level 1)', () => {
    const collVars = [
      { key: 'host', value: 'base.api.com', enabled: true },
      { key: 'port', value: '80', enabled: true }
    ]
    const envVars = [
      { key: 'host', value: 'dev.api.com', enabled: true },
      { key: 'port', value: '8080', enabled: true }
    ]
    const folders = [
      {
        id: 'f1',
        name: 'Auth Folder',
        variables: [{ key: 'port', value: '3000', enabled: true }]
      }
    ]

    const result = resolveHierarchyVariables(collVars, envVars, folders, 'env-dev-id')

    expect(result.get('host')).toBe('dev.api.com') // from Global Env
    expect(result.get('port')).toBe('3000') // overridden by Folder Global Env
  })

  it('Scenario 4: Folder-Env overrides Folder Global Env and earlier levels (Level 4 > Level 3 > Level 2 > Level 1)', () => {
    const collVars = [{ key: 'apiUrl', value: 'https://base.api', enabled: true }]
    const envVars = [{ key: 'apiUrl', value: 'https://dev.api', enabled: true }]
    const folders = [
      {
        id: 'f1',
        variables: [{ key: 'apiUrl', value: 'https://folder.dev.api', enabled: true }],
        folder_envs: {
          'env-dev-id': [{ key: 'apiUrl', value: 'https://custom.dev.api', enabled: true }],
          'env-prod-id': [{ key: 'apiUrl', value: 'https://custom.prod.api', enabled: true }]
        }
      }
    ]

    // With activeEnvId = 'env-dev-id'
    const resultDev = resolveHierarchyVariables(collVars, envVars, folders, 'env-dev-id')
    expect(resultDev.get('apiUrl')).toBe('https://custom.dev.api')

    // With activeEnvId = 'env-prod-id'
    const resultProd = resolveHierarchyVariables(collVars, envVars, folders, 'env-prod-id')
    expect(resultProd.get('apiUrl')).toBe('https://custom.prod.api')
  })

  it('Scenario 5: Nested Folders (Parent F1 vs Child F2)', () => {
    const folders = [
      {
        id: 'f1',
        name: 'Parent F1',
        variables: [
          { key: 'a', value: '1', enabled: true },
          { key: 'b', value: '1', enabled: true }
        ],
        folder_envs: {
          'env-dev': [{ key: 'c', value: 'f1-dev', enabled: true }]
        }
      },
      {
        id: 'f2',
        name: 'Child F2',
        variables: [
          { key: 'b', value: '2', enabled: true } // F2 overrides F1
        ],
        folder_envs: {
          'env-dev': [{ key: 'c', value: 'f2-dev', enabled: true }] // F2 overrides F1
        }
      }
    ]

    const result = resolveHierarchyVariables(null, null, folders, 'env-dev')

    expect(result.get('a')).toBe('1') // from F1
    expect(result.get('b')).toBe('2') // overridden by F2
    expect(result.get('c')).toBe('f2-dev') // overridden by F2 folder-env
  })

  it('Scenario 6: Disabled variables at higher levels do not overwrite enabled variables from lower levels', () => {
    const collVars = [{ key: 'token', value: 'base-token', enabled: true }]
    const envVars = [{ key: 'token', value: 'env-token', enabled: false }] // disabled
    const folders = [
      {
        id: 'f1',
        variables: [{ key: 'token', value: 'folder-token', enabled: false }], // disabled
        folder_envs: {
          'env-test': [{ key: 'token', value: 'specific-token', enabled: false }] // disabled
        }
      }
    ]

    const result = resolveHierarchyVariables(collVars, envVars, folders, 'env-test')

    // Disabled variables at Levels 2, 3, 4 are ignored; Level 1 value is preserved
    expect(result.get('token')).toBe('base-token')
  })

  it('Scenario 7: No active environment selected (activeEnvId = null)', () => {
    const collVars = [{ key: 'host', value: 'base.api', enabled: true }]
    const envVars = [{ key: 'host', value: 'dev.api', enabled: true }]
    const folders = [
      {
        id: 'f1',
        variables: [{ key: 'port', value: '8080', enabled: true }],
        folder_envs: {
          'env-dev': [
            { key: 'host', value: 'f1-dev.api', enabled: true },
            { key: 'port', value: '9000', enabled: true }
          ]
        }
      }
    ]

    // When activeEnvId is null, both Level 2 (Global Env) and Level 4 (Folder-Env) are skipped
    const result = resolveHierarchyVariables(collVars, envVars, folders, null)

    expect(result.get('host')).toBe('base.api') // Level 1 applied, Level 2 & 4 skipped
    expect(result.get('port')).toBe('8080') // Level 3 applied, Level 4 skipped
  })

  it('Scenario 8: Legacy data with missing variables or folder_envs properties', () => {
    const folders = [
      { id: 'f-legacy-1', name: 'Legacy' },
      { id: 'f-legacy-2', name: 'Legacy with empty vars', variables: [] }
    ]

    // Should not throw or crash
    const result = resolveHierarchyVariables(undefined, undefined, folders as any, 'any-env')

    expect(result.size).toBe(0)
  })

  it('Scenario 9: Call using options object signature', () => {
    const result = resolveHierarchyVariables({
      collectionVariables: [{ key: 'k1', value: 'v1', enabled: true }],
      activeEnvVariables: [{ key: 'k2', value: 'v2', enabled: true }],
      pathFolders: [{ id: 'f1', variables: [{ key: 'k3', value: 'v3', enabled: true }] }],
      activeEnvId: 'dev-1'
    })

    expect(result.get('k1')).toBe('v1')
    expect(result.get('k2')).toBe('v2')
    expect(result.get('k3')).toBe('v3')
  })

  it('Scenario 10: Ignores whitespace-only keys and defaults null/undefined values to empty string', () => {
    const result = resolveHierarchyVariables({
      collectionVariables: [
        { key: '   ', value: 'skip-me', enabled: true },
        { key: 'nullVal', value: null as any, enabled: true },
        { key: 'validKey', value: 'realValue', enabled: true }
      ]
    })

    expect(result.size).toBe(2)
    expect(result.has('   ')).toBe(false)
    expect(result.get('nullVal')).toBe('')
    expect(result.get('validKey')).toBe('realValue')
  })
})
