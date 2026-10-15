import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CDPSession, Page } from '@playwright/test'
import {
  bytesToIntegerMB,
  evaluateNfrMetrics,
  formatNfrMarkdownSummary,
  normalizeIntegerBytes,
  normalizeIntegerMs,
  type NfrEvaluatedMetrics,
  type NfrMemorySample
} from '../../src/utils/performanceMetrics'

export const TEST_RESULTS_DIR = path.resolve(process.cwd(), 'test-results')
export const NFR_METRICS_JSON_PATH = path.join(TEST_RESULTS_DIR, 'nfr-performance-metrics.json')
export const NFR_SUMMARY_MD_PATH = path.join(TEST_RESULTS_DIR, 'nfr-performance-summary.md')

export interface StartupTimingResult {
  bootTimeMs: number
  domContentLoadedMs: number
  loadEventMs: number
}

export async function measureColdStart(page: Page, url: string = '/'): Promise<StartupTimingResult> {
  const navStartWall = performance.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Thêm mới').waitFor({ state: 'visible' })
  const wallElapsedMs = normalizeIntegerMs(performance.now() - navStartWall)

  const navTimings = await page.evaluate(() => {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    const nav = entries[0]
    if (!nav) {
      return {
        domContentLoadedMs: 0,
        loadEventMs: 0
      }
    }
    const dcl = nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd - nav.startTime : performance.now()
    const load = nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : dcl
    return {
      domContentLoadedMs: Math.max(0, Math.ceil(dcl)),
      loadEventMs: Math.max(0, Math.ceil(load))
    }
  })

  const bootTimeMs = Math.max(1, wallElapsedMs, normalizeIntegerMs(navTimings.loadEventMs))

  return {
    bootTimeMs: normalizeIntegerMs(bootTimeMs),
    domContentLoadedMs: normalizeIntegerMs(navTimings.domContentLoadedMs),
    loadEventMs: normalizeIntegerMs(navTimings.loadEventMs)
  }
}

export async function collectMemorySample(page: Page, label: string): Promise<NfrMemorySample> {
  let usedHeapBytes = -1
  let totalHeapBytes = -1
  let cdpSession: CDPSession | null = null

  try {
    cdpSession = await page.context().newCDPSession(page)
    await cdpSession.send('Performance.enable')
    const { metrics } = await cdpSession.send('Performance.getMetrics')

    const usedMetric = metrics.find((m) => m.name === 'JSHeapUsedSize')
    const totalMetric = metrics.find((m) => m.name === 'JSHeapTotalSize')

    if (usedMetric && Number.isFinite(usedMetric.value) && usedMetric.value > 0) {
      usedHeapBytes = normalizeIntegerBytes(usedMetric.value)
    }
    if (totalMetric && Number.isFinite(totalMetric.value) && totalMetric.value > 0) {
      totalHeapBytes = normalizeIntegerBytes(totalMetric.value)
    }
  } catch {
    // Fallback to window.performance.memory when CDP is unavailable
  } finally {
    await cdpSession?.detach().catch(() => {})
  }

  if (usedHeapBytes <= 0) {
    try {
      const fallbackMem = await page.evaluate(() => {
        const perf = performance as unknown as {
          memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number }
        }
        return {
          used: perf.memory?.usedJSHeapSize ?? -1,
          total: perf.memory?.totalJSHeapSize ?? -1
        }
      })
      if (fallbackMem.used > 0) {
        usedHeapBytes = normalizeIntegerBytes(fallbackMem.used)
        totalHeapBytes =
          fallbackMem.total > 0
            ? Math.max(usedHeapBytes, normalizeIntegerBytes(fallbackMem.total))
            : usedHeapBytes
      }
    } catch {
      usedHeapBytes = -1
      totalHeapBytes = -1
    }
  }

  const finalTotalBytes =
    usedHeapBytes > 0 && totalHeapBytes > 0 ? Math.max(usedHeapBytes, totalHeapBytes) : totalHeapBytes

  return {
    label,
    timestampIso: new Date().toISOString(),
    usedHeapBytes,
    totalHeapBytes: finalTotalBytes,
    usedHeapMB: bytesToIntegerMB(usedHeapBytes),
    totalHeapMB: bytesToIntegerMB(finalTotalBytes)
  }
}

