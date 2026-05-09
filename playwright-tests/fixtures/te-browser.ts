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
 * Connects to a Chrome instance that was started externally by run-tests.ps1
 * via --remote-debugging-port.  Because Playwright does not launch the browser
 * itself, none of Playwright's automation flags (--enable-automation, etc.) are
 * present.  Chrome runs exactly like a normal user browser, so the ThousandEyes
 * Endpoint Agent extension captures and reports metrics as expected.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use) => {
    const port   = process.env.CHROME_DEBUG_PORT || '9222';
    const cdpUrl = `http://localhost:${port}`;

    const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 15_000 });
    const context = browser.contexts()[0];

    await use(context);

    // Disconnect Playwright but leave Chrome running - run-tests.ps1 kills it
    // after all tests finish so the extension can flush any pending metrics.
    await browser.disconnect();
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
