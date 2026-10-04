import { expect, test } from "vitest";
import { resolveSpec, windowOptions, type WindowKindSpec } from "./windows.svelte";

const spec = (s: Partial<WindowKindSpec>) => resolveSpec({ kind: "t", base: "child", ...s } as WindowKindSpec);

test("window options apply only where they take effect", () => {
	const win = { native: true, platform: "windows" };
	expect(windowOptions(spec({}), win).onBlocked.ok).toBe(true); // child locks by default
	expect(windowOptions(spec({ focus: "none" }), win).onBlocked.ok).toBe(false);
	expect(windowOptions(spec({ base: "aux" }), win).lock.ok).toBe(false); // nothing owns an aux window
	expect(windowOptions(spec({}), win).skipTaskbar.ok).toBe(false); // owned windows have no taskbar button
	expect(windowOptions(spec({ base: "aux" }), win).skipTaskbar.ok).toBe(true);
	expect(windowOptions(spec({}), { native: true, platform: "macos" }).cssShadow.ok).toBe(false);
	const web = { native: false, platform: "web", pip: true };
	expect(windowOptions(spec({ web: "popup" }), web).onBlocked.ok).toBe(false);
	expect(windowOptions(spec({ web: "modal" }), web).onBlocked.ok).toBe(true);
	expect(windowOptions(spec({ web: "virtual", focus: "none" }), web).onBlocked.ok).toBe(false);
	expect(windowOptions(spec({ web: "pip" }), web).alwaysOnTop.ok).toBe(false); // implied, not a choice
	expect(windowOptions(spec({ web: "pip" }), { ...web, pip: false }).web.ok).toBe(false);
});
