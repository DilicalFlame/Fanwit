import { expect, test } from "@playwright/test";
import { apply, boot, renders } from "../../../../e2e/helpers";

test("Blender preset renders", ({ page }) => renders(page, "Blender", "[aria-label='3D viewport']"));

test("blender area switches editor", async ({ page }) => {
	await boot(page);
	await apply(page, "Blender");
	await page.getByRole("combobox", { name: "Editor type" }).first().selectOption("nodes");
	await expect(page.getByText("Principled BSDF")).toBeVisible();
});
