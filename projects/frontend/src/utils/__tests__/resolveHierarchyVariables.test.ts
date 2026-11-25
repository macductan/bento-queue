import { describe, it, expect } from 'vitest'
import {
  resolveHierarchyVariables,
  buildVariableScopeOptions,
  inspectVariableHierarchy
} from '../resolveHierarchyVariables'

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

describe('buildVariableScopeOptions & inspectVariableHierarchy', () => {
  const folderA = {
    id: 'folder-a',
    name: 'Folder A',
    variables: [{ key: 'sharedKey', value: 'folder-a-global', enabled: true }],
    folder_envs: {
      'env-local': [{ key: 'sharedKey', value: 'folder-a-local', enabled: true }],
      'env-staging': [{ key: 'sharedKey', value: 'folder-a-staging', enabled: true }]
    }
  }

  const folderB = {
    id: 'folder-b',
    name: 'Folder B',
    variables: [{ key: 'sharedKey', value: 'folder-b-global', enabled: true }],
    folder_envs: {
      'env-local': [{ key: 'baseUrl', value: 'http://folder-b-local', enabled: true }],
      'env-staging': [{ key: 'baseUrl', value: 'http://folder-b-staging', enabled: true }]
    }
  }

  const environments = [
    {
      id: 'env-local',
      name: 'Local',
      variables: [{ key: 'globalKey', value: 'local-val', enabled: true }]
    },
    {
      id: 'env-staging',
      name: 'Staging',
      variables: [{ key: 'globalKey', value: 'staging-val', enabled: true }]
    }
  ]

  it('lists all ancestor folders and Global/Collection Env filtered strictly to activeEnvId', () => {
    const options = buildVariableScopeOptions({
      pathFolders: [folderA, folderB],
      activeEnvId: 'env-local',
      environments
    })

    expect(options.map(o => o.label)).toEqual([
      'Folder: Folder B (Local)',
      'Folder: Folder B (Dùng chung)',
      'Folder: Folder A (Local)',
      'Folder: Folder A (Dùng chung)',
      'Global Env (Local)',
      'Collection Env (Dùng chung)'
    ])
    expect(options.some(o => o.label.includes('Staging'))).toBe(false)
  })

  it('lists only Folder Global (Dùng chung) and Collection Env when activeEnvId is null', () => {
    const options = buildVariableScopeOptions({
      pathFolders: [folderA],
      activeEnvId: null,
      environments
    })

    expect(options.map(o => o.label)).toEqual([
      'Folder: Folder A (Dùng chung)',
      'Collection Env (Dùng chung)'
    ])
    expect(options.some(o => o.kind === 'global-env' || o.kind === 'folder-env')).toBe(false)
  })

  it('selects Winning Tier for resolved variable and provides values across all scopes', () => {
    const result = inspectVariableHierarchy('baseUrl', {
      collectionVariables: [{ key: 'baseUrl', value: 'http://coll', enabled: true }],
      pathFolders: [folderA, folderB],
      activeEnvId: 'env-local',
      environments
    })

    expect(result.isResolved).toBe(true)
    expect(result.effectiveValue).toBe('http://folder-b-local')
    expect(result.winningScopeId).toBe('folder-env:folder-b:env-local')
    expect(result.defaultScopeId).toBe('folder-env:folder-b:env-local')
    expect(result.winningOption?.label).toBe('Folder: Folder B (Local)')
    expect(result.valuesByScopeId['collection']).toBe('http://coll')
    expect(result.valuesByScopeId['folder-env:folder-b:env-local']).toBe('http://folder-b-local')
    expect(result.valuesByScopeId['folder-global:folder-a']).toBeUndefined()
  })

  it('respects 4-tier precedence where parent Folder-Env (Level 4) beats child Folder Global (Level 3)', () => {
    const result = inspectVariableHierarchy('sharedKey', {
      collectionVariables: [{ key: 'sharedKey', value: 'coll-val', enabled: true }],
      pathFolders: [folderA, folderB],
      activeEnvId: 'env-local',
      environments
    })

    // Folder A has folder_envs['env-local'] (Level 4), Folder B only has variables (Level 3)
    expect(result.isResolved).toBe(true)
    expect(result.effectiveValue).toBe('folder-a-local')
    expect(result.winningScopeId).toBe('folder-env:folder-a:env-local')
    expect(result.winningOption?.label).toBe('Folder: Folder A (Local)')
  })

  it('defaults to Global Env (<Active Env>) when variable is missing and activeEnvId is set', () => {
    const result = inspectVariableHierarchy('newKey', {
      collectionVariables: [],
      pathFolders: [folderA, folderB],
      activeEnvId: 'env-local',
      environments
    })

    expect(result.isResolved).toBe(false)
    expect(result.winningScopeId).toBeNull()
    expect(result.defaultScopeId).toBe('global-env:env-local')
    expect(result.defaultOption.label).toBe('Global Env (Local)')
    expect(result.valuesByScopeId).toEqual({})
  })

  it('defaults to Collection Env (Dùng chung) when variable is missing and activeEnvId is null', () => {
    const result = inspectVariableHierarchy('newKey', {
      collectionVariables: [],
      pathFolders: [folderA],
      activeEnvId: null,
      environments
    })

    expect(result.isResolved).toBe(false)
    expect(result.winningScopeId).toBeNull()
    expect(result.defaultScopeId).toBe('collection')
    expect(result.defaultOption.label).toBe('Collection Env (Dùng chung)')
  })

  it('treats stale activeEnvId as inactive when environments is an empty array []', () => {
    const result = inspectVariableHierarchy('newKey', {
      collectionVariables: [],
      pathFolders: [folderA],
      activeEnvId: 'env-deleted',
      environments: []
    })

    expect(result.options.map(o => o.label)).toEqual([
      'Folder: Folder A (Dùng chung)',
      'Collection Env (Dùng chung)'
    ])
    expect(result.defaultScopeId).toBe('collection')
  })

  it('returns per-scope select metadata and falls back in order path-param -> folder-env -> folder-global -> global-env -> collection', () => {
    const envsWithSelect = [
      {
        id: 'env-local',
        name: 'Local',
        variables: [
          {
            key: 'role',
            value: 'admin',
            enabled: true,
            type: 'select' as const,
            options: ['admin', 'user']
          }
        ]
      }
    ]
    const collVars = [
      {
        key: 'role',
        value: 'viewer',
        enabled: true,
        type: 'select' as const,
        options: ['viewer']
      }
    ]

    // 1. Folder does not have 'role' -> inherits from Global Env (['admin', 'user']) rather than Collection (['viewer'])
    const fromGlobal = inspectVariableHierarchy('role', {
      collectionVariables: collVars,
      pathFolders: [{ id: 'f1', name: 'F1', variables: [], folder_envs: {} }],
      activeEnvId: 'env-local',
      environments: envsWithSelect
    })
    expect(fromGlobal.inheritedType).toBe('select')
    expect(fromGlobal.inheritedOptions).toEqual(['admin', 'user'])
    expect(fromGlobal.options.find(o => o.id === 'global-env:env-local')).toMatchObject({
      hasVariable: true,
      type: 'select',
      options: ['admin', 'user']
    })
    expect(fromGlobal.options.find(o => o.id === 'folder-global:f1')?.hasVariable).toBe(false)
    expect(fromGlobal.options.find(o => o.id === 'folder-global:f1')?.type).toBeUndefined()

    // 2. Folder Global defines select -> beats Global Env
    const fromFolderGlobal = inspectVariableHierarchy('role', {
      collectionVariables: collVars,
      pathFolders: [
        {
          id: 'f1',
          name: 'F1',
          variables: [{ key: 'role', value: 'editor', enabled: true, type: 'select', options: ['editor'] }],
          folder_envs: {}
        }
      ],
      activeEnvId: 'env-local',
      environments: envsWithSelect
    })
    expect(fromFolderGlobal.inheritedType).toBe('select')
    expect(fromFolderGlobal.inheritedOptions).toEqual(['editor'])

    // 3. Folder-Env defines select -> beats Folder Global
    const fromFolderEnv = inspectVariableHierarchy('role', {
      collectionVariables: collVars,
      pathFolders: [
        {
          id: 'f1',
          name: 'F1',
          variables: [{ key: 'role', value: 'editor', enabled: true, type: 'select', options: ['editor'] }],
          folder_envs: {
            'env-local': [{ key: 'role', value: 'super', enabled: true, type: 'select', options: ['super'] }]
          }
        }
      ],
      activeEnvId: 'env-local',
      environments: envsWithSelect
    })
    expect(fromFolderEnv.inheritedType).toBe('select')
    expect(fromFolderEnv.inheritedOptions).toEqual(['super'])

    // 4. Path Param defines select -> beats Folder-Env
    const fromPathParam = inspectVariableHierarchy('role', {
      collectionVariables: collVars,
      pathFolders: [
        {
          id: 'f1',
          name: 'F1',
          variables: [],
          folder_envs: {
            'env-local': [{ key: 'role', value: 'super', enabled: true, type: 'select', options: ['super'] }]
          }
        }
      ],
      activeEnvId: 'env-local',
      environments: envsWithSelect,
      isPathParam: true,
      pathParams: [{ key: 'role', value: '', enabled: true, type: 'select', options: ['path-role'] }]
    })
    expect(fromPathParam.inheritedType).toBe('select')
    expect(fromPathParam.inheritedOptions).toEqual(['path-role'])
  })

  it('stops fallbackScopeOrder at a higher-precedence text override instead of inheriting select from a shadowed lower tier', () => {
    const result = inspectVariableHierarchy('role', {
      collectionVariables: [
        {
          key: 'role',
          value: 'viewer',
          enabled: true,
          type: 'select',
          options: ['viewer', 'editor']
        }
      ],
      pathFolders: [{ id: 'f1', name: 'F1', variables: [], folder_envs: {} }],
      activeEnvId: 'env-local',
      environments: [
        {
          id: 'env-local',
          name: 'Local',
          variables: [{ key: 'role', value: 'plain-override', enabled: true, type: 'text' }]
        }
      ]
    })

    expect(result.winningScopeId).toBe('global-env:env-local')
    expect(result.inheritedType).toBe('text')
    expect(result.inheritedOptions).toEqual([])
  })

  it('supports Tier 5 requestVariables overriding all 4 lower tiers independently per request and live option inheritance', () => {
    const envsWithSelect = [
      {
        id: 'env-local',
        name: 'Local',
        variables: [
          { key: 'role', value: 'admin', enabled: true, type: 'select', options: ['admin', 'user'] },
          { key: 'host', value: 'https://dev.api', enabled: true, type: 'text' }
        ]
      }
    ]
    const folders = [
      {
        id: 'f1',
        name: 'F1',
        variables: [{ key: 'role', value: 'editor', enabled: true }],
        folder_envs: {}
      }
    ]

    // 1. resolveHierarchyVariables: Tier 5 requestVariables beats Folder-Env/Folder/Env/Collection
    const reqAResolved = resolveHierarchyVariables({
      collectionVariables: [{ key: 'role', value: 'coll', enabled: true }],
      activeEnvVariables: envsWithSelect[0].variables,
      pathFolders: folders,
      activeEnvId: 'env-local',
      requestVariables: [{ key: 'role', value: 'user', enabled: true }]
    })
    const reqBResolved = resolveHierarchyVariables({
      collectionVariables: [{ key: 'role', value: 'coll', enabled: true }],
      activeEnvVariables: envsWithSelect[0].variables,
      pathFolders: folders,
      activeEnvId: 'env-local',
      requestVariables: []
    })
    expect(reqAResolved.get('role')).toBe('user')
    expect(reqBResolved.get('role')).toBe('editor')

    // 2. inspectVariableHierarchy: select variable defaults to 'request' when hasActiveRequest is true
    const selectInspect = inspectVariableHierarchy('role', {
      collectionVariables: [],
      pathFolders: [],
      activeEnvId: 'env-local',
      environments: envsWithSelect,
      hasActiveRequest: true,
      requestVariables: [{ key: 'role', value: 'user', enabled: true }]
    })
    expect(selectInspect.winningScopeId).toBe('request')
    expect(selectInspect.effectiveValue).toBe('user')
    expect(selectInspect.defaultScopeId).toBe('request')
    // Pure value override in request.variables inherits live select options from Global Env
    expect(selectInspect.inheritedType).toBe('select')
    expect(selectInspect.inheritedOptions).toEqual(['admin', 'user'])
    expect(selectInspect.parentInheritedType).toBe('select')
    expect(selectInspect.parentInheritedOptions).toEqual(['admin', 'user'])

    // 3. Normal text variable without request override defaults to winning shared scope ('global-env:env-local')
    const textInspect = inspectVariableHierarchy('host', {
      collectionVariables: [],
      pathFolders: [],
      activeEnvId: 'env-local',
      environments: envsWithSelect,
      hasActiveRequest: true,
      requestVariables: []
    })
    expect(textInspect.winningScopeId).toBe('global-env:env-local')
    expect(textInspect.defaultScopeId).toBe('global-env:env-local')
    expect(textInspect.options[0]).toMatchObject({ id: 'request', kind: 'request' })
  })
})