export async function collectAndPersistPageNfrMetrics(
  page: Page,
  testTitle: string
): Promise<NfrEvaluatedMetrics | null> {
  try {
    if (page.isClosed() || page.url() === 'about:blank') {
      return null
    }

    const timing = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      const nav = entries[0]
      if (!nav) {
        return {
          bootTimeMs: -1,
          domContentLoadedMs: -1,
          loadEventMs: -1
        }
      }
      const dcl = nav.domContentLoadedEventEnd > 0 ? Math.ceil(nav.domContentLoadedEventEnd - nav.startTime) : 1
      const load = nav.loadEventEnd > 0 ? Math.ceil(nav.loadEventEnd - nav.startTime) : dcl
      return {
        bootTimeMs: Math.max(1, load),
        domContentLoadedMs: Math.max(1, dcl),
        loadEventMs: Math.max(1, load)
      }
    })

    const sample = await collectMemorySample(page, `fixture:${testTitle}`)
    const evaluated = evaluateNfrMetrics({
      bootTimeMs: timing.bootTimeMs,
      domContentLoadedMs: timing.domContentLoadedMs,
      loadEventMs: timing.loadEventMs,
      baselineRamBytes: sample.usedHeapBytes,
      peakRamBytes: sample.usedHeapBytes,
      samples: [sample]
    })

    mergeAndWriteNfrMetrics(evaluated)
    return evaluated
  } catch {
    return null
  }
}

export function readExistingMetricsArtifact(): NfrEvaluatedMetrics | null {
  try {
    if (!fs.existsSync(NFR_METRICS_JSON_PATH)) {
      return null
    }
    const raw = fs.readFileSync(NFR_METRICS_JSON_PATH, 'utf-8')
    return JSON.parse(raw) as NfrEvaluatedMetrics
  } catch {
    return null
  }
}

export function writeNfrMetricsArtifacts(metrics: NfrEvaluatedMetrics): {
  jsonPath: string
  markdownPath: string
} {
  fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true })
  fs.writeFileSync(NFR_METRICS_JSON_PATH, JSON.stringify(metrics, null, 2), 'utf-8')
  fs.writeFileSync(NFR_SUMMARY_MD_PATH, formatNfrMarkdownSummary(metrics), 'utf-8')
  return {
    jsonPath: NFR_METRICS_JSON_PATH,
    markdownPath: NFR_SUMMARY_MD_PATH
  }
}

export function mergeAndWriteNfrMetrics(metrics: NfrEvaluatedMetrics): {
  metrics: NfrEvaluatedMetrics
  jsonPath: string
  markdownPath: string
} {
  const existing = readExistingMetricsArtifact()
  if (!existing) {
    const paths = writeNfrMetricsArtifacts(metrics)
    return { metrics, ...paths }
  }

  const mergedSamples = [...(existing.samples ?? []), ...(metrics.samples ?? [])]
  const bootTimeMs =
    existing.bootTimeMs < 0 || metrics.bootTimeMs < 0
      ? Math.min(existing.bootTimeMs, metrics.bootTimeMs)
      : Math.max(existing.bootTimeMs, metrics.bootTimeMs)
  const domContentLoadedMs =
    existing.domContentLoadedMs < 0 || metrics.domContentLoadedMs < 0
      ? Math.min(existing.domContentLoadedMs, metrics.domContentLoadedMs)
      : Math.max(existing.domContentLoadedMs, metrics.domContentLoadedMs)
  const loadEventMs =
    existing.loadEventMs < 0 || metrics.loadEventMs < 0
      ? Math.min(existing.loadEventMs, metrics.loadEventMs)
      : Math.max(existing.loadEventMs, metrics.loadEventMs)
  const idleBaselineSample = mergedSamples.find(
    (s) => s.label === '01-baseline-idle-after-boot' && s.usedHeapBytes > 0
  )
  const baselineRamBytes =
    existing.baselineRamBytes < 0 || metrics.baselineRamBytes < 0
      ? Math.min(existing.baselineRamBytes, metrics.baselineRamBytes)
      : idleBaselineSample
        ? idleBaselineSample.usedHeapBytes
        : existing.baselineRamBytes > 0
          ? existing.baselineRamBytes
          : metrics.baselineRamBytes
  const peakRamBytes =
    existing.peakRamBytes < 0 || metrics.peakRamBytes < 0
      ? Math.min(existing.peakRamBytes, metrics.peakRamBytes)
      : Math.max(existing.peakRamBytes, metrics.peakRamBytes)

  const reEvaluated = evaluateNfrMetrics({
    bootTimeMs,
    domContentLoadedMs,
    loadEventMs,
    baselineRamBytes,
    peakRamBytes,
    samples: mergedSamples
  })

  const paths = writeNfrMetricsArtifacts(reEvaluated)
  return { metrics: reEvaluated, ...paths }
}
