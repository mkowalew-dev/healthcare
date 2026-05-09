import { test, expect } from '../fixtures/te-browser';

const BASE_URL = (process.env.MYCHART_URL || 'https://mychart.pseudo-co.com').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo123!';

test.describe('MyChart – Patient Portal Login', () => {
  test('login page loads and patient can sign in to dashboard', async ({ page }) => {
    // ── 1. Navigate to login ────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // ── 2. Login form visible ───────────────────────────────────────────────
    const form = page.locator('[data-testid="login-form"]');
    await expect(form).toBeVisible({ timeout: 15_000 });

    // MyChart detects the patient portal hostname and pre-fills patient@demo.com
    const emailInput = page.locator('[data-testid="login-email-input"]');
    await expect(emailInput).toHaveValue('patient@demo.com');

    // ── 3. Enter password and submit ────────────────────────────────────────
    await page.fill('[data-testid="login-password-input"]', PASSWORD);
    await page.click('[data-testid="login-submit-button"]');

    // ── 4. Verify successful login ──────────────────────────────────────────
    await expect(page.locator('[data-testid="login-error-message"]')).not.toBeVisible({
      timeout: 10_000,
    });

    // Patient role lands on the patient dashboard (no cross-portal redirect)
    await expect(page).toHaveURL(/\/patient\/dashboard/, { timeout: 30_000 });

    // Dashboard content is rendered
    await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
  });
});
