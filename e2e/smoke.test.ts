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

test("a floating card dragged past the left and top edges stays there", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-fw-region=titlebar]")).toBeVisible();
	const skip = page.getByRole("button", { name: "Skip" });
	await skip.waitFor({ timeout: 3000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	await page.locator("[data-fw-region=main] [role=tab]").first().click();
	await page.keyboard.press("Control+Shift+P");
	await page.keyboard.type("float tab");
	await page.waitForTimeout(250);
	await page.keyboard.press("Enter");
	const card = page.locator("section:has(> header.cursor-move)").first();
	await expect(card).toBeVisible();
	const header = card.locator("> header");
	const hb = (await header.boundingBox())!;
	await page.mouse.move(hb.x + 40, hb.y + 10);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) await page.mouse.move(hb.x + 40 - i * 200, hb.y + 10 - i * 100);
	const during = (await card.boundingBox())!;
	await page.mouse.up();
	const after = (await card.boundingBox())!;
	const layer = (await card.locator("xpath=..").boundingBox())!;
	expect(during.x).toBeLessThan(layer.x + 20);
	expect(after.x).toBeLessThan(layer.x + 20);
	expect(after.y).toBeLessThan(layer.y + 20);
});

test("the Manage menu opens beside its button", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-fw-region=titlebar]")).toBeVisible();
	const skip = page.getByRole("button", { name: "Skip" });
	await skip.waitFor({ timeout: 3000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	// measured in page: Playwright's boundingBox double counts CSS zoom
	const rect = (sel: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect, sel);
	for (const zoom of [100, 125]) {
		await page.evaluate((z) => document.documentElement.style.setProperty("--ui-scale", String(z / 100)), zoom);
		await page.getByRole("button", { name: "Manage" }).click();
		await expect(page.getByRole("menu")).toBeVisible();
		const btn = await rect('button[aria-label="Manage"]');
		const m = await rect('[role="menu"]');
		expect(Math.abs(m.left - (btn.right + 4))).toBeLessThan(6);
		expect(Math.abs(m.bottom - btn.bottom)).toBeLessThan(6);
		await page.keyboard.press("Escape");
	}
});
