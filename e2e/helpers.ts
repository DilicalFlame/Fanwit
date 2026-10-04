import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** Shared by e2e/ and the *.e2e.ts files that live with their part (src/app/..., plugins/...). */

/** Labs are core but can be switched off (`pnpm fw strip` does); their tests skip then. */
export const labsOn = /labs:\s*true/.test(readFileSync("app.config.ts", "utf8"));
export const needsLabs = () => test.skip(!labsOn, "Labs are off in app.config.ts");

/** Open the app with the e2e flag and dismiss the first run tour; returns page errors as they come. */
export async function boot(page: Page) {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.addInitScript(() => sessionStorage.setItem("fw-e2e", "1"));
	await page.goto("/");
	await expect(page.locator("[data-fw-region=titlebar]")).toBeVisible();
	const skip = page.getByRole("button", { name: "Skip" });
	await skip.waitFor({ timeout: 3000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	return errors;
}

/** Run a command from the palette by typing its title. */
export async function cmd(page: Page, query: string) {
	await page.keyboard.press("Control+Shift+P");
	await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
	await page.keyboard.type(query);
	await page.waitForTimeout(250);
	await page.keyboard.press("Enter");
}

/** Answer a quick input or quick pick. */
export async function prompt(page: Page, value: string) {
	await expect(page.getByRole("combobox")).toBeVisible();
	await page.keyboard.type(value);
	await page.waitForTimeout(250);
	await page.keyboard.press("Enter");
}

export async function newVault(page: Page, prefix: string) {
	const name = `${prefix}-${Date.now().toString(36)}`;
	await cmd(page, "create new vault");
	await prompt(page, name);
	await expect(page.getByText("Welcome.md")).toBeVisible();
	return name;
}

/** Apply a layout preset by title through the command palette. */
export async function apply(page: Page, title: string) {
	await cmd(page, "apply layout preset");
	await page.waitForTimeout(200);
	await page.keyboard.type(title);
	await page.waitForTimeout(200);
	await page.keyboard.press("Enter");
}

/** Apply a preset, wait for its probe and fail on any page error. */
export async function renders(page: Page, title: string, probe: string) {
	const errors = await boot(page);
	page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
	await apply(page, title);
	await expect(page.locator(probe).first(), title).toBeVisible({ timeout: 10_000 });
	await page.screenshot({ path: `test-results/showcase-${title.toLowerCase().replace(/\W+/g, "-")}.png` });
	expect(errors.filter((e) => !/favicon|DevTools/.test(e))).toEqual([]);
}

/** Open the plugin browser on its Built-in tab. */
export async function builtinPlugins(page: Page) {
	await cmd(page, "open plugin manager");
	await page.getByRole("tab", { name: "Built-in" }).click();
	await expect(page.getByRole("list", { name: "Plugins" })).toBeVisible();
}

export async function turnOn(page: Page, name: string) {
	await page.getByRole("switch", { name: `Turn ${name} on` }).first().click();
	await expect(page.getByRole("switch", { name: `Turn ${name} off` }).first()).toBeVisible();
}

/** Open a plugin's view from its details in the plugin browser, then close the browser. */
export async function openPluginView(page: Page, plugin: string, view = plugin) {
	await page.getByRole("button", { name: `Details of ${plugin}` }).click();
	await page.getByRole("complementary", { name: `${plugin} details` }).getByRole("button", { name: `Open ${view}` }).click();
	await closeWindow(page);
}

export const closeWindow = (page: Page) => page.getByRole("button", { name: "Close", exact: true }).last().click();
