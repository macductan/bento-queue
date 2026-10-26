import { describe, it, expect } from 'vitest'
import { filterTree, filterFlowTree, matchesFlowTreeNode } from '../treeFilter'
import type { TreeNode } from '@/stores/collectionStore'
import type { FlowTreeNode } from '@/stores/flowStore'

describe('treeFilter utility', () => {
  const mockTree: TreeNode[] = [
    {
      id: 'f-auth',
      name: 'Authentication',
      type: 'folder',
      path: 'auth',
      created_at: '',
      children: [
        {
          id: 'req-login',
          name: 'User Login',
          type: 'request',
          method: 'POST',
          path: 'auth/login',
          url: 'https://api.example.com/v1/auth/login',
          body: {
            type: 'json',
            content: '{"username": "admin", "password": "secret"}'
          },
          created_at: ''
        },
        {
          id: 'req-logout',
          name: 'User Logout',
          type: 'request',
          method: 'POST',
          path: 'auth/logout',
          url: 'https://api.example.com/v1/auth/logout',
          created_at: ''
        }
      ]
    },
    {
      id: 'f-users',
      name: 'Users Management',
      type: 'folder',
      path: 'users',
      created_at: '',
      children: [
        {
          id: 'f-nested-roles',
          name: 'Roles Subfolder',
          type: 'folder',
          path: 'users/roles',
          created_at: '',
          children: [
            {
              id: 'req-get-roles',
              name: 'Get All Roles',
              type: 'request',
              method: 'GET',
              path: 'users/roles/list',
              url: 'https://api.example.com/v1/users/roles',
              body: {
                type: 'raw',
                content: 'role_filter=superuser'
              },
              created_at: ''
            }
          ]
        },
        {
          id: 'req-list-users',
          name: 'List Users',
          type: 'request',
          method: 'GET',
          path: 'users/list',
          url: 'https://api.example.com/v1/users?page=1',
          created_at: ''
        }
      ]
    },
    {
      id: 'req-root-ping',
      name: 'Health Ping',
      type: 'request',
      method: 'GET',
      path: 'ping',
      url: 'https://api.example.com/healthz',
      created_at: ''
    }
  ]

  it('returns original tree unchanged and empty ancestor set when query is empty', () => {
    const res = filterTree(mockTree, '')
    expect(res.filtered).toEqual(mockTree)
    expect(res.expandedFolderIds.size).toBe(0)

    const resSpaces = filterTree(mockTree, '   ')
    expect(resSpaces.filtered).toEqual(mockTree)
    expect(resSpaces.expandedFolderIds.size).toBe(0)
  })

  it('matches request by name (case-insensitive) and expands ancestor folders', () => {
    const res = filterTree(mockTree, 'logout')
    expect(res.filtered.length).toBe(1)
    expect(res.filtered[0].id).toBe('f-auth')
    expect(res.filtered[0].children?.length).toBe(1)
    expect(res.filtered[0].children?.[0].id).toBe('req-logout')
    expect(res.expandedFolderIds.has('f-auth')).toBe(true)
  })

  it('matches request by URL and expands ancestor folders', () => {
    const res = filterTree(mockTree, 'v1/auth/login')
    expect(res.filtered.length).toBe(1)
    expect(res.filtered[0].id).toBe('f-auth')
    expect(res.filtered[0].children?.length).toBe(1)
    expect(res.filtered[0].children?.[0].id).toBe('req-login')
    expect(res.expandedFolderIds.has('f-auth')).toBe(true)
  })

  it('matches request by Body content and expands deep nested folders', () => {
    const res = filterTree(mockTree, 'superuser')
    expect(res.filtered.length).toBe(1)
    expect(res.filtered[0].id).toBe('f-users')
    expect(res.filtered[0].children?.length).toBe(1)
    expect(res.filtered[0].children?.[0].id).toBe('f-nested-roles')
    expect(res.filtered[0].children?.[0].children?.[0].id).toBe('req-get-roles')

    // Both parent and grandparent folders should be expanded
    expect(res.expandedFolderIds.has('f-users')).toBe(true)
    expect(res.expandedFolderIds.has('f-nested-roles')).toBe(true)
  })

  it('matches folder by folder name and preserves folder and its children', () => {
    const res = filterTree(mockTree, 'Authentication')
    expect(res.filtered.length).toBe(1)
    expect(res.filtered[0].id).toBe('f-auth')
    expect(res.filtered[0].children?.length).toBe(2)
    expect(res.expandedFolderIds.has('f-auth')).toBe(true)
  })

  it('matches root request outside of any folder', () => {
    const res = filterTree(mockTree, 'healthz')
    expect(res.filtered.length).toBe(1)
    expect(res.filtered[0].id).toBe('req-root-ping')
    expect(res.expandedFolderIds.size).toBe(0)
  })

  it('matches overrides for active request if URL or body was modified in memory', () => {
    const overrides = {
      activeRequestId: 'req-root-ping',
      activeRequestUrl: 'https://api.example.com/custom-diagnostic',
      activeRequestBody: 'debug_token_12345'
    }

    const resUrl = filterTree(mockTree, 'custom-diagnostic', overrides)
    expect(resUrl.filtered.length).toBe(1)
    expect(resUrl.filtered[0].id).toBe('req-root-ping')

    const resBody = filterTree(mockTree, 'debug_token_12345', overrides)
    expect(resBody.filtered.length).toBe(1)
    expect(resBody.filtered[0].id).toBe('req-root-ping')
  })

  it('returns empty filtered list when no matches are found', () => {
    const res = filterTree(mockTree, 'non-existent-pattern-xyz')
    expect(res.filtered.length).toBe(0)
    expect(res.expandedFolderIds.size).toBe(0)
  })

  describe('filterFlowTree and matchesFlowTreeNode', () => {
    const mockFlowTree: FlowTreeNode[] = [
      {
        id: 'ff-checkout',
        name: 'Checkout Suites',
        type: 'flow_folder',
        path: 'flows/checkout',
        created_at: '',
        children: [
          {
            id: 'flow-payment',
            name: 'Stripe Payment Flow',
            type: 'flow',
            description: 'Validates 3DS card charge and webhook callback',
            path: 'flows/checkout/payment.json',
            created_at: ''
          }
        ]
      },
      {
        id: 'flow-smoke',
        name: 'Smoke Test',
        type: 'flow',
        description: 'Quick sanity check',
        path: 'flows/smoke.json',
        created_at: ''
      }
    ]

    it('matches flow by description and expands ancestor flow_folder', () => {
      const res = filterFlowTree(mockFlowTree, 'webhook callback')
      expect(res.filtered).toHaveLength(1)
      expect(res.filtered[0].id).toBe('ff-checkout')
      expect(res.filtered[0].children?.[0].id).toBe('flow-payment')
      expect(res.expandedFolderIds.has('ff-checkout')).toBe(true)
    })

    it('matches flow_folder by name and preserves its children', () => {
      const res = filterFlowTree(mockFlowTree, 'Checkout Suites')
      expect(res.filtered).toHaveLength(1)
      expect(res.filtered[0].id).toBe('ff-checkout')
      expect(res.filtered[0].children).toHaveLength(1)
      expect(res.expandedFolderIds.has('ff-checkout')).toBe(true)
    })

    it('respects activeFlowOverrides for unsaved in-memory name and description', () => {
      const overrides = {
        activeFlowId: 'flow-smoke',
        activeFlowName: 'Renamed In Memory Smoke',
        activeFlowDescription: 'Unsaved custom description token 999'
      }
      expect(matchesFlowTreeNode(mockFlowTree[1], 'renamed in memory', overrides)).toBe(true)
      expect(matchesFlowTreeNode(mockFlowTree[1], 'token 999', overrides)).toBe(true)

      const res = filterFlowTree(mockFlowTree, 'token 999', overrides)
      expect(res.filtered).toHaveLength(1)
      expect(res.filtered[0].id).toBe('flow-smoke')
    })
  })
})

