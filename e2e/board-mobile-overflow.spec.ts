import { expect, test } from "@playwright/test";

const viewports = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
];

test.describe("board mobile overflow", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL || !process.env.PLAYWRIGHT_BOARD_ROUTE,
      "Set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_BOARD_ROUTE to validate a real authenticated board route."
    );
  });

  for (const viewport of viewports) {
    test(`does not create global horizontal scroll at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const res = await page.goto(process.env.PLAYWRIGHT_BOARD_ROUTE!);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator(".board-canvas")).toBeVisible();

      const overflow = await page.evaluate(() => ({
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
      }));

      expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth);
    });
  }
});
