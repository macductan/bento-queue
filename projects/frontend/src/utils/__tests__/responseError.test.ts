import { describe, it, expect } from 'vitest'
import { errorVariant } from '../responseError'

describe('responseError', () => {
  it('should return timeout for TIMEOUT code', () => {
    expect(errorVariant({ code: 'TIMEOUT', message: '' })).toBe('timeout')
  })

  it('should return ssl for CONNECTION_ERROR with SSL prefix', () => {
    expect(errorVariant({ code: 'CONNECTION_ERROR', message: 'Lỗi chứng chỉ SSL: expired' })).toBe('ssl')
  })

  it('should return connection for other CONNECTION_ERROR messages', () => {
    expect(errorVariant({ code: 'CONNECTION_ERROR', message: 'Lỗi kết nối: connection refused' })).toBe('connection')
  })

  it('should return unknown for anything else', () => {
    expect(errorVariant({ code: 'UNKNOWN', message: 'Something went wrong' })).toBe('unknown')
  })
})
