import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRequestStore } from '../requestStore'

// Mock wails calls
vi.mock('../../../wailsjs/go/main/App', () => ({
  GetRequest: vi.fn(),
  SaveRequest: vi.fn()
}))

import { createMockRequest } from "./utils"


describe('requestStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should auto-add Content-Type header when changing to JSON', () => {
    const store = useRequestStore()
    store.current = createMockRequest()

    store.setBodyType('json')
    expect(store.contentTypeAuto).toBe(true)
    expect(store.current.headers).toHaveLength(1)
    expect(store.current.headers[0]).toEqual({
      key: 'Content-Type',
      value: 'application/json',
      enabled: true,
      _isAuto: true
    })
    expect(store.current.body.type).toBe('json')
  })

  it('should remove auto-added Content-Type header when changing to none/text', () => {
    const store = useRequestStore()
    store.current = createMockRequest({
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true },
        { key: 'Authorization', value: 'Bearer token', enabled: true }
      ],
      body: { type: 'json', content: '{}' }
    })
    store.contentTypeAuto = true

    store.setBodyType('none')
    expect(store.contentTypeAuto).toBe(false)
    expect(store.current.headers).toHaveLength(1)
    expect(store.current.headers[0].key).toBe('Authorization')
    expect(store.current.body.type).toBe('none')
  })

  it('should not add Content-Type if one already exists when changing to JSON', () => {
    const store = useRequestStore()
    store.current = createMockRequest({
      headers: [
        { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }
      ]
    })
    
    store.setBodyType('json')
    expect(store.contentTypeAuto).toBe(false)
    expect(store.current.headers).toHaveLength(1)
    expect(store.current.headers[0].value).toBe('application/x-www-form-urlencoded')
  })
})
