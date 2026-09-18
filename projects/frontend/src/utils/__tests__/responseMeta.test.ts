import { describe, it, expect } from 'vitest'
import { formatSize, statusTone, formatTimestamp } from '../responseMeta'

describe('responseMeta', () => {
  describe('formatSize', () => {
    it('should format bytes correctly', () => {
      expect(formatSize(500)).toBe('500 B')
      expect(formatSize(1024)).toBe('1 KB')
      expect(formatSize(1500)).toBe('1 KB') // Uses Math.floor
      expect(formatSize(2048)).toBe('2 KB')
      expect(formatSize(-10)).toBe('0 B')
    })
  })

  describe('statusTone', () => {
    it('should map status codes correctly', () => {
      expect(statusTone(200)).toBe('2xx')
      expect(statusTone(204)).toBe('2xx')
      expect(statusTone(301)).toBe('3xx')
      expect(statusTone(404)).toBe('4xx')
      expect(statusTone(500)).toBe('5xx')
      expect(statusTone(0)).toBe('other')
      expect(statusTone(100)).toBe('other')
    })
  })

  describe('formatTimestamp', () => {
    it('should format as "Hôm nay, HH:MM:SS" if it is today', () => {
      const now = new Date('2026-10-07T12:00:00')
      const target = new Date('2026-10-07T08:30:15')
      expect(formatTimestamp(target.toISOString(), now)).toBe('Hôm nay, 08:30:15')
    })

    it('should format as "DD/MM/YYYY, HH:MM:SS" if not today', () => {
      const now = new Date('2026-10-07T12:00:00')
      const target = new Date('2026-10-06T15:45:00')
      expect(formatTimestamp(target.toISOString(), now)).toBe('06/10/2026, 15:45:00')
    })

    it('should return null for invalid date', () => {
      expect(formatTimestamp('invalid date')).toBeNull()
      expect(formatTimestamp('')).toBeNull()
    })
  })
})
