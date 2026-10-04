import { expect, test } from "@playwright/test";
import { boot, builtinPlugins, openPluginView, turnOn } from "../../e2e/helpers";

test("a widgets view is drawn from a worker and talks back", async ({ page }) => {
	await boot(page);
	await builtinPlugins(page);
	await turnOn(page, "Pomodoro");
	await openPluginView(page, "Pomodoro");
	await expect(page.getByText("25:00")).toBeVisible({ timeout: 10_000 });
	await page.getByRole("button", { name: "Start" }).click();
	await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
	await expect(page.getByText(/^24:5\d$/)).toBeVisible({ timeout: 5000 });
});

test("the running timer in the status bar has the plugin's context menu", async ({ page }) => {
	await boot(page);
	await builtinPlugins(page);
	await turnOn(page, "Pomodoro");
	await openPluginView(page, "Pomodoro");
	await page.getByRole("button", { name: "Start" }).click();
	const item = page.locator("[data-fw-region=statusbar]").getByRole("button", { name: /^● \d\d:\d\d$/ });
	await expect(item).toBeVisible();
	await item.click({ button: "right" });
	await expect(page.getByRole("menuitem", { name: "Focus for 50 minutes" })).toBeVisible();
	await page.getByRole("menuitem", { name: "Reset the focus timer" }).click();
	await expect(item).toHaveCount(0);
	await expect(page.getByText("25:00")).toBeVisible();
});
