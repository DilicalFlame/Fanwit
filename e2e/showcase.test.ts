import { expect, test, type Page } from "@playwright/test";

/** Every showcase preset applies from the palette and renders its views without errors. */
const PRESETS: [string, string][] = [
	["Figma", "[aria-label='Design canvas']"],
	["Blender", "[aria-label='3D viewport']"],
	["Photoshop", "[aria-label^='Document']"],
	["Notion", "[aria-label='Page title']"],
	["Obsidian", "[aria-label='Graph of notes']"],
	["Discord", "[aria-label='Servers']"],
	["Web browser", "[aria-label='Address']"],
	["Excel", "[role='grid']"],
	["Dashboard", "[aria-label='Revenue per day']"],
	["Terminal", "[aria-label='Command line']"],
	["VS Code", "[data-fw-region='sidebar']"]
];

async function boot(page: Page) {
	await page.addInitScript(() => sessionStorage.setItem("fw-e2e", "1"));
	await page.goto("/");
	await expect(page.locator("[data-fw-region=titlebar]")).toBeVisible();
	const skip = page.getByRole("button", { name: "Skip" });
	await skip.waitFor({ timeout: 3000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function apply(page: Page, title: string) {
	await page.keyboard.press("Control+Shift+P");
	const palette = page.getByRole("dialog", { name: "Command palette" });
	await expect(palette).toBeVisible();
	await page.keyboard.type("apply layout preset");
	await page.waitForTimeout(200);
	await page.keyboard.press("Enter");
	await page.waitForTimeout(200);
	await page.keyboard.type(title);
	await page.waitForTimeout(200);
	await page.keyboard.press("Enter");
}

test("every showcase preset renders", async ({ page }) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
	await boot(page);
	for (const [title, probe] of PRESETS) {
		await apply(page, title);
		await expect(page.locator(probe).first(), title).toBeVisible({ timeout: 10_000 });
		await page.screenshot({ path: `test-results/showcase-${title.toLowerCase().replace(/\W+/g, "-")}.png` });
	}
	expect(errors.filter((e) => !/favicon|DevTools/.test(e))).toEqual([]);
});

test("showcase interactions: blender area switches editor, excel evaluates, terminal splits", async ({ page }) => {
	await boot(page);
	await apply(page, "Blender");
	await page.getByRole("combobox", { name: "Editor type" }).first().selectOption("nodes");
	await expect(page.getByText("Principled BSDF")).toBeVisible();

	await apply(page, "Excel");
	await page.locator("[data-ref='D4']:visible").click();
	await expect(page.getByRole("textbox", { name: "Formula" })).toHaveValue("=B4+C4");
	await expect(page.locator("[data-ref='D9']:visible")).toHaveText("11435");

	await apply(page, "Terminal");
	await page.getByRole("textbox", { name: "Command line" }).fill("vsplit");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("textbox", { name: "Command line" })).toHaveCount(2);
});
