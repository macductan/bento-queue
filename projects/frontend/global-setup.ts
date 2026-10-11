import { FullConfig } from '@playwright/test';
import { authStorageInit, configureAuthSession } from '@seontechnologies/playwright-utils/auth-session';

async function globalSetup(config: FullConfig) {
  // authStorageInit(config);
}

export default globalSetup;
