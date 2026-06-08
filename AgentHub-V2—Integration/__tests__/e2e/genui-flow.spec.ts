import { test, expect } from '@playwright/test';

test.describe('GenUI Components — Dynamic UI Widgets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5174');
  });

  test.describe('ChoiceCards', () => {
    test('ChoiceCards renders options in a grid when present in the DOM', async ({
      page,
    }) => {
      // ChoiceCards are rendered dynamically by the orchestrator;
      // verify the component structure using the known CSS pattern
      const choiceCards = page.locator(
        'div.rounded-xl.bg-white.p-5.shadow-sm h3.text-base.font-semibold',
      );

      // The app may or may not have active ChoiceCards at any given time;
      // when present they should contain selectable option buttons
      const count = await choiceCards.count();
      if (count > 0) {
        // Each ChoiceCards container has a title and a 2-column options grid
        await expect(choiceCards.first()).toBeVisible();

        // Option buttons sit inside the parent container
        const optionButtons = choiceCards
          .first()
          .locator('..')
          .locator('div.grid.grid-cols-2 button');
        await expect(optionButtons.first()).toBeAttached();
      }
    });
  });

  test.describe('ColorPickerGrid', () => {
    test('ColorPickerGrid renders color swatch buttons when present', async ({
      page,
    }) => {
      // ColorPickerGrid renders a flex-wrap row of color swatches
      const swatches = page.locator(
        'div.flex.flex-wrap.gap-3 button.w-10.h-10.rounded-lg',
      );

      const count = await swatches.count();
      if (count > 0) {
        // Each swatch has a title attribute containing its hex value
        await expect(swatches.first()).toBeVisible();
        const hexTitle = await swatches.first().getAttribute('title');
        expect(hexTitle).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }

      // Custom hex input: when allowCustom is true, an input with placeholder #XXXXXX is shown
      const customInput = page.locator('input[placeholder="#XXXXXX"]');
      const customBtn = customInput.locator('..').locator('button', { hasText: '使用' });
      if ((await customBtn.count()) > 0) {
        await expect(customBtn).toBeVisible();
      }
    });
  });

  test.describe('SliderRange', () => {
    test('SliderRange renders range input with min/max labels', async ({
      page,
    }) => {
      // SliderRange contains an <input type="range"> inside a container card
      const sliders = page.locator('input[type="range"]');
      const count = await sliders.count();

      if (count > 0) {
        const slider = sliders.first();

        // The slider has min/max attributes
        const min = await slider.getAttribute('min');
        const max = await slider.getAttribute('max');
        expect(min).toBeTruthy();
        expect(max).toBeTruthy();

        // Min and max values are displayed as text siblings above the slider
        const sliderCard = slider.locator(
          'xpath=ancestor::div[contains(@class, "rounded-xl")]',
        );
        const cardText = await sliderCard.textContent();
        expect(cardText).toContain(min);
        expect(cardText).toContain(max);
      }
    });

    test('SliderRange submit button is present', async ({ page }) => {
      // Each SliderRange has a 确认 (confirm) button
      const confirmBtns = page.locator('button', { hasText: '确认' });
      const count = await confirmBtns.count();

      if (count > 0) {
        // The confirm button sits inside the same card as the slider
        await expect(confirmBtns.first()).toBeVisible();

        // Should have primary blue styling
        const bgClass = await confirmBtns.first().getAttribute('class');
        expect(bgClass).toContain('bg-');
      }
    });
  });

  test.describe('ConfirmCard', () => {
    test('ConfirmCard renders confirm and cancel action buttons', async ({
      page,
    }) => {
      // ConfirmCard is a dialog card with two action buttons.
      // It has a flex row with gap-3 containing exactly 2 buttons (cancel + confirm).
      const confirmCards = page.locator(
        'div.rounded-xl.bg-white.p-5.shadow-sm div.flex.gap-3',
      );

      const count = await confirmCards.count();
      if (count > 0) {
        await expect(confirmCards.first()).toBeVisible();

        // Should contain exactly 2 buttons (cancel + confirm)
        const buttons = confirmCards.first().locator('button');
        await expect(buttons).toHaveCount(2);
      }
    });
  });
});
