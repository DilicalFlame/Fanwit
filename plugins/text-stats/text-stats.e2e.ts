import { expect, test } from "@playwright/test";
import { boot, builtinPlugins, closeWindow, newVault, turnOn } from "../../e2e/helpers";

test("a Rust WebAssembly plugin starts on its first event", async ({ page }) => {
	await boot(page);
	await newVault(page, "ts");
	await builtinPlugins(page);
	await turnOn(page, "Text Stats");
	await closeWindow(page);
	await page.getByText("Welcome.md").click();
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText(/Ease \d+/, { timeout: 10_000 });
});
