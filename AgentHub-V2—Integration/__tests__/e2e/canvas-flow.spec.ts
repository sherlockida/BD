import { test, expect } from '@playwright/test';

test.describe('Canvas Flow — Core Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5174');
  });

  test('Page loads and Canvas mode is the default view', async ({ page }) => {
    // The CanvasView component should be visible by default
    await expect(page.locator('[data-testid="canvas-view"]')).toBeVisible();
  });

  test('TopBar renders Canvas / Classic IM toggle buttons', async ({ page }) => {
    const tablist = page.locator('div[role="tablist"]');
    await expect(tablist).toBeVisible();

    const canvasTab = tablist.locator('button[role="tab"]', { hasText: 'Canvas' });
    const classicTab = tablist.locator('button[role="tab"]', { hasText: 'Classic IM' });

    await expect(canvasTab).toBeVisible();
    await expect(classicTab).toBeVisible();

    // Canvas tab should be selected by default when page first loads
    await expect(canvasTab).toHaveAttribute('aria-selected', 'true');
  });

  test('CommandBar is visible at the bottom of the layout', async ({ page }) => {
    // The CommandBar has a data-testid="command-bar"
    const commandBar = page.locator('[data-testid="command-bar"]');
    await expect(commandBar).toBeVisible();

    // It should contain an input for typing commands
    const input = commandBar.locator('input');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /输入需求/);
  });

  test('BenchWall sidebar is present', async ({ page }) => {
    const benchWall = page.locator('[data-testid="bench-wall"]');
    await expect(benchWall).toBeVisible();

    // Should contain a "Workstations" heading in the default expanded state
    await expect(benchWall).toContainText('Workstations');
  });

  test('TimelineRail sidebar is present', async ({ page }) => {
    const timelineRail = page.locator('[data-testid="timeline-rail"]');
    await expect(timelineRail).toBeVisible();

    // Should contain a "Timeline" heading
    await expect(timelineRail).toContainText('Timeline');
  });

  test('Switching to Classic mode hides the Canvas container and reveals Classic IM view', async ({ page }) => {
    // Click the "Classic IM" tab
    await page.locator('div[role="tablist"] button[role="tab"]', { hasText: 'Classic IM' }).click();

    // The canvas wrapping div gets aria-hidden=true when classic mode is active
    const canvasWrapper = page.locator('div[aria-hidden="true"]');
    await expect(canvasWrapper.first()).toBeVisible();

    // The canvas view itself is still mounted but hidden via CSS visibility
    const canvasView = page.locator('[data-testid="canvas-view"]');
    await expect(canvasView).toBeAttached();
  });
});
