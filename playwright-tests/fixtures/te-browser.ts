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
 * There are two modes, controlled by environment variables in .env:
 *
 * Mode A - Use an existing Chrome profile (CHROME_USER_DATA_DIR is set)
 *   The TE extension is already installed and signed in to ThousandEyes inside
 *   that profile.  No extra flags are needed; Chrome loads all profile extensions
 *   normally.  This is the mode required for real browser stats to appear in
 *   ThousandEyes, because the extension must be authenticated.
 *   headless: false is required - extensions running in headless mode cannot
 *   capture and report the full browser performance data ThousandEyes needs.
 *
 * Mode B - Load extension from an explicit path (TE_EXTENSION_PATH is set,
 *   CHROME_USER_DATA_DIR is not)
 *   A fresh temp profile is created per test run and the extension is sideloaded.
 *   The extension will NOT be authenticated, so ThousandEyes will not receive
 *   stats.  Useful only for verifying the extension loads without errors.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use, testInfo) => {
    const extensionPath  = process.env.TE_EXTENSION_PATH?.trim();
    const existingProfile = process.env.CHROME_USER_DATA_DIR?.trim();

    let userDataDir: string;
    let ownedTempDir = false;
    const args: string[] = [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ];

    if (existingProfile) {
      // Mode A: real Chrome profile - extension is installed and authenticated.
      // Do NOT pass --disable-extensions-except; it would suppress the TE extension.
      userDataDir = existingProfile;
      // If the TE extension lives in a non-default profile (Profile 2, Profile 3,
      // etc.) tell Chrome which subdirectory to open, otherwise it defaults to
      // the "Default" profile and the extension will not be present.
      const profileDir = process.env.CHROME_PROFILE_DIRECTORY?.trim();
      if (profileDir) {
        args.push(`--profile-directory=${profileDir}`);
      }
    } else if (extensionPath) {
      // Mode B: sideload extension into a fresh temp profile.
      userDataDir  = path.join(os.tmpdir(), `pw-te-${testInfo.workerIndex}-${Date.now()}`);
      ownedTempDir = true;
      args.push(
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      );
    } else {
      // No extension config at all - create a minimal temp profile.
      userDataDir  = path.join(os.tmpdir(), `pw-te-${testInfo.workerIndex}-${Date.now()}`);
      ownedTempDir = true;
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      // headless must be false - Chrome extensions cannot capture full browser
      // performance events (navigation timing, resource timing, paint metrics)
      // in headless mode, so ThousandEyes would receive incomplete or no data.
      headless: false,
      args,
      // Playwright adds --disable-component-extensions-with-background-pages by
      // default, which prevents extension background service workers from
      // starting.  The ThousandEyes extension depends on its background worker
      // to connect back to the EPA and report browser metrics, so we remove it.
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
        // best-effort; Windows may hold file locks briefly after close
      }
    }
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export { expect };
