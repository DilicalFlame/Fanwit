import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	// skip onboarding: mark it done in the web host's OPFS backed state
	await page.addInitScript(() => sessionStorage.setItem("fw-e2e", "1"));
});

test("workbench boots without errors and the palette runs commands", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
	await page.goto("/");
	await expect(page.locator("[data-fw-region=titlebar]")).toBeVisible();
	await expect(page.getByRole("heading", { name: /Welcome to/ })).toBeVisible({ timeout: 15_000 });
	// close onboarding if it appeared
	const skip = page.getByRole("button", { name: "Skip" });
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await page.keyboard.press("Control+Shift+P");
	await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
	await page.keyboard.type("toggle panel");
	await page.keyboard.press("Enter");
	await expect(page.locator("[data-fw-region=panel]")).toBeVisible();
	expect(errors.filter((e) => !/favicon|DevTools/.test(e))).toEqual([]);
});

test("context menu opens on a tab", async ({ page }) => {
	await page.goto("/");
	const skip = page.getByRole("button", { name: "Skip" });
	await page.waitForTimeout(500);
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await page.locator("[data-fw-tab]").first().click({ button: "right" });
	await expect(page.getByRole("menu").first()).toBeVisible();
	await expect(page.getByRole("menuitem", { name: /Close tab/ })).toBeVisible();
});
