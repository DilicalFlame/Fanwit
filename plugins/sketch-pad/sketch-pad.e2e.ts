import { expect, test } from "@playwright/test";
import { boot, builtinPlugins, openPluginView, turnOn } from "../../e2e/helpers";

test("an iframe view runs sandboxed with the plugin ctx", async ({ page }) => {
	await boot(page);
	await builtinPlugins(page);
	await turnOn(page, "Sketch Pad");
	await openPluginView(page, "Sketch Pad");
	const el = page.locator('iframe[title="Sketch Pad"]');
	const frame = page.frameLocator('iframe[title="Sketch Pad"]');
	await expect(frame.getByLabel("Drawing canvas")).toBeVisible({ timeout: 10_000 });
	await expect(el).toHaveAttribute("sandbox", "allow-scripts");
	// opaque origin: the app cannot reach into the frame, and the frame cannot reach the app
	expect(await el.evaluate((f: HTMLIFrameElement) => f.contentDocument === null)).toBe(true);
	await frame.getByRole("button", { name: "Clear" }).click();
});
