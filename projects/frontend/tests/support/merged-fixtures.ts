import { mergeTests, expect } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils/log';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
// import { test as authFixture } from './auth-fixture';

import { setupWailsMock } from './wails-mock';
import { collectAndPersistPageNfrMetrics } from './performance-collector';

const baseTest = mergeTests(
  apiRequestFixture,
  recurseFixture,
  interceptFixture,
  networkErrorFixture
  // authFixture
);

export const test = baseTest.extend({
  page: async ({ page }, use, testInfo) => {
    await page.addInitScript(setupWailsMock);
    await use(page);
    if (!page.isClosed() && page.url() !== 'about:blank') {
      const evaluated = await collectAndPersistPageNfrMetrics(page, testInfo.title);
      expect(evaluated).not.toBeNull();
      expect(evaluated!.bootPassed).toBe(true);
      expect(evaluated!.ramPassed).toBe(true);
    }
  },
});

export { expect } from '@playwright/test';
export { log };
