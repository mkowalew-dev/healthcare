import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'path';
import fs from 'fs';

type TeFixtures = {
  context: BrowserContext;
  page: Page;
};

/**
 * Launches Chrome with the ThousandEyes extension loaded from an explicit path
 * into a STABLE dedicated test profile.
 *
 * Why a stable profile instead of the real Chrome profile:
 *   Using the real Chrome user data directory causes session-restore locks,
 *   Chrome singleton conflicts, and extension background pages that block
 *   Playwright navigation.  A stable dedicated directory avoids all of that
 *   while still letting the TE extension persist its EPA connection state
 *   between test runs.
 *
 * Required .env settings:
 *   TE_EXTENSION_PATH  - full path to the folder containing the TE extension's
 *                        manifest.json (found inside Profile 1\Extensions\<id>\<version>)
 *   CHROME_USER_DATA_DIR - a dedicated directory ONLY for these tests, e.g.
 *                        C:\playwright-te-profile  (NOT the real Chrome User Data)
 *
 * First run: Chrome will open and the extension will connect to the local EPA
 * agent.  Subsequent runs reuse the same profile so the connection is already
 * established.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use) => {
    const extensionPath = process.env.TE_EXTENSION_PATH?.trim();
    const userDataDir   = process.env.CHROME_USER_DATA_DIR?.trim()
      || 'C:\\playwright-te-profile';

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const args: string[] = [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-restore-session-state',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--hide-crash-restore-bubble',
    ];

    if (extensionPath) {
      // Only restrict to a specific extension path when one is explicitly set.
      // If the TE extension is policy-managed, omit these flags entirely -
      // --disable-extensions-except would block the policy extension from loading.
      args.push(
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      );
    }
    // If no extensionPath: Chrome loads all policy-managed extensions normally.

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      args,
      ignoreDefaultArgs: [
        // Playwright adds these flags by default. They signal to Chrome (and
        // extensions) that the browser is under automation, which causes the
        // ThousandEyes Endpoint Agent extension to suppress metric collection.
        '--enable-automation',
        '--disable-component-extensions-with-background-pages',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });

    // Give the TE extension time to connect to the EPA agent before navigating.
    await new Promise(resolve => setTimeout(resolve, 2000));

    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    // Reuse the initial about:blank tab Chrome opened on launch.
    const existing = context.pages().find(p => p.url() === 'about:blank');
    const page = existing ?? await context.newPage();
    await use(page);
  },
});

export { expect };
