import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

type TeFixtures = {
  context: BrowserContext;
  page: Page;
};

/**
 * Extended test fixture that launches Chrome with the ThousandEyes extension.
 *
 * Extensions require a persistent context (launchPersistentContext) and cannot
 * run in headless mode — both are enforced here regardless of config settings.
 *
 * Set TE_EXTENSION_PATH in .env to the directory containing the extension's
 * manifest.json.  If the variable is unset the browser still launches; the TE
 * extension simply won't be loaded (useful for local dev).
 *
 * If CHROME_USER_DATA_DIR is set the same profile is reused across runs,
 * otherwise a fresh temporary profile is created and deleted after the test.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use, testInfo) => {
    const extensionPath = process.env.TE_EXTENSION_PATH?.trim();
    const persistentDataDir = process.env.CHROME_USER_DATA_DIR?.trim();

    // Use a per-test temp dir unless the caller wants a persistent profile.
    const ownedTempDir = !persistentDataDir;
    const userDataDir = persistentDataDir
      ? persistentDataDir
      : path.join(
          os.tmpdir(),
          `pw-te-${testInfo.workerIndex}-${Date.now()}`,
        );

    const args: string[] = [
      // Chrome's new headless mode (112+): no visible window but still loads
      // extensions. The old --headless flag silently drops extensions, so we
      // keep headless:false below (stops Playwright adding the old flag) and
      // supply --headless=new ourselves.
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ];

    if (extensionPath) {
      args.push(
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      );
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false, // Keep false so Playwright does not inject the old --headless flag
      args,
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });

    await use(context);
    await context.close();

    if (ownedTempDir) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Cleanup is best-effort; Windows may hold file locks briefly after close
      }
    }
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export { expect };
