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
 * Launches Chrome with the ThousandEyes extension active and authenticated.
 *
 * Set CHROME_PROFILE_PATH in .env to the full path shown under "Profile Path"
 * in chrome://version/.  The fixture splits that into the user-data-dir and
 * the profile name automatically, so no extra variables are needed.
 *
 * Example:
 *   CHROME_PROFILE_PATH=C:\Users\atl-user\AppData\Local\Google\Chrome\User Data\Profile 1
 *
 * headless must be false - the ThousandEyes extension needs a real browser
 * context to capture navigation timing and report metrics to the EPA.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use, testInfo) => {
    const profilePath  = process.env.CHROME_PROFILE_PATH?.trim();
    const extensionPath = process.env.TE_EXTENSION_PATH?.trim();

    let userDataDir: string;
    let ownedTempDir = false;
    const args: string[] = [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      // Prevent Chrome from restoring the previous session on startup.
      // Session restore locks the browser into a recovery state that blocks
      // Playwright from navigating new pages away from about:blank.
      '--no-restore-session-state',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--hide-crash-restore-bubble',
    ];

    if (profilePath) {
      // Split "C:\...\User Data\Profile 1" into parent dir + profile folder name.
      // Pass --profile-directory as two separate tokens to avoid Chrome
      // mis-parsing a value that contains a space (e.g. "Profile 1").
      const profileDir  = path.basename(profilePath);
      userDataDir = path.dirname(profilePath);
      args.push(`--profile-directory=${profileDir}`);
    } else if (extensionPath) {
      // Fallback: sideload extension into a fresh temp profile.
      // Extension will NOT be authenticated - ThousandEyes will not receive stats.
      userDataDir  = path.join(os.tmpdir(), `pw-te-${testInfo.workerIndex}-${Date.now()}`);
      ownedTempDir = true;
      args.push(
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      );
    } else {
      userDataDir  = path.join(os.tmpdir(), `pw-te-${testInfo.workerIndex}-${Date.now()}`);
      ownedTempDir = true;
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      args,
      ignoreDefaultArgs: ['--disable-component-extensions-with-background-pages'],
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });

    // Give the ThousandEyes extension background worker time to start and
    // establish its connection to the local EPA agent before any page load.
    await new Promise(resolve => setTimeout(resolve, 2000));

    await use(context);
    await context.close();

    if (ownedTempDir) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  },

  page: async ({ context }, use) => {
    // When using a real Chrome profile the ThousandEyes extension background
    // page (chrome-extension://...) shows up in context.pages() and is NOT
    // navigable.  Calling page.goto() on it silently does nothing, which
    // causes the test to hang on about:blank.  Filter to real http/about pages
    // only and create a fresh one if none exist yet.
    const navigable = context.pages().filter(
      p => !p.url().startsWith('chrome-extension://') && !p.url().startsWith('chrome://')
    );
    const page = navigable.length > 0 ? navigable[0] : await context.newPage();
    await use(page);
  },
});

export { expect };
