import { describe, it, expect } from 'vitest'
import {
  BYTES_PER_MB,
  NFR_THRESHOLDS,
  normalizeIntegerMs,
  normalizeIntegerBytes,
  bytesToIntegerMB,
  evaluateNfrMetrics,
  formatNfrMarkdownSummary
} from '../performanceMetrics'

describe('performanceMetrics utility', () => {
  const fixedNow = new Date('2026-10-14T08:00:00.000Z')

  describe('integer normalization helpers', () => {
    it('normalizes floating point milliseconds and bytes to integers using Math.ceil', () => {
      expect(normalizeIntegerMs(450.4)).toBe(451)
      expect(normalizeIntegerMs(2000.4)).toBe(2001)
      expect(normalizeIntegerMs(0)).toBe(0)
      expect(normalizeIntegerBytes(1048576.1)).toBe(1048577)
      expect(bytesToIntegerMB(0)).toBe(0)
      expect(bytesToIntegerMB(1)).toBe(1)
      expect(bytesToIntegerMB(25 * BYTES_PER_MB)).toBe(25)
      expect(bytesToIntegerMB(25 * BYTES_PER_MB + 100)).toBe(26)
    })

    it('returns -1 for negative or non-finite values', () => {
      expect(normalizeIntegerMs(-10)).toBe(-1)
      expect(normalizeIntegerMs(Number.NaN)).toBe(-1)
      expect(normalizeIntegerMs(Number.POSITIVE_INFINITY)).toBe(-1)
      expect(normalizeIntegerBytes(-1)).toBe(-1)
      expect(normalizeIntegerBytes(Number.NaN)).toBe(-1)
      expect(bytesToIntegerMB(-500)).toBe(-1)
      expect(bytesToIntegerMB(Number.NaN)).toBe(-1)
    })
  })

  describe('evaluateNfrMetrics - I/O & Edge-Case Matrix', () => {
    it('returns PASS when startup (< 2000ms) and memory (<= 80MB) meet NFR budget with integer values', () => {
      const result = evaluateNfrMetrics(
        {
          bootTimeMs: 450.3,
          domContentLoadedMs: 210.8,
          loadEventMs: 390.2,
          baselineRamBytes: 25 * BYTES_PER_MB,
          peakRamBytes: 32 * BYTES_PER_MB,
          samples: [
            {
              label: 'baseline-post-boot',
              timestampIso: '2026-10-14T08:00:00.000Z',
              usedHeapBytes: 25 * BYTES_PER_MB,
              totalHeapBytes: 35 * BYTES_PER_MB,
              usedHeapMB: 25,
              totalHeapMB: 35
            },
            {
              label: 'after-crud-execution',
              timestampIso: '2026-10-14T08:00:01.000Z',
              usedHeapBytes: 32 * BYTES_PER_MB,
              totalHeapBytes: 40 * BYTES_PER_MB,
              usedHeapMB: 32,
              totalHeapMB: 40
            }
          ]
        },
        fixedNow
      )

      expect(result.status).toBe('PASS')
      expect(result.bootPassed).toBe(true)
      expect(result.ramPassed).toBe(true)
      expect(result.warnings).toEqual([])
      expect(result.failures).toEqual([])
      expect(Number.isInteger(result.bootTimeMs)).toBe(true)
      expect(result.bootTimeMs).toBe(451)
      expect(result.domContentLoadedMs).toBe(211)
      expect(result.loadEventMs).toBe(391)
      expect(Number.isInteger(result.baselineRamBytes)).toBe(true)
      expect(Number.isInteger(result.peakRamBytes)).toBe(true)
      expect(result.baselineRamMB).toBe(25)
      expect(result.peakRamMB).toBe(32)
      expect(result.thresholds.maxBootTimeMs).toBe(NFR_THRESHOLDS.MAX_BOOT_TIME_MS)
      expect(result.thresholds.maxRamMB).toBe(NFR_THRESHOLDS.MAX_RAM_MB)
      expect(result.thresholds.warnRamMB).toBe(NFR_THRESHOLDS.WARN_RAM_MB)
    })

    it('returns PASS at exact boundary values (bootTimeMs = 2000, baselineRam = 80MB)', () => {
      const result = evaluateNfrMetrics(
        {
          bootTimeMs: 2000,
          baselineRamBytes: 80 * BYTES_PER_MB,
          peakRamBytes: 80 * BYTES_PER_MB
        },
        fixedNow
      )

      expect(result.status).toBe('PASS')
      expect(result.bootPassed).toBe(true)
      expect(result.ramPassed).toBe(true)
      expect(result.warnings).toHaveLength(0)
      expect(result.failures).toHaveLength(0)
    })

    it('returns WARN when both baseline and peak RAM are in warning zone (80 MB < RAM <= 100 MB)', () => {
      const result = evaluateNfrMetrics(
        {
          bootTimeMs: 800,
          baselineRamBytes: 85 * BYTES_PER_MB,
          peakRamBytes: 90 * BYTES_PER_MB
        },
        fixedNow
      )

      expect(result.status).toBe('WARN')
      expect(result.bootPassed).toBe(true)
      expect(result.ramPassed).toBe(true)
      expect(result.warnings).toHaveLength(2)
      expect(result.warnings[0]).toContain('85 MB')
      expect(result.warnings[1]).toContain('90 MB')
      expect(result.failures).toEqual([])
    })

    it('returns WARN when baseline RAM <= 80 MB and peak RAM is in warning zone (explicit or derived from samples)', () => {
      const explicitPeakWarn = evaluateNfrMetrics(
        {
          bootTimeMs: 700,
          baselineRamBytes: 40 * BYTES_PER_MB,
          peakRamBytes: 88 * BYTES_PER_MB
        },
        fixedNow
      )

      expect(explicitPeakWarn.status).toBe('WARN')
      expect(explicitPeakWarn.warnings).toHaveLength(1)
      expect(explicitPeakWarn.warnings[0]).toContain('88 MB')

      const sampleDerivedPeakWarn = evaluateNfrMetrics(
        {
          bootTimeMs: 700,
          baselineRamBytes: 40 * BYTES_PER_MB,
          samples: [
            {
              label: 'spike',
              timestampIso: '2026-10-14T08:00:00.000Z',
              usedHeapBytes: 86 * BYTES_PER_MB,
              totalHeapBytes: 95 * BYTES_PER_MB,
              usedHeapMB: 86,
              totalHeapMB: 95
            }
          ]
        },
        fixedNow
      )

      expect(sampleDerivedPeakWarn.status).toBe('WARN')
      expect(sampleDerivedPeakWarn.peakRamMB).toBe(86)
      expect(sampleDerivedPeakWarn.warnings).toHaveLength(1)
      expect(sampleDerivedPeakWarn.warnings[0]).toContain('86 MB')
    })

    it('returns FAIL when bootTimeMs exceeds 2000 ms (including fractional 2000.4 ms)', () => {
      const result = evaluateNfrMetrics(
        {
          bootTimeMs: 2000.4,
          baselineRamBytes: 25 * BYTES_PER_MB
        },
        fixedNow
      )

      expect(result.status).toBe('FAIL')
      expect(result.bootPassed).toBe(false)
      expect(result.ramPassed).toBe(true)
      expect(result.failures.some((f) => f.includes('2001 ms'))).toBe(true)
    })

    it('returns FAIL when baseline or peak RAM exceeds 100 MB', () => {
      const baselineFail = evaluateNfrMetrics(
        {
          bootTimeMs: 500,
          baselineRamBytes: 101 * BYTES_PER_MB,
          peakRamBytes: 105 * BYTES_PER_MB
        },
        fixedNow
      )

      expect(baselineFail.status).toBe('FAIL')
      expect(baselineFail.bootPassed).toBe(true)
      expect(baselineFail.ramPassed).toBe(false)
      expect(baselineFail.failures.some((f) => f.includes('101 MB'))).toBe(true)

      const peakFail = evaluateNfrMetrics(
        {
          bootTimeMs: 500,
          baselineRamBytes: 40 * BYTES_PER_MB,
          peakRamBytes: 105 * BYTES_PER_MB
        },
        fixedNow
      )

      expect(peakFail.status).toBe('FAIL')
      expect(peakFail.bootPassed).toBe(true)
      expect(peakFail.ramPassed).toBe(false)
      expect(peakFail.failures.some((f) => f.includes('105 MB'))).toBe(true)
    })

    it('returns FAIL when inputs or samples are invalid (negative, NaN, or empty samples array)', () => {
      const negativeBoot = evaluateNfrMetrics(
        {
          bootTimeMs: -10,
          baselineRamBytes: 20 * BYTES_PER_MB
        },
        fixedNow
      )
      expect(negativeBoot.status).toBe('FAIL')
      expect(negativeBoot.bootPassed).toBe(false)

      const invalidDcl = evaluateNfrMetrics(
        {
          bootTimeMs: 400,
          domContentLoadedMs: -5,
          baselineRamBytes: 20 * BYTES_PER_MB
        },
        fixedNow
      )
      expect(invalidDcl.status).toBe('FAIL')
      expect(invalidDcl.bootPassed).toBe(false)

      const nanInput = evaluateNfrMetrics(
        {
          bootTimeMs: Number.NaN,
          baselineRamBytes: Number.NaN
        },
        fixedNow
      )
      expect(nanInput.status).toBe('FAIL')
      expect(nanInput.bootPassed).toBe(false)
      expect(nanInput.ramPassed).toBe(false)

      const emptySamples = evaluateNfrMetrics(
        {
          bootTimeMs: 400,
          baselineRamBytes: 20 * BYTES_PER_MB,
          samples: []
        },
        fixedNow
      )
      expect(emptySamples.status).toBe('FAIL')
      expect(emptySamples.ramPassed).toBe(false)
      expect(emptySamples.failures.some((f) => f.includes('empty'))).toBe(true)

      const corruptedSample = evaluateNfrMetrics(
        {
          bootTimeMs: 400,
          baselineRamBytes: 20 * BYTES_PER_MB,
          samples: [
            {
              label: 'corrupted',
              timestampIso: '2026-10-14T08:00:00.000Z',
              usedHeapBytes: -1,
              totalHeapBytes: Number.NaN,
              usedHeapMB: -1,
              totalHeapMB: -1
            }
          ]
        },
        fixedNow
      )
      expect(corruptedSample.status).toBe('FAIL')
      expect(corruptedSample.ramPassed).toBe(false)
      expect(corruptedSample.failures.some((f) => f.includes('Invalid memory sample'))).toBe(true)
    })
  })

  describe('formatNfrMarkdownSummary', () => {
    it('renders independent row statuses when baseline PASSes and peak WARNs or FAILs', () => {
      const peakWarnEvaluated = evaluateNfrMetrics(
        {
          bootTimeMs: 620,
          domContentLoadedMs: 310,
          loadEventMs: 500,
          baselineRamBytes: 30 * BYTES_PER_MB,
          peakRamBytes: 88 * BYTES_PER_MB,
          samples: [
            {
              label: 'baseline',
              timestampIso: '2026-10-14T08:00:00.000Z',
              usedHeapBytes: 30 * BYTES_PER_MB,
              totalHeapBytes: 40 * BYTES_PER_MB,
              usedHeapMB: 30,
              totalHeapMB: 40
            }
          ]
        },
        fixedNow
      )

      const warnMd = formatNfrMarkdownSummary(peakWarnEvaluated)
      expect(warnMd).toContain('# Hecto API - NFR Performance Benchmark Summary')
      expect(warnMd).toContain('**Overall Status**: **WARN**')
      expect(warnMd).toMatch(/\| Baseline RAM \| 30 MB .* \| PASS \|/)
      expect(warnMd).toMatch(/\| Peak Execution RAM \| 88 MB .* \| WARN \|/)

      const peakFailEvaluated = evaluateNfrMetrics(
        {
          bootTimeMs: 620,
          baselineRamBytes: 30 * BYTES_PER_MB,
          peakRamBytes: 105 * BYTES_PER_MB
        },
        fixedNow
      )

      const failMd = formatNfrMarkdownSummary(peakFailEvaluated)
      expect(failMd).toContain('**Overall Status**: **FAIL**')
      expect(failMd).toMatch(/\| Baseline RAM \| 30 MB .* \| PASS \|/)
      expect(failMd).toMatch(/\| Peak Execution RAM \| 105 MB .* \| FAIL \|/)
    })
  })
})
