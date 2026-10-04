import { expect, test } from "@playwright/test";
import { boot as start, cmd, prompt } from "../../../../e2e/helpers";

/** The notes sample on the web build: editing, saving and backlinks. */

test("create a vault in browser storage, add a note, edit and save it", async ({ page }) => {
	const errors = await start(page);
	await cmd(page, "create new vault");
	await prompt(page, `e2e-${Date.now().toString(36)}`);
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText("e2e-");
	await expect(page.getByText("Welcome.md")).toBeVisible();
	await cmd(page, "explorer: new file");
	await prompt(page, "today");
	const editor = page.getByLabel("Note today.md");
	await expect(editor).toBeVisible();
	await editor.click();
	await page.keyboard.press("End");
	await page.keyboard.type("\nwritten by playwright");
	await expect(page.getByLabel("unsaved").first()).toBeVisible();
	await page.keyboard.press("Control+s");
	await expect(page.getByLabel("unsaved")).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("backlinks come from the vault indexer and update on save", async ({ page }) => {
	await start(page);
	await cmd(page, "create new vault");
	await prompt(page, `bl-${Date.now().toString(36)}`);
	await expect(page.getByText("Welcome.md")).toBeVisible();
	await cmd(page, "explorer: new file");
	await prompt(page, "links");
	const editor = page.getByLabel("Note links.md");
	await editor.click();
	await page.keyboard.press("End");
	await page.keyboard.type("\nsee [[Welcome]]");
	await page.keyboard.press("Control+s");
	await expect(page.getByLabel("unsaved")).toHaveCount(0);
	await page.getByText("Welcome.md").click();
	await cmd(page, "show backlinks");
	await expect(page.locator("[data-fw-region=inspector]").getByText("links.md")).toBeVisible({ timeout: 10_000 });
});
