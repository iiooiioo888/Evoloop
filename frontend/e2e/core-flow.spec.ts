import { expect, test } from '@playwright/test';

test.describe('EvoLoop 核心 UI', () => {
  test('首頁載入並可切換監控即時動態', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // 活動欄「監控」
    await page.getByTitle('監控').or(page.getByTitle('Monitor')).click();
    await expect(page.getByText('即時').or(page.getByText('Live')).first()).toBeVisible();

    // 側欄點即時
    await page.getByRole('button', { name: /即時|Live/ }).first().click();
    await expect(page.getByText(/LIVE|IDLE|待命|即時/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('實驗室面板可開啟 DSPy 對照', async ({ page }) => {
    await page.goto('/');
    await page.getByTitle('監控').or(page.getByTitle('Monitor')).click();
    // 「更多」收納次要分頁
    const more = page.getByRole('button', { name: /更多|More/ });
    if (await more.isVisible()) await more.click();
    await page.getByRole('button', { name: /實驗室|Lab/ }).click();
    await expect(page.getByText(/DSPy|優化前|Before/)).toBeVisible({ timeout: 15_000 });
  });

  test('角色分頁可開啟名冊', async ({ page }) => {
    await page.goto('/');
    await page.getByTitle('監控').or(page.getByTitle('Monitor')).click();
    await page.getByRole('button', { name: /角色|Agents/ }).click();
    await expect(page.getByPlaceholder(/搜尋角色|Search roles/)).toBeVisible({ timeout: 15_000 });
  });
});
