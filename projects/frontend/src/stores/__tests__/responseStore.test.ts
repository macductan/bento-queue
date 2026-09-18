import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResponseStore } from '../responseStore'
import { useRequestStore } from '../requestStore'
import { useEnvironmentStore } from '../environmentStore'
import * as buildExecuteRequestModule from '../../utils/buildExecuteRequest'

vi.mock('../../wailsjs/go/main/App', () => ({
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
    requestStore.current = {
      id: 'req1',
      name: 'Req',
      method: 'GET',
      url: 'http://{{host}}/test',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '',
      updated_at: ''
    }

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
      environmentStore.variablesMap
    )
  })
})
