import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResponseStore } from '../responseStore'
import { useRequestStore } from '../requestStore'
import { useEnvironmentStore } from '../environmentStore'
import * as buildExecuteRequestModule from '../../utils/buildExecuteRequest'
import { createMockRequest } from './utils'

import { SendRequest } from '../../../wailsjs/go/main/App'

vi.mock('../../../wailsjs/go/main/App', () => ({
  SendRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  AbortRequest: vi.fn().mockResolvedValue({})
}))

describe('responseStore integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should use buildExecuteRequest with variablesMap from environmentStore on send', async () => {
    const buildExecuteRequestSpy = vi.spyOn(buildExecuteRequestModule, 'buildExecuteRequest')
    const responseStore = useResponseStore()
    const requestStore = useRequestStore()
    const environmentStore = useEnvironmentStore()

    // Mock active request
    requestStore.current = createMockRequest({ url: 'http://{{host}}/test' })

    // Mock environment state
    environmentStore.environments = [
      { id: 'env1', name: 'Dev', variables: [{ key: 'host', value: 'localhost', enabled: true }], created_at: '', updated_at: '' } as any
    ]
    environmentStore.setActive('env1')
    
    expect(environmentStore.variablesMap.get('host')).toBe('localhost')

    await responseStore.send()

    expect(buildExecuteRequestSpy).toHaveBeenCalledTimes(1)
    expect(buildExecuteRequestSpy).toHaveBeenCalledWith(
      requestStore.current,
      environmentStore.variablesMap,
      [],
      []
    )
  })

  it('should pass inherited headers from collection folder tree to buildExecuteRequest', async () => {
    const buildExecuteRequestSpy = vi.spyOn(buildExecuteRequestModule, 'buildExecuteRequest')
    const responseStore = useResponseStore()
    const requestStore = useRequestStore()
    const { useCollectionStore } = await import('../collectionStore')
    const collectionStore = useCollectionStore()

    requestStore.current = createMockRequest({ id: 'req-in-folder', url: 'http://example.com' })
    collectionStore.tree = [
      {
        id: 'f1',
        name: 'Folder 1',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        headers: [{ key: 'X-Folder-Auth', value: 'secret', enabled: true }],
        children: [
          {
            id: 'req-in-folder',
            name: 'Req',
            type: 'request',
            path: '/coll/f1/req.json',
            created_at: ''
          }
        ]
      }
    ]

    await responseStore.send()

    expect(buildExecuteRequestSpy).toHaveBeenCalledTimes(1)
    expect(buildExecuteRequestSpy).toHaveBeenCalledWith(
      requestStore.current,
      expect.any(Map),
      [
        { key: 'X-Folder-Auth', value: 'secret', enabled: true, folderLevel: 1, folderName: 'Folder 1' }
      ],
      expect.any(Array)
    )
  })

  it('should pass folder node with auth to buildExecuteRequest and forward to SendRequest', async () => {
    const responseStore = useResponseStore()
    const requestStore = useRequestStore()
    const { useCollectionStore } = await import('../collectionStore')
    const collectionStore = useCollectionStore()

    requestStore.current = createMockRequest({
      id: 'req-auth-folder',
      url: 'http://example.com/profile',
      auth: { type: 'inherit' }
    })
    collectionStore.tree = [
      {
        id: 'f1',
        name: 'Auth Folder',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        auth: { type: 'bearer', bearer: { token: 'folder-bearer-token' } },
        children: [
          {
            id: 'req-auth-folder',
            name: 'Profile',
            type: 'request',
            path: '/coll/f1/profile.json',
            created_at: ''
          }
        ]
      }
    ]

    await responseStore.send()

    expect(SendRequest).toHaveBeenCalledTimes(1)
    const sentReq = (SendRequest as any).mock.calls[0][0]
    expect(sentReq.headers).toContainEqual({
      key: 'Authorization',
      value: 'Bearer folder-bearer-token',
      enabled: true
    })
  })
})
