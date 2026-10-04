import { expect, test, type Page } from "@playwright/test";

/** The docs site is the manual on the web: no palette of app commands, no vaults, no empty workbench. */
async function open(page: Page, query = "") {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/" + query);
	await expect(page.locator("[data-fw-view] h1:visible").first()).toBeVisible({ timeout: 60_000 });
	return errors;
}

test("the palette shortcuts search the manual instead", async ({ page }) => {
	const errors = await open(page);
	await page.locator(".fw-doc-body").click();
	await page.keyboard.press("Control+Shift+P");
	await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
	await expect(page.getByLabel("Search the docs")).toBeFocused();
	expect(errors).toEqual([]);
});

test("only reading commands exist", async ({ page }) => {
	await open(page);
	const ids: string[] = await page.evaluate(() => (window as never as { __fanwit: { commands: { list(): { def: { id: string } }[] } } }).__fanwit.commands.list().map((e) => e.def.id));
	expect(ids).toContain("manual.open");
	for (const gone of ["palette.open", "vault.open", "app.settings", "layout.applyPreset", "window.new", "dev.toggleMode", "hello.greet"]) expect(ids).not.toContain(gone);
});

test("a Run button for an app command says it runs in the desktop app", async ({ page }) => {
	await open(page, "?page=fanwit/troubleshooting");
	const run = page.locator(".fw-doc-body button[data-run='app.diagnostics']");
	await expect(run).toBeDisabled();
	await expect(run).toHaveText("Desktop app");
});

test("closing every page offers the home page, not the command palette", async ({ page }) => {
	await open(page);
	await page.locator("[data-fw-tab]").first().click();
	await page.keyboard.press("Delete");
	await expect(page.getByRole("button", { name: "All commands" })).toHaveCount(0);
	await page.getByRole("button", { name: "Open the home page" }).click();
	await expect(page.locator("[data-fw-view] h1:visible").first()).toBeVisible();
});

test("levels filter the contents, and opening a page shows its level", async ({ page }) => {
	await open(page);
	const nav = page.getByRole("navigation", { name: "Manual contents" });
	await page.getByRole("radio", { name: "Beginner" }).click();
	await expect(nav.getByRole("button", { name: "Start here", exact: true }).last()).toBeVisible();
	await expect(nav.getByRole("button", { name: "Commands", exact: true })).toHaveCount(0);
	await page.goto("/?page=fanwit/guides/kernel");
	await expect(page.getByRole("radio", { name: "Expert" })).toHaveAttribute("aria-checked", "true");
	await expect(nav.getByRole("button", { name: "Kernel", exact: true })).toBeVisible();
});
