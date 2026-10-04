import { expect, test } from "@playwright/test";
import { apply, boot, renders } from "../../../../e2e/helpers";

test("Terminal preset renders", ({ page }) => renders(page, "Terminal", "[aria-label='Command line']"));

test("terminal splits", async ({ page }) => {
	await boot(page);
	await apply(page, "Terminal");
	await page.getByRole("textbox", { name: "Command line" }).fill("vsplit");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("textbox", { name: "Command line" })).toHaveCount(2);
});
