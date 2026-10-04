import { expect, test, type Page } from "@playwright/test";

/**
 * The Manual window against the production build: it holds the app's docset (docs/app, ship =
 * "prod"); FaNWiT's own manual is development only and must not be there.
 */
async function openManual(page: Page) {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.addInitScript(() => sessionStorage.setItem("fw-e2e", "1"));
	await page.goto("/w/manual");
	await expect(page.getByRole("radiogroup", { name: "Manual or reference" })).toBeVisible();
	return errors;
}

test("the manual opens on the app's docset, without FaNWiT's", async ({ page }) => {
	const errors = await openManual(page);
	await expect(page.locator(".fw-doc-body h1").first()).toHaveText("Welcome");
	await expect(page.getByRole("navigation", { name: "Manual contents" }).getByRole("button", { name: "Concepts" })).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("Reference lists the generated pages", async ({ page }) => {
	await openManual(page);
	await page.getByRole("radio", { name: "Reference" }).click();
	await page.getByRole("navigation", { name: "Manual contents" }).getByRole("button", { name: "Commands" }).click();
	await expect(page.locator(".fw-doc-body h1", { hasText: "Commands" })).toBeVisible();
});

test("search finds a section and opens the page at it", async ({ page }) => {
	await openManual(page);
	await page.keyboard.press("/");
	await page.keyboard.type("#where things");
	await page.getByRole("option", { name: /Where things go/ }).click();
	await expect(page.getByRole("complementary", { name: "On this page" }).getByRole("button", { name: "Where things go" })).toBeVisible();
});

test("a reading setting applies and survives a reload", async ({ page }) => {
	await openManual(page);
	await page.getByRole("button", { name: "Reading settings" }).click();
	await page.getByRole("radio", { name: "Paper" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-reading-theme", "paper");
	await page.waitForTimeout(600); // settings.toml writes are debounced
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("data-reading-theme", "paper", { timeout: 10_000 });
});

test("bionic reading toggles without feeding itself (it used to freeze the page)", async ({ page }) => {
	await openManual(page);
	await page.getByRole("button", { name: "Reading settings" }).click();
	const bionic = page.getByRole("checkbox", { name: /Bionic reading/ });
	await bionic.click();
	await expect(page.locator(".fw-doc-body b.fw-bionic").first()).toBeVisible();
	const words = await page.locator(".fw-doc-body b.fw-bionic").count();
	await page.waitForTimeout(500);
	expect(await page.locator(".fw-doc-body b.fw-bionic").count()).toBe(words);
	await bionic.click();
	await expect(page.locator(".fw-doc-body b.fw-bionic")).toHaveCount(0);
});
