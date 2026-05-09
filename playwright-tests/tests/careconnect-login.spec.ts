import { test, expect } from '../fixtures/te-browser';

const BASE_URL = (process.env.CARECONNECT_URL || 'https://careconnect.pseudo-co.com').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo123!';

test.describe('CareConnect – Provider Login', () => {
  test('login page loads and provider can sign in', async ({ page }) => {
    // ── 1. Navigate to login ────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // ── 2. Login form visible ───────────────────────────────────────────────
    const form = page.locator('[data-testid="login-form"]');
    await expect(form).toBeVisible({ timeout: 15_000 });

    // Email is pre-filled and read-only (dr.chen@careconnect.demo → provider role)
    const emailInput = page.locator('[data-testid="login-email-input"]');
    await expect(emailInput).toHaveValue(/careconnect\.demo/);

    // ── 3. Enter password and submit ────────────────────────────────────────
    await page.fill('[data-testid="login-password-input"]', PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    // ── 4. Verify successful login ──────────────────────────────────────────
    // No error banner should appear
    await expect(page.locator('[data-testid="login-error-message"]')).not.toBeVisible({
      timeout: 10_000,
    });

    // App navigates to provider dashboard after a successful login
    await expect(page).toHaveURL(/\/provider\/dashboard/, { timeout: 30_000 });

    // Dashboard content is rendered (Layout navigation is present)
    await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
  });
});
