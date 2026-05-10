import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

type TeFixtures = {
  context: BrowserContext;
  page: Page;
};

const TE_EXTENSION_ID = 'ddnennmeinlkhkmajmmfaojcnpddnpgb';

/**
 * Launches Chrome via launchPersistentContext using the TE-authenticated user
 * profile.  Several Playwright defaults are suppressed so the ThousandEyes
 * Endpoint Agent extension loads and reports metrics as it would for a real
 * user session:
 *   - ignoreDefaultArgs removes --enable-automation (automation infobanner),
 *     --disable-extensions (blocks all user extensions), and --headless
 *     (MV3 service workers do not activate in old headless mode)
 *   - --disable-blink-features=AutomationControlled prevents navigator.webdriver=true
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use: (context: BrowserContext) => Promise<void>) => {
    const userDataDir = process.env.CHROME_USER_DATA_DIR ?? '';
    const profileDir  = process.env.CHROME_PROFILE_DIR  ?? 'Profile 1';

    if (!userDataDir) {
      throw new Error('CHROME_USER_DATA_DIR is not set');
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      timeout: 60_000,
      args: [
        `--profile-directory=${profileDir}`,
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-first-run',
      ],
      ignoreDefaultArgs: ['--enable-automation', '--disable-extensions', '--headless'],
      ignoreHTTPSErrors: true,
    });

    // Wait for the TE extension service worker to register.  Check immediately
    // in case it's already up, otherwise listen for the event up to 10s.
    let teWorker = context.serviceWorkers().find((w: Worker) => w.url().includes(TE_EXTENSION_ID)) ?? null;
    if (!teWorker) {
      try {
        teWorker = await context.waitForEvent('serviceworker', {
          predicate: (w: Worker) => w.url().includes(TE_EXTENSION_ID),
          timeout: 10_000,
        });
      } catch {
        teWorker = null;
      }
    }
    console.log(
      teWorker
        ? `[TE] Extension service worker detected: ${teWorker.url()}`
        : '[TE] WARNING: Extension service worker not detected — metrics may not be reported'
    );

    await use(context);

    // Wait for TE extension to flush any pending metrics before closing Chrome.
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Race context.close() against a timeout — if Chrome is stuck the close
    // hangs and exceeds Playwright's worker teardown budget.
    await Promise.race([
      context.close(),
      new Promise(resolve => setTimeout(resolve, 15_000)),
    ]);
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
