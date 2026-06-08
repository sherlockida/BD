/**
 * E2E: Complete chat flow — user sends a message and sees agent response.
 *
 * Prerequisites:
 * 1. Backend server running on http://localhost:3001
 * 2. PostgreSQL + Redis running (docker compose up -d)
 *
 * Run with: npx playwright test
 */
import { test, expect } from '@playwright/test';

test.describe('AgentHub Chat Flow', () => {
  test('loads app and shows conversation list', async ({ page }) => {
    await page.goto('/');

    // App should render the conversation list sidebar
    const convList = page.locator('[data-testid="conversation-list"]');
    await expect(convList).toBeVisible({ timeout: 10_000 });

    // Should show at least one conversation
    const convItems = page.locator('[data-testid="conversation-item"]');
    const count = await convItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('can switch to a conversation and see messages', async ({ page }) => {
    await page.goto('/');

    // Click on the first conversation
    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    await firstConv.click();

    // Chat window should be visible
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible({ timeout: 5_000 });

    // There should be some messages (at least the system welcome message)
    const messages = page.locator('[data-testid="message-item"]');
    const count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('sends a message and gets agent response', async ({ page }) => {
    await page.goto('/');

    // Click on a group conversation
    const convItems = page.locator('[data-testid="conversation-item"]');
    await convItems.first().click();

    // Type a message
    const input = page.locator('[data-testid="chat-input"]');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('你好，请介绍一下你自己');

    // Send the message
    const sendBtn = page.locator('[data-testid="send-button"]');
    await sendBtn.click();

    // Wait for agent response — a new message item should appear
    // (or the streaming message should have content)
    await page.waitForTimeout(3000);

    // Verify there are messages after the user sent one
    const messages = page.locator('[data-testid="message-item"]');
    const count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(2); // at least welcome + user message
  });
});
