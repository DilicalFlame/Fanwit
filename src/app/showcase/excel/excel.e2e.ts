import { expect, test } from "@playwright/test";
import { apply, boot, renders } from "../../../../e2e/helpers";

test("Excel preset renders", ({ page }) => renders(page, "Excel", "[role='grid']"));

test("excel evaluates formulas", async ({ page }) => {
	await boot(page);
	await apply(page, "Excel");
	await page.locator("[data-ref='D4']:visible").click();
	await expect(page.getByRole("textbox", { name: "Formula" })).toHaveValue("=B4+C4");
	await expect(page.locator("[data-ref='D9']:visible")).toHaveText("11435");
});
