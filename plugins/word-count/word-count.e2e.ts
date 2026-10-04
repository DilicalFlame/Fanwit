import { expect, test } from "@playwright/test";
import { boot, builtinPlugins, closeWindow, newVault, turnOn } from "../../e2e/helpers";

test("a built-in worker plugin starts on its first event and updates the status bar", async ({ page }) => {
	await boot(page);
	await newVault(page, "wc");
	await builtinPlugins(page);
	await turnOn(page, "Word Count");
	await closeWindow(page);
	await page.getByText("Welcome.md").click();
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText(/\d+ words/, { timeout: 10_000 });
});

test("the count follows the active pane and its status item has a context menu", async ({ page }) => {
	await boot(page);
	await newVault(page, "wcm");
	await builtinPlugins(page);
	await turnOn(page, "Word Count");
	await closeWindow(page);
	const bar = page.locator("[data-fw-region=statusbar]");
	await page.getByText("Welcome.md").click();
	await expect(bar).toContainText(/\d+ words/, { timeout: 10_000 });
	// the Welcome page is not a note: no stale count from the previous editor
	await page.locator("[data-fw-tab]").first().click();
	await expect(bar).not.toContainText(/\d+ words/);
	await page.getByRole("tab", { name: /Welcome\.md/ }).click();
	await expect(bar).toContainText(/\d+ words/);
	// a plugin contributed menu on its own status item
	await bar.getByRole("button", { name: /words/ }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Show characters" }).click();
	await expect(bar).toContainText(/\d+ characters/);
});
