import { expect, test } from "@playwright/test";
import { apply, boot, builtinPlugins, closeWindow, turnOn } from "../../e2e/helpers";

test("an appearance plugin restyles only while it is on", async ({ page }) => {
	await boot(page);
	await builtinPlugins(page);
	const style = page.locator('style[data-fw-css="plugin:blender-classic/styles.css"]');
	await expect(style).toHaveCount(0);
	await turnOn(page, "Blender Classic");
	await expect(style).toHaveCount(1);
	await page.getByRole("switch", { name: "Turn Blender Classic off" }).first().click();
	await expect(style).toHaveCount(0);
	await turnOn(page, "Blender Classic");
	await closeWindow(page);
	await apply(page, "Blender");
	await expect(page.locator("html")).toHaveAttribute("data-preset", "blender");
});
