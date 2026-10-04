import { expect, test } from "@playwright/test";
import { boot } from "./helpers";
import { BUDGETS } from "../src/fanwit/kernel/budget";

/**
 * Performance budgets, measured in a real browser on every CI run: the User Timing measures the
 * app records (src/fanwit/kernel/budget.ts), time to a usable window, and JavaScript loaded at
 * startup. Medians, so one slow CI tick does not fail the build; each worst case is reported.
 */
const STARTUP_MS = 4000;
const STARTUP_JS_KB = 4500;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

test("the app stays within its performance budgets", async ({ page }, info) => {
	await page.addInitScript(() => sessionStorage.setItem("fw-e2e", "1"));
	await page.goto("/");
	await page.locator("[data-fw-region=titlebar]").waitFor();
	const startup = await page.evaluate(() => ({
		ready: performance.now(),
		js: performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).reduce((n, r) => n + (r as PerformanceResourceTiming).decodedBodySize, 0) / 1024
	}));
	await boot(page);

	for (let i = 0; i < 15; i++) {
		await page.keyboard.press("Control+Shift+P");
		await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
		await page.keyboard.press("Escape");
	}
	const tab = page.getByRole("tab").first();
	for (let i = 0; i < 5; i++) {
		await tab.click({ button: "right" });
		// a closing menu stays (inert) while it animates out
		await expect(page.locator("[role=menu]:not([inert])")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toHaveCount(0);
	}

	const measured = await page.evaluate((names) => Object.fromEntries(names.map((n) => [n, performance.getEntriesByName(n, "measure").map((e) => e.duration)])), Object.keys(BUDGETS));
	const rows = [`startup: ${startup.ready.toFixed(0)} ms (budget ${STARTUP_MS}), ${startup.js.toFixed(0)} KB of JS (budget ${STARTUP_JS_KB})`];
	for (const [name, xs] of Object.entries(measured)) rows.push(`${name}: median ${median(xs).toFixed(1)} ms, worst ${Math.max(0, ...xs).toFixed(1)} ms over ${xs.length} (budget ${BUDGETS[name as keyof typeof BUDGETS]} ms)`);
	info.annotations.push({ type: "budgets", description: rows.join("\n") });
	console.log(rows.join("\n"));

	expect(startup.ready, "time to a usable window").toBeLessThan(STARTUP_MS);
	expect(startup.js, "JavaScript loaded at startup (KB)").toBeLessThan(STARTUP_JS_KB);
	for (const [name, xs] of Object.entries(measured)) {
		expect(xs.length, `${name} was measured`).toBeGreaterThan(0);
		expect(median(xs), `${name} median`).toBeLessThan(BUDGETS[name as keyof typeof BUDGETS]);
	}
});
