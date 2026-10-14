export const BYTES_PER_MB = 1024 * 1024

export const NFR_THRESHOLDS = {
  MAX_BOOT_TIME_MS: 2000,
  WARN_RAM_MB: 80,
  MAX_RAM_MB: 100,
  WARN_RAM_BYTES: 80 * BYTES_PER_MB,
  MAX_RAM_BYTES: 100 * BYTES_PER_MB
} as const

export type NfrStatus = 'PASS' | 'WARN' | 'FAIL'

export interface NfrMemorySample {
  label: string
  timestampIso: string
  usedHeapBytes: number
  totalHeapBytes: number
  usedHeapMB: number
  totalHeapMB: number
}

export interface NfrMetricsInput {
  bootTimeMs: number
  domContentLoadedMs?: number
  loadEventMs?: number
  baselineRamBytes: number
  peakRamBytes?: number
  samples?: NfrMemorySample[]
}

export interface NfrEvaluatedMetrics {
  status: NfrStatus
  bootPassed: boolean
  ramPassed: boolean
  bootTimeMs: number
  domContentLoadedMs: number
  loadEventMs: number
  baselineRamBytes: number
  peakRamBytes: number
  baselineRamMB: number
  peakRamMB: number
  thresholds: {
    maxBootTimeMs: number
    warnRamMB: number
    maxRamMB: number
    warnRamBytes: number
    maxRamBytes: number
  }
  warnings: string[]
  failures: string[]
  samples: NfrMemorySample[]
  evaluatedAtIso: string
}

export function normalizeIntegerMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return -1
  return Math.ceil(value)
}

export function normalizeIntegerBytes(value: number): number {
  if (!Number.isFinite(value) || value < 0) return -1
  return Math.ceil(value)
}

export function bytesToIntegerMB(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes < 0) return -1
  if (bytes === 0) return 0
  return Math.ceil(bytes / BYTES_PER_MB)
}

export function evaluateNfrMetrics(
  input: NfrMetricsInput,
  now: Date = new Date()
): NfrEvaluatedMetrics {
  const warnings: string[] = []
  const failures: string[] = []

  const bootTimeMs = normalizeIntegerMs(input.bootTimeMs)
  const domContentLoadedMs =
    input.domContentLoadedMs !== undefined
      ? normalizeIntegerMs(input.domContentLoadedMs)
      : 0
  const loadEventMs =
    input.loadEventMs !== undefined
      ? normalizeIntegerMs(input.loadEventMs)
      : 0

  const rawSamples = input.samples
  const hasExplicitEmptySamples = Array.isArray(rawSamples) && rawSamples.length === 0
  let hasInvalidSample = false

  const normalizedSamples: NfrMemorySample[] = Array.isArray(rawSamples)
    ? rawSamples.map((s) => {
        const usedHeapBytes = normalizeIntegerBytes(s.usedHeapBytes)
        const rawTotalBytes = normalizeIntegerBytes(s.totalHeapBytes)
        if (usedHeapBytes < 0 || rawTotalBytes < 0) {
          hasInvalidSample = true
        }
        const totalHeapBytes =
          usedHeapBytes >= 0 && rawTotalBytes >= 0
            ? Math.max(usedHeapBytes, rawTotalBytes)
            : rawTotalBytes
        return {
          label: s.label,
          timestampIso: s.timestampIso,
          usedHeapBytes,
          totalHeapBytes,
          usedHeapMB: bytesToIntegerMB(usedHeapBytes),
          totalHeapMB: bytesToIntegerMB(totalHeapBytes)
        }
      })
    : []

  const baselineRamBytes = normalizeIntegerBytes(input.baselineRamBytes)
  const maxSampleBytes =
    normalizedSamples.length > 0
      ? Math.max(...normalizedSamples.map((s) => s.usedHeapBytes))
      : -1

  const rawPeakBytes =
    input.peakRamBytes !== undefined
      ? normalizeIntegerBytes(input.peakRamBytes)
      : Math.max(baselineRamBytes, maxSampleBytes)

  const peakRamBytes =
    rawPeakBytes >= 0 && baselineRamBytes >= 0
      ? Math.max(baselineRamBytes, rawPeakBytes, maxSampleBytes)
      : rawPeakBytes

  const baselineRamMB = bytesToIntegerMB(baselineRamBytes)
  const peakRamMB = bytesToIntegerMB(peakRamBytes)

  let bootPassed = true
  if (bootTimeMs < 0) {
    bootPassed = false
    failures.push('Invalid bootTimeMs measurement (must be a non-negative finite number)')
  } else if (bootTimeMs > NFR_THRESHOLDS.MAX_BOOT_TIME_MS) {
    bootPassed = false
    failures.push(
      `Startup bootTimeMs (${bootTimeMs} ms) exceeded NFR budget (${NFR_THRESHOLDS.MAX_BOOT_TIME_MS} ms)`
    )
  }

  if (domContentLoadedMs < 0 || loadEventMs < 0) {
    bootPassed = false
    failures.push(
      'Invalid domContentLoadedMs or loadEventMs measurement (must be a non-negative finite number)'
    )
  }

  let ramPassed = true
  if (hasExplicitEmptySamples) {
    ramPassed = false
    failures.push('Memory sample list cannot be empty when provided')
  }

  if (hasInvalidSample) {
    ramPassed = false
    failures.push('Invalid memory sample measurement (usedHeapBytes/totalHeapBytes must be non-negative finite numbers)')
  }

  if (baselineRamBytes < 0 || peakRamBytes < 0) {
    ramPassed = false
    failures.push('Invalid RAM measurement (must be a non-negative finite byte count)')
  } else {
    if (baselineRamBytes > NFR_THRESHOLDS.MAX_RAM_BYTES) {
      ramPassed = false
      failures.push(
        `Baseline RAM (${baselineRamMB} MB / ${baselineRamBytes} bytes) exceeded NFR hard limit (${NFR_THRESHOLDS.MAX_RAM_MB} MB)`
      )
    } else if (baselineRamBytes > NFR_THRESHOLDS.WARN_RAM_BYTES) {
      warnings.push(
        `Baseline RAM (${baselineRamMB} MB / ${baselineRamBytes} bytes) is within warning zone (${NFR_THRESHOLDS.WARN_RAM_MB}-${NFR_THRESHOLDS.MAX_RAM_MB} MB)`
      )
    }

    if (peakRamBytes > NFR_THRESHOLDS.MAX_RAM_BYTES) {
      ramPassed = false
      failures.push(
        `Peak execution RAM (${peakRamMB} MB / ${peakRamBytes} bytes) exceeded NFR hard limit (${NFR_THRESHOLDS.MAX_RAM_MB} MB)`
      )
    } else if (peakRamBytes > NFR_THRESHOLDS.WARN_RAM_BYTES) {
      warnings.push(
        `Peak execution RAM (${peakRamMB} MB / ${peakRamBytes} bytes) is within warning zone (${NFR_THRESHOLDS.WARN_RAM_MB}-${NFR_THRESHOLDS.MAX_RAM_MB} MB)`
      )
    }
  }

  let status: NfrStatus = 'PASS'
  if (!bootPassed || !ramPassed || failures.length > 0) {
    status = 'FAIL'
  } else if (warnings.length > 0) {
    status = 'WARN'
  }

  return {
    status,
    bootPassed,
    ramPassed,
    bootTimeMs,
    domContentLoadedMs,
    loadEventMs,
    baselineRamBytes,
    peakRamBytes,
    baselineRamMB,
    peakRamMB,
    thresholds: {
      maxBootTimeMs: NFR_THRESHOLDS.MAX_BOOT_TIME_MS,
      warnRamMB: NFR_THRESHOLDS.WARN_RAM_MB,
      maxRamMB: NFR_THRESHOLDS.MAX_RAM_MB,
      warnRamBytes: NFR_THRESHOLDS.WARN_RAM_BYTES,
      maxRamBytes: NFR_THRESHOLDS.MAX_RAM_BYTES
    },
    warnings,
    failures,
    samples: normalizedSamples,
    evaluatedAtIso: now.toISOString()
  }
}

