import { describe, it, expect } from 'vitest'
import { flattenHeaders } from '../responseHeaders'

describe('responseHeaders', () => {
  it('should return empty array for null or undefined', () => {
    expect(flattenHeaders(null)).toEqual([])
    expect(flattenHeaders(undefined)).toEqual([])
  })

  it('should flatten and sort headers alphabetically by key', () => {
    const input = {
      'X-Content-Type-Options': ['nosniff'],
      'Content-Type': ['application/json', 'text/html'],
      'accept': ['*/*']
    }
    const output = flattenHeaders(input)
    
    expect(output).toEqual([
      { key: 'accept', value: '*/*' },
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Content-Type', value: 'text/html' },
      { key: 'X-Content-Type-Options', value: 'nosniff' }
    ])
  })
})
