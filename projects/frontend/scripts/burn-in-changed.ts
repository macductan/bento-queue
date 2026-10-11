import { runBurnIn } from '@seontechnologies/playwright-utils/burn-in';

await runBurnIn({
  configPath: '.burn-in.config.ts',
  baseBranch: 'develop', // changed from main as project uses develop branch
});
