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

    // Log whether the TE Endpoint Agent service worker is already registered.
    // With connectOverCDP, Chrome is already running so the MV3 service worker
    // should be present — if this logs "not detected", the extension may not be
    // loaded in the profile Chrome was started with.
    const workers = context.serviceWorkers();
    const teWorker = workers.find((w: { url(): string }) => w.url().includes('ddnennmeinlkhkmajmmfaojcnpddnpgb'));
    console.log(
      teWorker
        ? `[TE] Extension service worker detected: ${teWorker.url()}`
        : '[TE] WARNING: Extension service worker not detected — metrics may not be reported'
    );

    await use(context);

    // Disconnect Playwright but leave Chrome running - run-tests.ps1 kills it
    // after all tests finish so the extension can flush any pending metrics.
    // browser.close() on a connectOverCDP browser closes the CDP session only;
    // it does not terminate the Chrome process.
    await browser.close();
  },

  page: async ({ context }, use) => {
    // Reuse the tab Chrome launched with about:blank rather than opening a new
    // one.  Creating and then closing tabs risks Chrome reaching zero open tabs
    // and auto-quitting, which breaks every test after the first.
    const existing = context.pages();
    const page = existing.length > 0 ? existing[0] : await context.newPage();
    await use(page);
    // Reset to about:blank instead of closing — keeps Chrome alive for the
    // next test's CDP connection.
    await page.goto('about:blank').catch(() => {});
  },
});

export { expect };
