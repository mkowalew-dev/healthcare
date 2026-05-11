import { test, expect } from '../fixtures/te-browser';

const BASE_URL = (process.env.PACS_URL || 'http://pacs.pseudo-co.com:5174').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo123!';

test.describe('PACS - Radiology Workstation Login', () => {
  test('login page loads and radiologist can sign in to worklist', async ({ page }) => {
    // 1. Navigate to login
    // waitUntil: 'load' (not domcontentloaded) — PACS runs on a local Vite dev
    // server and React needs JS execution to render the form, which happens
    // after DOMContentLoaded.
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'load' });

    // 2. Login form visible
    const form = page.locator('[data-testid="pacs-login-form"]');
    await expect(form).toBeVisible({ timeout: 30_000 });

    // Email is pre-filled and read-only (dr.chen@careconnect.demo)
    const emailInput = page.locator('[data-testid="pacs-email-input"]');
    await expect(emailInput).toHaveValue('dr.chen@careconnect.demo');

    // 3. Enter password and submit
    await page.fill('[data-testid="pacs-password-input"]', PASSWORD);
    await page.click('[data-testid="pacs-login-button"]');

    // 4. Verify successful login
    await expect(page.locator('[data-testid="pacs-login-error"]')).not.toBeVisible({
      timeout: 10_000,
    });

    await expect(page).toHaveURL(/\/worklist/, { timeout: 30_000 });

    // Worklist content is rendered
    await expect(
      page.locator('table, [data-testid="worklist"], h1, h2').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
