import { expect, test } from "@playwright/test";
import { boot, cmd } from "./helpers";

/** Switching the Language setting retranslates the frame that is already on screen. */
test("changing the language translates the open window", async ({ page }) => {
	await boot(page);
	await cmd(page, "open settings");
	await page.locator("select").filter({ has: page.locator("option[value=hi]") }).first().selectOption("hi");

	await expect(page.locator("html")).toHaveAttribute("lang", "hi");
	await expect(page.locator("[data-menubar='menubar/file']")).toHaveText("फ़ाइल");
	await expect(page.getByRole("button", { name: "रूप-रंग" })).toBeVisible();
	await expect(page.getByText("सेटिंग्स", { exact: true }).first()).toBeVisible();
	await expect(page.getByPlaceholder("सेटिंग्स खोजें")).toBeVisible();

	await page.locator("select").filter({ has: page.locator("option[value=hi]") }).first().selectOption("en");
	await expect(page.locator("[data-menubar='menubar/file']")).toHaveText("File");
});
