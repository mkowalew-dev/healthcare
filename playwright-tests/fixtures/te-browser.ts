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
 * Connects to Chrome launched externally by run-tests.ps1 via CDP.
 * Because Playwright does not launch the browser itself, none of its
 * automation flags (--enable-automation, --disable-extensions, etc.) are
 * present.  Chrome runs exactly like a normal user browser, so the
 * ThousandEyes Endpoint Agent extension captures and reports metrics.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use: (context: BrowserContext) => Promise<void>) => {
    const port   = process.env.CHROME_DEBUG_PORT || '9222';
    const cdpUrl = `http://127.0.0.1:${port}`;

    const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 15_000 });
    const context = browser.contexts()[0];

    // Check if the TE service worker is already registered (it may have started
    // during Chrome startup before Playwright connected), then wait up to 10s
    // for it to appear if not.
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

    // browser.close() on a connectOverCDP browser disconnects the CDP session
    // only; it does not terminate the Chrome process.  The script closes Chrome
    // gracefully after all tests so the TE extension can flush pending metrics.
    await browser.close();
  },

  page: async ({ context }: { context: BrowserContext }, use: (page: Page) => Promise<void>) => {
    const existing = context.pages();
    const page = existing.length > 0 ? existing[0] : await context.newPage();
    await use(page);
    // Reset to about:blank instead of closing — keeps Chrome alive for the
    // next test's CDP connection.
    await page.goto('about:blank').catch(() => {});
  },
});

export { expect };