export function formatNfrMarkdownSummary(metrics: NfrEvaluatedMetrics): string {
  const baselineResult: NfrStatus =
    metrics.baselineRamBytes < 0 || metrics.baselineRamBytes > metrics.thresholds.maxRamBytes
      ? 'FAIL'
      : metrics.baselineRamBytes > metrics.thresholds.warnRamBytes
        ? 'WARN'
        : 'PASS'

  const peakResult: NfrStatus =
    metrics.peakRamBytes < 0 || metrics.peakRamBytes > metrics.thresholds.maxRamBytes
      ? 'FAIL'
      : metrics.peakRamBytes > metrics.thresholds.warnRamBytes
        ? 'WARN'
        : 'PASS'

  const lines: string[] = [
    '# Hecto API - NFR Performance Benchmark Summary',
    '',
    `- **Overall Status**: **${metrics.status}**`,
    `- **Evaluated At**: \`${metrics.evaluatedAtIso}\``,
    '',
    '## Threshold Evaluation',
    '',
    '| Metric | Measured Value | Budget / Threshold | Result |',
    '|--------|---------------|--------------------|--------|',
    `| Cold Start (` + '`bootTimeMs`' + `) | ${metrics.bootTimeMs} ms | <= ${metrics.thresholds.maxBootTimeMs} ms | ${metrics.bootPassed ? 'PASS' : 'FAIL'} |`,
    `| DOM Content Loaded | ${metrics.domContentLoadedMs} ms | Informational | INFO |`,
    `| Load Event | ${metrics.loadEventMs} ms | Informational | INFO |`,
    `| Baseline RAM | ${metrics.baselineRamMB} MB (${metrics.baselineRamBytes} B) | <= ${metrics.thresholds.maxRamMB} MB (Warn > ${metrics.thresholds.warnRamMB} MB) | ${baselineResult} |`,
    `| Peak Execution RAM | ${metrics.peakRamMB} MB (${metrics.peakRamBytes} B) | <= ${metrics.thresholds.maxRamMB} MB | ${peakResult} |`
  ]

  if (metrics.warnings.length > 0) {
    lines.push('', '## Warnings', '')
    for (const warning of metrics.warnings) {
      lines.push(`- ⚠️ ${warning}`)
    }
  }

  if (metrics.failures.length > 0) {
    lines.push('', '## Failures', '')
    for (const failure of metrics.failures) {
      lines.push(`- ❌ ${failure}`)
    }
  }

  if (metrics.samples.length > 0) {
    lines.push(
      '',
      '## Memory Samples',
      '',
      '| Step / Label | Used Heap (MB) | Used Heap (Bytes) | Total Heap (MB) | Timestamp |',
      '|--------------|----------------|-------------------|-----------------|-----------|'
    )
    for (const sample of metrics.samples) {
      lines.push(
        `| ${sample.label} | ${sample.usedHeapMB} MB | ${sample.usedHeapBytes} B | ${sample.totalHeapMB} MB | \`${sample.timestampIso}\` |`
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}
