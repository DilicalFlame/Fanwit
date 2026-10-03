import { expect, test, type Page } from "@playwright/test";

/** End to end flows on the web build (BrowserHost: OPFS vaults, SQLite WASM, worker plugins). */

async function start(page: Page) {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/");
	await expect(page.locator("[data-fw-region=titlebar]")).toBeVisible();
	const skip = page.getByRole("button", { name: "Skip" });
	await skip.waitFor({ timeout: 3000 }).catch(() => {});
	if (await skip.isVisible().catch(() => false)) await skip.click();
	return errors;
}

async function cmd(page: Page, query: string) {
	await page.keyboard.press("Control+Shift+P");
	await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
	await page.keyboard.type(query);
	await page.waitForTimeout(250);
	await page.keyboard.press("Enter");
}

async function prompt(page: Page, value: string) {
	await expect(page.getByRole("combobox")).toBeVisible();
	await page.keyboard.type(value);
	await page.waitForTimeout(250);
	await page.keyboard.press("Enter");
}

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

test("custom menu kinds drive undoable commands", async ({ page }) => {
	await start(page);
	await cmd(page, "layout.openView");
	await prompt(page, "Menu Lab");
	const shape = page.getByRole("button", { name: "Shape a" });
	await shape.click();
	await shape.click({ button: "right" });
	await page.getByRole("menuitemradio", { name: "#ef4444" }).click();
	await expect(shape).toHaveCSS("background-color", "rgb(239, 68, 68)");
	await cmd(page, "undo");
	await expect(shape).toHaveCSS("background-color", "rgb(59, 130, 246)");
});

test("worker isolated plugin updates the status bar", async ({ page }) => {
	await start(page);
	await cmd(page, "create new vault");
	await prompt(page, `wc-${Date.now().toString(36)}`);
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText("wc-");
	await expect(page.getByText("Welcome.md")).toBeVisible();
	await cmd(page, "open plugin manager");
	await page.getByRole("button", { name: /Install samples/ }).click();
	await page.getByRole("switch", { name: "Enable Word Count" }).click();
	await page.getByRole("button", { name: "Close", exact: true }).last().click();
	await page.getByText("Welcome.md").click();
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText(/\d+ words/, { timeout: 10_000 });
});

test("SQLite WASM: write in developer mode, read back", async ({ page }) => {
	await start(page);
	await cmd(page, "toggle developer mode");
	await cmd(page, "layout.openView");
	await prompt(page, "dbExplorer");
	const sql = page.getByLabel("SQL");
	const run = async (q: string) => {
		await sql.fill(q);
		await page.getByRole("button", { name: "Run", exact: true }).click();
		await page.waitForTimeout(500);
	};
	await run("CREATE TABLE IF NOT EXISTS e2e__t (id INTEGER PRIMARY KEY, v TEXT)");
	await run("INSERT INTO e2e__t (v) VALUES ('ok')");
	await run("SELECT v FROM e2e__t LIMIT 1");
	await expect(page.locator("table")).toContainText("ok");
});

test("settings window is generated and changes apply live", async ({ page }) => {
	await start(page);
	await cmd(page, "open settings");
	await page.getByRole("button", { name: "Appearance" }).click();
	await page.getByRole("radio", { name: "Dark" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.getByLabel("Search settings").fill("@modified");
	await expect(page.getByText("theme.mode")).toBeVisible();
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

test("a user script in .fanwit/scripts registers a command", async ({ page }) => {
	await start(page);
	const name = `us-${Date.now().toString(36)}`;
	await cmd(page, "create new vault");
	await prompt(page, name);
	await expect(page.getByText("Welcome.md")).toBeVisible();
	await page.evaluate(async (vault) => {
		let d = await navigator.storage.getDirectory();
		for (const p of ["vaults", vault, ".fanwit", "scripts"]) d = await d.getDirectoryHandle(p, { create: true });
		const w = await (await d.getFileHandle("greet.js", { create: true })).createWritable();
		await w.write('// @command scripts.greet Greet from script\nexport default (ctx) => { ctx.commands.handle("scripts.greet", () => ctx.notify.toast("hello from a script")); };\n');
		await w.close();
	}, name);
	await cmd(page, "open plugin manager");
	await page.getByRole("button", { name: "Reload plugins" }).click();
	await page.getByRole("switch", { name: "Enable Script: greet" }).click();
	await page.getByRole("button", { name: "Close", exact: true }).last().click();
	await cmd(page, "greet from script");
	await expect(page.getByText("hello from a script")).toBeVisible({ timeout: 10_000 });
});

test("a reload reopens the vault instead of finding it locked by itself", async ({ page }) => {
	await start(page);
	const name = `rl-${Date.now().toString(36)}`;
	await cmd(page, "create new vault");
	await prompt(page, name);
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText(name);
	await page.reload();
	await expect(page.locator("[data-fw-region=statusbar]")).toContainText(name, { timeout: 10_000 });
	await expect(page.getByText(/is open in another window/)).toHaveCount(0);
});
