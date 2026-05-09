import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'path';

type TeFixtures = {
  context: BrowserContext;
  page: Page;
};

/**
 * Launches Chrome using the existing user profile where the ThousandEyes
 * Endpoint Agent extension is already installed and authenticated.
 *
 * Set CHROME_PROFILE_PATH in .env to the value shown under "Profile Path"
 * in chrome://version/ - paste it exactly, spaces are handled automatically.
 *
 * The run-tests.ps1 script kills any existing Chrome processes before
 * launching to prevent Chrome's singleton from hijacking the profile lock.
 */
export const test = base.extend<TeFixtures>({
  context: async ({}, use) => {
    const profilePath   = process.env.CHROME_PROFILE_PATH?.trim();
    const extensionPath = process.env.TE_EXTENSION_PATH?.trim();

    if (!profilePath && !extensionPath) {
      throw new Error(
        'Set CHROME_PROFILE_PATH in .env to the Chrome profile where the ' +
        'ThousandEyes Endpoint Agent extension is authenticated.'
      );
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

    let userDataDir: string;

    if (profilePath) {
      // Split "C:\...\User Data\Profile 1" into parent dir + profile name.
      // Passed as a single --flag=value string so spaces in the name are safe.
      userDataDir = path.dirname(profilePath);
      args.push(`--profile-directory=${path.basename(profilePath)}`);
    } else {
      // Fallback: sideload extension into a temp profile.
      userDataDir = path.join(process.env.TEMP || 'C:\\Temp', `pw-te-${Date.now()}`);
      args.push(
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      );
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: false,
      args,
      ignoreDefaultArgs: [
        '--enable-automation',
        '--disable-component-extensions-with-background-pages',
        '--password-store=basic',
        '--use-mock-keychain',
      ],
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
    });

    // Allow the Endpoint Agent extension time to connect to the local EA
    // service before any page navigation begins.
    await new Promise(resolve => setTimeout(resolve, 2000));

    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    // Reuse the initial about:blank tab Chrome opens on launch.
    const existing = context.pages().find(p => p.url() === 'about:blank');
    const page = existing ?? await context.newPage();
    await use(page);
  },
});

export { expect };
