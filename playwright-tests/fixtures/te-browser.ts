import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';

type TeFixtures = {
  context: BrowserContext;
  page: Page;
};

/**
 * Launches Chrome via launchPersistentContext using the TE-authenticated user
 * profile.  Two Playwright automation signals are suppressed so the ThousandEyes
 * Endpoint Agent extension reports metrics as it would for a real user session:
 *   - ignoreDefaultArgs removes --enable-automation (the "controlled by automation"
 *     infobanner and Chrome's internal automation mode)
 *   - --disable-blink-features=AutomationControlled prevents navigator.webdriver=true
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use) => {
    const userDataDir = process.env.CHROME_USER_DATA_DIR ?? '';
    const profileDir  = process.env.CHROME_PROFILE_DIR  ?? 'Profile 1';

    if (!userDataDir) {
      throw new Error('CHROME_USER_DATA_DIR is not set');
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      args: [
        `--profile-directory=${profileDir}`,
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-first-run',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      ignoreHTTPSErrors: true,
    });

    // Give extension service workers a moment to register after launch.
    await new Promise(resolve => setTimeout(resolve, 2000));

    const workers = context.serviceWorkers();
    const teWorker = workers.find((w: { url(): string }) => w.url().includes('ddnennmeinlkhkmajmmfaojcnpddnpgb'));
    console.log(
      teWorker
        ? `[TE] Extension service worker detected: ${teWorker.url()}`
        : '[TE] WARNING: Extension service worker not detected — metrics may not be reported'
    );

    await use(context);

    // Wait for TE extension to flush any pending metrics before closing Chrome.
    await new Promise(resolve => setTimeout(resolve, 5000));
    await context.close();
  },

  page: async ({ context }: { context: BrowserContext }, use: (page: Page) => Promise<void>) => {
    const existing = context.pages();
    const page = existing.length > 0 ? existing[0] : await context.newPage();
    await use(page);
    // Navigate to about:blank between tests rather than closing the tab —
    // closing Chrome's last tab causes it to quit, breaking subsequent tests.
    await page.goto('about:blank').catch(() => {});
  },
});

export { expect };
