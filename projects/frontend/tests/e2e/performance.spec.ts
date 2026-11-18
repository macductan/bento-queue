import * as fs from 'node:fs'
import { test, expect, log } from '../support/merged-fixtures'
import {
  collectAndPersistPageNfrMetrics,
  collectMemorySample,
  measureColdStart,
  mergeAndWriteNfrMetrics,
  NFR_METRICS_JSON_PATH,
  NFR_SUMMARY_MD_PATH,
  readExistingMetricsArtifact
} from '../support/performance-collector'
import {
  evaluateNfrMetrics,
  formatNfrMarkdownSummary,
  NFR_THRESHOLDS,
  type NfrMemorySample
} from '../../src/utils/performanceMetrics'

test.describe('Story 6.2 - NFR Performance Benchmarking & Evidence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hecto_locale', 'vi');
    });
  });

  test('should verify cold start < 2.0s, baseline & CRUD execution RAM < 100MB, and publish NFR evidence artifacts', async ({
    page
  }, testInfo) => {
    const samples: NfrMemorySample[] = []

    log.step('1. Measure cold start boot time (< 2000ms)')
    const startupTiming = await measureColdStart(page, '/')
    expect(Number.isInteger(startupTiming.bootTimeMs)).toBe(true)
    expect(startupTiming.bootTimeMs).toBeGreaterThan(0)
    expect(startupTiming.bootTimeMs).toBeLessThanOrEqual(NFR_THRESHOLDS.MAX_BOOT_TIME_MS)

    log.step('2. Capture baseline RAM sample immediately after startup (< 100MB)')
    const baselineSample = await collectMemorySample(page, '01-baseline-idle-after-boot')
    samples.push(baselineSample)
    expect(Number.isInteger(baselineSample.usedHeapBytes)).toBe(true)
    expect(baselineSample.usedHeapBytes).toBeGreaterThan(0)
    expect(baselineSample.usedHeapBytes).toBeLessThanOrEqual(NFR_THRESHOLDS.MAX_RAM_BYTES)

    log.step('3. Execute folder and request CRUD workload while sampling RAM')
    await page.getByLabel('Thêm mới').click()
    await page.getByLabel('Thư mục mới').click()
    const folderNode = page.locator('[data-tree-row]').filter({ hasText: 'Thư mục mới' }).first()
    await expect(folderNode).toBeVisible()
    samples.push(await collectMemorySample(page, '02-after-create-folder'))

    await page.getByLabel('Thêm mới').click()
    await page.getByLabel('Request mới').click()
    const activeRequestNode = page.locator('[data-tree-row][data-active="true"]').first()
    await expect(activeRequestNode).toBeVisible()
    samples.push(await collectMemorySample(page, '03-after-create-request'))

    await activeRequestNode.click()
    const urlInput = page.getByRole('textbox', { name: 'URL' })
    await expect(urlInput).toBeVisible()
    await urlInput.fill('https://api.hecto.local/v1/benchmark?page=1&limit=50')
    await expect(page.locator('h1 [aria-label="Chưa lưu"]')).toBeVisible()

    await page.getByRole('tab', { name: /Headers/i }).click()
    const headersPanel = page.locator('#panel-headers')
    const headerKeyInput = headersPanel.getByPlaceholder('Key').first()
    const headerValInput = headersPanel.getByPlaceholder('Value').first()
    await expect(headerKeyInput).toBeVisible()
    await headerKeyInput.fill('X-NFR-Benchmark')
    await headerValInput.fill('story-6-2')
    samples.push(await collectMemorySample(page, '04-after-load-and-edit-request-url-and-headers'))

    await folderNode.click({ button: 'right' })
    await page.getByRole('button', { name: 'Xóa', exact: true }).click()
    const confirmDeleteBtn = page.getByRole('button', { name: 'Xóa', exact: true })
    await expect(confirmDeleteBtn).toBeVisible()
    await confirmDeleteBtn.click()
    await expect(page.getByText('Đã xóa')).toBeVisible()
    await expect(folderNode).not.toBeVisible()
    samples.push(await collectMemorySample(page, '05-after-delete-folder'))

    log.step('4. Evaluate NFR thresholds and persist test-results artifacts')
    const peakRamBytes = Math.max(...samples.map((s) => s.usedHeapBytes))
    const evaluated = evaluateNfrMetrics({
      bootTimeMs: startupTiming.bootTimeMs,
      domContentLoadedMs: startupTiming.domContentLoadedMs,
      loadEventMs: startupTiming.loadEventMs,
      baselineRamBytes: baselineSample.usedHeapBytes,
      peakRamBytes,
      samples
    })

    const { metrics: merged, jsonPath, markdownPath } = mergeAndWriteNfrMetrics(evaluated)

    await testInfo.attach('nfr-performance-metrics.json', {
      body: JSON.stringify(merged, null, 2),
      contentType: 'application/json'
    })
    await testInfo.attach('nfr-performance-summary.md', {
      body: formatNfrMarkdownSummary(merged),
      contentType: 'text/markdown'
    })

    expect(merged.bootPassed).toBe(true)
    expect(merged.ramPassed).toBe(true)
    expect(['PASS', 'WARN']).toContain(merged.status)
    expect(merged.failures).toEqual([])
    expect(merged.baselineRamMB).toBeLessThanOrEqual(NFR_THRESHOLDS.MAX_RAM_MB)
    expect(merged.peakRamMB).toBeLessThanOrEqual(NFR_THRESHOLDS.MAX_RAM_MB)

    expect(fs.existsSync(jsonPath)).toBe(true)
    expect(fs.existsSync(markdownPath)).toBe(true)
    expect(jsonPath).toBe(NFR_METRICS_JSON_PATH)
    expect(markdownPath).toBe(NFR_SUMMARY_MD_PATH)

    const savedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    expect(savedJson.bootTimeMs).toBeGreaterThanOrEqual(evaluated.bootTimeMs)
    expect(savedJson.peakRamBytes).toBeGreaterThanOrEqual(evaluated.peakRamBytes)
    expect(savedJson.samples.length).toBeGreaterThanOrEqual(5)
  })

  test('should preserve and merge NFR samples across tests via collectAndPersistPageNfrMetrics and readExistingMetricsArtifact', async ({
    page
  }) => {
    await page.goto('/')
    await page.getByLabel('Thêm mới').waitFor({ state: 'visible' })

    const beforeArtifact = readExistingMetricsArtifact()
    const beforeSampleCount = beforeArtifact ? beforeArtifact.samples.length : 0

    const persisted = await collectAndPersistPageNfrMetrics(page, 'manual-merge-verification')
    expect(persisted).not.toBeNull()
    expect(persisted?.bootPassed).toBe(true)
    expect(persisted?.ramPassed).toBe(true)

    const afterArtifact = readExistingMetricsArtifact()
    expect(afterArtifact).not.toBeNull()
    expect(afterArtifact!.samples.length).toBeGreaterThanOrEqual(beforeSampleCount + 1)
    expect(
      afterArtifact!.samples.some((s) => s.label === 'fixture:manual-merge-verification')
    ).toBe(true)
    if (beforeArtifact) {
      expect(afterArtifact!.bootTimeMs).toBeGreaterThanOrEqual(beforeArtifact.bootTimeMs)
      expect(afterArtifact!.peakRamBytes).toBeGreaterThanOrEqual(beforeArtifact.peakRamBytes)
    }
  })
})
