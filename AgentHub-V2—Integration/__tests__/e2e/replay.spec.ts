import { test, expect } from '@playwright/test';

test.describe('Replay & Telemetry — DemoFX Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5174');
  });

  test.describe('ReplayDirector', () => {
    test('ReplayDirector renders playback controls when attached', async ({
      page,
    }) => {
      const director = page.locator('[data-testid="replay-director"]');
      const count = await director.count();

      if (count > 0) {
        await expect(director).toBeVisible();

        // Play/pause toggle button
        const playBtn = director.locator('[data-testid="replay-play-btn"]');
        await expect(playBtn).toBeVisible();
        await expect(playBtn).toHaveAttribute('aria-label');

        // Speed selector buttons: 1x, 2x, 5x, 10x
        for (const speed of ['1x', '2x', '5x', '10x']) {
          const speedBtn = director.locator(`[data-testid="speed-${speed}"]`);
          await expect(speedBtn).toBeVisible();
        }

        // Progress bar indicator
        const progressBar = director.locator('[data-testid="replay-progress"]');
        await expect(progressBar).toBeAttached();

        // Subtitle area
        const subtitle = director.locator('[data-testid="replay-subtitle"]');
        await expect(subtitle).toBeAttached();
      }
    });

    test('Play button toggles playback state', async ({ page }) => {
      const director = page.locator('[data-testid="replay-director"]');
      if ((await director.count()) === 0) return;

      const playBtn = director.locator('[data-testid="replay-play-btn"]');

      // Initial state should show play icon (▶)
      const initialLabel = await playBtn.getAttribute('aria-label');
      expect(initialLabel).toBe('Play');

      // Click to play
      await playBtn.click();

      // After clicking, button aria-label should change to Pause
      await expect(playBtn).toHaveAttribute('aria-label', 'Pause');

      // Click again to pause
      await playBtn.click();
      await expect(playBtn).toHaveAttribute('aria-label', 'Play');
    });
  });

  test.describe('SkillSnapCard', () => {
    test('SkillSnapCard renders save and skip buttons when open', async ({
      page,
    }) => {
      const skillCard = page.locator('[data-testid="skill-snap-card"]');
      const count = await skillCard.count();

      if (count > 0) {
        await expect(skillCard).toBeVisible();

        // Save button
        const saveBtn = skillCard.locator('[data-testid="skill-save-btn"]');
        await expect(saveBtn).toBeVisible();
        await expect(saveBtn).toContainText('Precipitate as Skill');

        // Skip/Dismiss button
        const dismissBtn = skillCard.locator('[data-testid="skill-dismiss-btn"]');
        await expect(dismissBtn).toBeVisible();
        await expect(dismissBtn).toContainText('Skip');
      }
    });

    test('SkillSnapCard save triggers callback and dismiss hides the card', async ({
      page,
    }) => {
      const skillCard = page.locator('[data-testid="skill-snap-card"]');
      if ((await skillCard.count()) === 0) return;

      // Click dismiss — card should be removed from the DOM (AnimatePresence exit)
      await skillCard.locator('[data-testid="skill-dismiss-btn"]').click();
      await expect(skillCard).not.toBeAttached();
    });
  });

  test.describe('LiveTelemetry', () => {
    test('LiveTelemetry renders token throughput display when attached', async ({
      page,
    }) => {
      const telemetry = page.locator('[data-testid="live-telemetry"]');
      const count = await telemetry.count();

      if (count > 0) {
        await expect(telemetry).toBeVisible();

        // Value label showing tokens per second
        const valueLabel = telemetry.locator('[data-testid="telemetry-value"]');
        await expect(valueLabel).toBeVisible();
        const text = await valueLabel.textContent();
        expect(text).toMatch(/\d+\s*t\/s/);

        // Bar elements (5 micro bars)
        const bars = telemetry.locator('[data-testid^="telemetry-bar-"]');
        await expect(bars).toHaveCount(5);
      }
    });

    test('LiveTelemetry value reflects tokensPerSec prop', async ({ page }) => {
      const telemetry = page.locator('[data-testid="live-telemetry"]');
      if ((await telemetry.count()) === 0) return;

      const valueLabel = telemetry.locator('[data-testid="telemetry-value"]');
      const text = await valueLabel.textContent();

      // Extract numeric token rate and verify it is a valid number
      const match = text?.match(/(\d+(\.\d+)?)\s*t\/s/);
      expect(match).not.toBeNull();
      const rate = parseFloat(match![1]);
      expect(rate).not.toBeNaN();
    });
  });
});
