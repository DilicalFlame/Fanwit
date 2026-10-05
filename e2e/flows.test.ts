import { expect, test } from "@playwright/test";
import { boot as start, cmd, needsLabs, prompt } from "./helpers";

/** App wide flows on the web build (BrowserHost: OPFS vaults, SQLite WASM, worker plugins). Flows of a part live in its *.e2e.ts. */

test("custom menu kinds drive undoable commands", async ({ page }) => {
	needsLabs();
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

test("SQLite WASM: write in developer mode, read back", async ({ page }) => {
	needsLabs();
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
	await page.getByRole("button", { name: "Rescan plugins" }).click();
	await page.getByRole("switch", { name: "Turn Script: greet on" }).click();
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

test("a confirm dialog guards a destructive command, and toasts report back", async ({ page }) => {
	await start(page);
	await cmd(page, "reset all menu customisations");
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Reset menus" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	await cmd(page, "open webview devtools");
	await expect(page.getByText("Use your browser's developer tools (F12)")).toBeVisible();
});
