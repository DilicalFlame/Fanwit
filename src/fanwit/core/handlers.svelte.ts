/** Handlers for the core commands. Runs at startup for the core module only. */
import { stringify } from "smol-toml";
import type { ModuleContext } from "../kernel/context-api";
import { FanwitError } from "../kernel/errors";
import { logs } from "../kernel/logger";
import { basename, extname, joinPath } from "../host/types";
import { allTabsets, locateNode, parentOf, type RegionName, type TabsNode } from "../layout/model";
import { identity } from "../gen/identity";

const REGION_CYCLE: string[] = ["titlebar", "activity", "sidebar", "main", "inspector", "panel", "statusbar", "toasts"];

export function activateCore(ctx: ModuleContext) {
	const k = ctx.kernel;
	const { layout, windows, notify, themes, settings, vault, palette, menus } = k.sys;
	const h = (id: string, fn: Parameters<typeof ctx.commands.handle>[1]) => ctx.commands.handle(id, fn);
	const win = () => layout.windowId;
	/** The pane a command acts on: the one a menu was opened on (tab/context), else the active pane. */
	const targetPane = (inv: { target?: unknown }): string | undefined => (inv.target as { pane?: string } | undefined)?.pane ?? layout.activePane ?? undefined;
	const targetTabset = (inv: { target?: unknown }): string | undefined => {
		const pane = (inv.target as { pane?: string } | undefined)?.pane;
		return (pane && parentOf(layout.doc, pane)?.parent) || layout.activeTabset || undefined;
	};

	// ----- palette -----
	h("palette.open", () => palette.open(">"));
	h("palette.quickOpen", () => palette.open(""));
	h("palette.help", () => palette.open("?"));
	h("palette.windows", () => palette.open("~"));

	// ----- app -----
	h("app.settings", async ({ page }: { page?: string }) => {
		await windows.open("settings", page ? { page } : {});
	});
	h("app.about", () => windows.open("about"));
	h("app.show", async () => {
		await k.host.windows.show("main");
		await k.host.windows.focus("main");
	});
	h("app.quickCapture", () => windows.open("quick-capture"));
	h("app.onboarding", () => windows.open("onboarding"));
	h("app.reload", () => {
		k.events.emit("fw:reload" as never, {} as never, { scope: "app" });
		location.reload();
	});
	h("app.quit", async () => {
		if (!(await confirmShutdown(ctx, "quit"))) return false;
		await flushAll(ctx);
		await k.host.exit(0);
		return true;
	});
	h("app.version", async () => {
		const info = await k.host.app();
		return { name: info.name, version: info.version, tauri: info.tauriVersion, webview: info.webview, os: info.os };
	});
	h("commands.list", () =>
		k.commands
			.list()
			.filter((c) => c.def.cli)
			.map((c) => ({ id: c.def.id, title: c.def.title, category: c.def.category, description: c.def.description }))
	);
	h("app.copySystemInfo", async () => {
		const text = await systemInfo(ctx);
		await navigator.clipboard.writeText(text);
		notify.toast("System info copied", "success");
		return text;
	});
	h("app.diagnostics", async () => {
		const bundle = {
			system: await systemInfo(ctx),
			settings: settings.global.text,
			layout: layout.toToml(),
			logs: logs.records.slice(-2000).map((r) => `${new Date(r.time).toISOString()} ${r.level.toUpperCase()} [${r.scope}] ${r.message}`).join("\n")
		};
		const path = joinPath(k.host.dirs.log, `diagnostics-${Date.now()}.json`);
		await k.host.fs.writeText(path, JSON.stringify(bundle, null, 2));
		notify.send({ title: "Diagnostics bundle created", body: path, kind: "success", actions: k.host.caps.nativeWindows ? [{ label: "Show file", command: "shell.reveal", args: { path } }] : [] });
		return path;
	});
	ctx.commands.register({ id: "shell.reveal", title: "Reveal in file manager", palette: false, args: { path: { type: "string" } } }, ({ path }: { path: string }) => k.host.reveal(path));
	h("app.checkForUpdates", async () => {
		const r = await windows.open("update");
		return r.label;
	});
	h("app.print", () => window.print());
	// settings sync hooks (Section 21.1): every human file in one portable object
	const CONFIG_FILES = { settings: "settings.toml", keys: "keys.toml", menus: "menus.toml", commands: "commands.toml" } as const;
	h("app.exportConfig", async () => {
		const out: Record<string, string> = { app: k.sys.info.name, version: k.sys.info.version };
		for (const [key, file] of Object.entries(CONFIG_FILES)) out[key] = await k.host.fs.readText(joinPath(k.host.dirs.config, file)).catch(() => "");
		await navigator.clipboard.writeText(JSON.stringify(out, null, 1)).catch(() => {});
		notify.toast("Configuration copied to the clipboard", "success");
		return out;
	});
	h("app.importConfig", async ({ data }: { data: Record<string, string> }) => {
		const ok = await k.sys.dialog.ask("Replace your settings, keybindings, menus and user commands with the imported configuration?", { title: "Import configuration", okLabel: "Replace", kind: "warning" });
		if (!ok) return false;
		for (const [key, file] of Object.entries(CONFIG_FILES)) if (typeof data?.[key] === "string" && data[key]) await k.host.fs.writeText(joinPath(k.host.dirs.config, file), data[key]);
		notify.toast("Configuration imported; files reload automatically", "success");
		return true;
	});
	h("app.openPaths", async ({ paths }: { paths: string[] }) => {
		for (const p of paths ?? []) await openPath(ctx, p);
	});

	// ----- windows -----
	h("window.new", async () => {
		if (k.host.caps.nativeWindows) await vault.openInNewWindow(vault.current?.path ?? "");
		else window.open(location.href, "_blank");
	});
	h("window.close", async () => {
		if (k.windowKind === "main" && !(await confirmShutdown(ctx, "close"))) return;
		await flushAll(ctx);
		await k.host.windows.close();
	});
	h("window.open", ({ kind, props }: { kind: string; props?: Record<string, unknown> }) => windows.open(kind, props ?? {}).then((w) => w.label));
	h("window.popOut", async (_a, inv) => {
		const pane = targetPane(inv);
		if (!pane) return;
		await layout.dispatch({ type: "popOut", pane }, { origin: "command" });
	});
	h("window.minimize", () => k.host.windows.minimize());
	h("window.toggleMaximize", () => k.host.windows.toggleMaximize());
	h("window.toggleFullscreen", async () => {
		const on = !document.fullscreenElement && !(k.context.get("window.fullscreen") as boolean);
		k.context.set("window.fullscreen", on);
		await k.host.windows.setFullscreen(on);
	});
	h("window.cycle", () => windows.cycle());
	h("window.list", async () => (k.host.caps.nativeWindows ? await k.host.windows.list() : windows.virtual.map((v) => v.id)));

	// ----- layout -----
	const L = (a: Parameters<typeof layout.dispatch>[0]) => layout.dispatch(a, { origin: "command" });
	const split = (dir: "row" | "column", inv: { target?: unknown }) => {
		const pane = (inv.target as { pane?: string } | undefined)?.pane;
		return L({ type: "split", dir, node: targetTabset(inv), pane: pane && layout.doc.pane[pane] ? pane : undefined });
	};
	h("layout.splitRight", (_a, inv) => split("row", inv));
	h("layout.splitDown", (_a, inv) => split("column", inv));
	h("layout.togglePrimarySidebar", () => L({ type: "toggleRegion", region: "sidebar" }));
	h("layout.toggleSecondarySidebar", () => L({ type: "toggleRegion", region: "inspector" }));
	h("layout.togglePanel", () => L({ type: "toggleRegion", region: "panel" }));
	h("layout.toggleZen", () => L({ type: "setAttrs", table: "window", id: win(), attrs: { zen: !layout.doc.window[win()]?.zen || undefined } }));
	h("layout.maximizeTabset", (_a, inv) => L({ type: "maximize", node: targetTabset(inv) }));
	h("layout.equalize", () => {
		const p = layout.activeTabset ? parentOf(layout.doc, layout.activeTabset) : null;
		const split = p && layout.doc.node[p.parent];
		if (split?.type === "split") return L({ type: "setSizes", node: p!.parent, sizes: (split as { children: string[] }).children.map(() => 1) });
	});
	h("layout.applyPreset", ({ preset }: { preset: string }) => layout.applyPreset(preset));
	h("layout.reset", () => layout.reset());
	h("layout.openToml", () => layout.openView("fanwit.tomlEditor", { file: "workspace" }, { target: "beside" }));
	h("layout.openView", ({ view, region, props }: { view: string; region?: string; props?: Record<string, unknown> }) => layout.openView(view, props, { target: region }));
	h("layout.saveWorkspace", ({ name }: { name: string }) => layout.saveWorkspace(name, vault.current?.configDir ?? k.host.dirs.data));
	h("layout.loadWorkspace", ({ name }: { name: string }) => layout.loadWorkspace(name, vault.current?.configDir ?? k.host.dirs.data));
	h("layout.floatPane", (_a, inv) => {
		const pane = targetPane(inv);
		if (pane) return L({ type: "float", pane });
	});
	h("layout.moveToPanel", (_a, inv) => {
		const pane = targetPane(inv);
		if (pane) return L({ type: "movePane", pane, to: { region: "panel" } });
	});
	const cycleRegion = (dir: 1 | -1) => {
		const regions = REGION_CYCLE.filter((r) => document.querySelector(`[data-fw-region="${r}"]`));
		const cur = (document.activeElement?.closest("[data-fw-region]") as HTMLElement | null)?.dataset.fwRegion;
		const i = cur ? regions.indexOf(cur) : -1;
		const next = regions[(i + dir + regions.length) % regions.length];
		const el = document.querySelector(`[data-fw-region="${next}"]`) as HTMLElement | null;
		const target = el?.querySelector<HTMLElement>('[tabindex="0"], button, input, textarea, [href], [tabindex]:not([tabindex="-1"])') ?? el;
		target?.focus();
	};
	h("layout.focusNextRegion", () => cycleRegion(1));
	h("layout.focusPreviousRegion", () => cycleRegion(-1));

	// ----- tabs -----
	const step = (d: 1 | -1) => {
		const ts = layout.activeTabset ?? allTabsets(layout.doc, win()).find((t) => locateNode(layout.doc, t)?.region === "main");
		const t = ts ? (layout.doc.node[ts] as TabsNode) : null;
		if (!t?.panes.length) return;
		const i = Math.max(0, t.panes.indexOf(t.active ?? ""));
		return L({ type: "selectPane", pane: t.panes[(i + d + t.panes.length) % t.panes.length] });
	};
	h("tab.next", () => step(1));
	h("tab.prev", () => step(-1));
	h("tab.close", async (_a, inv) => {
		const pane = targetPane(inv);
		if (!pane) return;
		if (layout.dirty[pane] && !(await k.sys.dialog.ask(`"${layout.paneTitle(pane)}" has unsaved changes. Close it anyway?`, { title: "Close tab", okLabel: "Close without saving", kind: "warning" }))) return;
		await L({ type: "closePane", pane });
	});
	h("tab.closeOthers", (_a, inv) => {
		const pane = targetPane(inv);
		if (pane) return L({ type: "closeOthers", pane });
	});
	h("tab.reopen", () => layout.reopenClosed());
	h("tab.pin", (_a, inv) => {
		const pane = targetPane(inv);
		if (pane) return L({ type: "setAttrs", table: "pane", id: pane, attrs: { pinned: !layout.doc.pane[pane]?.pinned || undefined } });
	});
	h("tab.copyPath", async (_a, inv) => {
		const pane = targetPane(inv);
		const path = pane ? (layout.doc.pane[pane]?.props?.path as string | undefined) : undefined;
		if (path) {
			await navigator.clipboard.writeText(path);
			notify.toast("Path copied", "success");
		}
	});

	// ----- vaults -----
	h("vault.open", async ({ path }: { path?: string }) => (await vault.open(path)).name);
	h("vault.create", async ({ name, template }: { name: string; template?: string }) => (await vault.create({ name, template })).name);
	h("vault.switch", () => windows.open("vaults"));
	h("vault.close", () => vault.close());
	h("vault.reveal", () => vault.current && k.host.reveal(vault.current.path));
	h("vault.openInNewWindow", ({ path }: { path: string }) => vault.openInNewWindow(path));
	h("vault.backup", async () => {
		const v = vault.current;
		if (!v) return;
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		const dest = joinPath(v.configDir, "backups", stamp);
		await k.sys.jobs.run(`Back up ${v.name}`, async ({ report }) => {
			const files = (await k.host.fs.list(v.configDir, { recursive: true })).filter((f) => !f.dir && !f.path.includes("/backups/") && !f.path.endsWith("/lock") && !f.path.includes("/cache/"));
			for (const [i, f] of files.entries()) {
				const rel = f.path.slice(v.configDir.length + 1);
				if (rel.endsWith(".db") && k.host.caps.sql) {
					// consistent snapshot of live databases
					const db = k.sys.db.sql("fanwit", { scope: "vault", file: rel.replace(/^data\//, "") });
					await db.exec(`VACUUM INTO '${joinPath(dest, rel).replace(/'/g, "''")}'`).catch(() => {});
				} else if (!/\.db-(wal|shm)$/.test(rel)) await k.host.fs.write(joinPath(dest, rel), await k.host.fs.read(f.path));
				report((i + 1) / files.length, rel);
			}
		});
		notify.send({ title: "Vault backed up", body: dest, kind: "success" });
		return dest;
	});

	// ----- themes -----
	h("theme.select", ({ theme }: { theme: string }) => ctx.themes.set(theme));
	h("theme.toggleMode", () => settings.set("theme.mode", themes.mode === "dark" ? "light" : "dark"));
	h("theme.setMode", ({ mode }: { mode: string }) => settings.set("theme.mode", mode));
	h("theme.studio", () => (k.host.caps.nativeWindows ? windows.open("theme-studio") : layout.openView("fanwit.themeStudio")));

	// ----- keys, menus -----
	h("keys.open", () => windows.open("settings", { page: "Keyboard" }));
	h("keys.showOverlay", () => k.events.emit("fw:keys-overlay" as never, {} as never));
	h("menus.edit", ({ location, item }: { location?: string; item?: string }) => windows.open("menu-editor", { location, item }));
	h("menus.resetAll", () => {
		for (const l of new Set(menus.patches.map((p) => p.location))) menus.resetLocation(l);
	});

	// ----- notifications -----
	h("notify.toggleCenter", () => (notify.centerOpen = !notify.centerOpen));
	h("notify.clearAll", () => notify.clearAll());
	h("notify.setDoNotDisturb", ({ minutes }: { minutes: number }) => {
		notify.setDnd(minutes);
		notify.toast(minutes ? `Do not disturb for ${minutes} minutes` : "Do not disturb is off");
	});
	h("notify.send", (spec: { title: string; body?: string; kind?: "info" }) => notify.send({ ...spec, source: "cli" }).id);

	// ----- history -----
	h("history.undo", async () => {
		const r = await k.history.undo();
		if (r && typeof r === "string") notify.toast(`Undid ${r}`);
		return r;
	});
	h("history.redo", () => k.history.redo());

	// ----- clipboard, edit, shell -----
	h("clipboard.copy", async ({ text }: { text: string }) => {
		await navigator.clipboard.writeText(text);
		notify.toast("Copied to clipboard", "success");
	});
	const exec = (cmd: string) => () => {
		// text/context in inputs: the focused field is the target
		document.execCommand(cmd);
	};
	h("edit.cut", exec("cut"));
	h("edit.copy", exec("copy"));
	h("edit.paste", async (_a, inv) => {
		const el = (inv.element as HTMLInputElement | null) ?? (document.activeElement as HTMLInputElement | null);
		const text = await navigator.clipboard.readText().catch(() => "");
		if (el && "setRangeText" in el) {
			el.setRangeText(text, el.selectionStart ?? 0, el.selectionEnd ?? 0, "end");
			el.dispatchEvent(new Event("input", { bubbles: true }));
		} else document.execCommand("insertText", false, text);
	});
	h("edit.selectAll", (_a, inv) => {
		const el = inv.element as HTMLInputElement | null;
		if (el && "select" in el) el.select();
		else document.execCommand("selectAll");
	});
	h("shell.open", ({ path }: { path: string }) => k.host.openExternal(path));
	h("shell.openExternal", async ({ url }: { url: string }) => {
		if (!/^https:\/\//i.test(url) && !(await k.sys.dialog.ask(`Open ${url}? It is not an HTTPS link.`, { title: "Open link", okLabel: "Open" }))) return;
		await k.host.openExternal(url);
	});

	// ----- developer -----
	h("dev.toggleMode", () => settings.set("dev.mode", !settings.get("dev.mode")));
	h("dev.inspect", () => k.events.emit("fw:inspect" as never, {} as never));
	h("dev.logs", () => (layout.views.has("fanwit.logs") ? layout.openView("fanwit.logs", {}, { target: "panel" }) : undefined));
	h("dev.console", () => layout.openView("fanwit.console", {}, { target: "panel" }));
	h("dev.eventMonitor", () => layout.openView("fanwit.events", {}, { target: "panel" }));
	h("dev.commandLog", () => layout.openView("fanwit.commandLog", {}, { target: "panel" }));
	h("dev.contextKeys", () => layout.openView("fanwit.contextKeys", {}, { target: "inspector" }));
	h("dev.openDevtools", () => notify.toast(k.host.kind === "tauri" ? "Right click and choose Inspect, or press Ctrl+Shift+I in a debug build" : "Use your browser's developer tools (F12)"));
	h("dev.crash", () => windows.open("crash", { message: "Simulated crash for testing the report dialog." }));
	h("dev.reloadPlugins", () => k.events.emit("fw:plugins-reload" as never, {} as never));
	startMacroRecorder(ctx);

	// ----- manual -----
	h("manual.open", ({ page }: { page?: string }) => {
		// F1: the focused view's help page
		const view = page ? undefined : layout.activePane ? layout.views.get(layout.doc.pane[layout.activePane]?.view) : undefined;
		return windows.open("manual", { page: page ?? view?.help ?? "" });
	});
	h("manual.search", ({ query }: { query: string }) => windows.open("manual", { search: query }));
	h("plugins.open", () => windows.open("plugins"));

	// tray menu items arrive as command ids
	k.host.events.on<string>("fw://tray", (id) => void k.commands.run(id === "app.show" ? "app.show" : id, {}, { source: "menu" }).catch((e) => notify.error(e)));
	k.host.events.on<string[]>("fw://open-paths", (paths) => void k.commands.run("app.openPaths", { paths }, { source: "uri" }).catch((e) => notify.error(e)));

	// layout regions as context keys for menus and bindings
	effectRoot(ctx, () => {
		const w = layout.doc.window[win()];
		for (const r of ["sidebar", "inspector", "panel"] as RegionName[]) k.context.set(`layout.${r}Visible`, w?.regions?.[r]?.visible ?? r === "sidebar");
	});
}

/** Run an effect for the lifetime of a module (disposed with its subscriptions). */
function effectRoot(ctx: ModuleContext, fn: () => void) {
	const stop = $effect.root(() => {
		$effect(fn);
	});
	ctx.subscriptions.push({ dispose: stop });
}

async function confirmShutdown(ctx: ModuleContext, reason: "close" | "quit") {
	const k = ctx.kernel;
	const reasons = await k.lifecycle.collectVetoes(reason);
	if (reasons.length) {
		const ok = await k.sys.dialog.ask(`${reasons.join("\n")}\n\n${reason === "quit" ? "Quit" : "Close"} anyway?`, { title: "Unsaved work", okLabel: reason === "quit" ? "Quit anyway" : "Close anyway", kind: "warning" });
		if (!ok) return false;
	} else if (reason === "quit" && k.sys.settings.get("general.confirmQuit")) {
		if (!(await k.sys.dialog.ask(`Quit ${identity.name}?`, { title: "Quit", okLabel: "Quit" }))) return false;
	}
	return true;
}

async function flushAll(ctx: ModuleContext) {
	const s = ctx.kernel.sys;
	await Promise.all([s.layout.flush(), s.settings.flush(), s.storage.flush(), s.keysFile?.flush(), s.menus.file?.flush()].map((p) => Promise.resolve(p).catch(() => {})));
}

async function systemInfo(ctx: ModuleContext) {
	const info = await ctx.kernel.host.app();
	return [
		`${info.name} ${info.version}`,
		info.tauriVersion ? `Tauri ${info.tauriVersion}` : "Web build",
		info.webview ? `Webview ${info.webview}` : "",
		`OS ${info.os} ${info.arch ?? ""}`.trim(),
		`Host ${ctx.kernel.host.kind} (${ctx.kernel.host.platform})`,
		`Vault ${ctx.kernel.sys.vault.current ? "open" : "none"}`,
		`Modules ${ctx.kernel.modules.list().length}`
	]
		.filter(Boolean)
		.join("\n");
}

/** Open a path or deep link handed to the app (CLI, file association, second instance). */
export async function openPath(ctx: ModuleContext, p: string): Promise<unknown> {
	const k = ctx.kernel;
	const scheme = `${identity.scheme}://`;
	if (p.startsWith(scheme)) return handleDeepLink(ctx, p);
	const st = await k.host.fs.stat(p).catch(() => null);
	if (!st) throw new FanwitError("PATH_MISSING", { message: `Cannot open ${p}: it does not exist.` });
	if (st.dir) return k.sys.vault.open(p);
	// a file: open its folder as a vault when needed, then the file in the view registered for its type
	const v = k.sys.vault;
	if (!v.current || !p.startsWith(v.current.path + "/")) await v.open(p.slice(0, p.lastIndexOf("/")));
	const rel = v.rel(p);
	const ext = extname(p);
	const view = [...k.sys.layout.views.values()].find((x) => (x as { opens?: string[] }).opens?.includes(ext));
	if (view) await k.sys.layout.openView(view.id, { path: rel });
	else k.sys.notify.toast(`No view opens .${ext} files; showing ${basename(p)} in the explorer`);
}

/** appname://run/<command>?arg=value enters the pipeline with source "uri" (Section 15.1.4). */
export async function handleDeepLink(ctx: ModuleContext, url: string): Promise<unknown> {
	const k = ctx.kernel;
	const u = new URL(url);
	const [head, ...rest] = (u.host + u.pathname).split("/").filter(Boolean);
	if (head === "run") {
		const id = rest.join("/");
		const entry = k.commands.get(id);
		if (!entry?.def.uri) throw new FanwitError("PERMISSION_DENIED", { message: `Links cannot run "${id}".`, hint: "Only commands marked uri: true can be triggered by links." });
		const args: Record<string, unknown> = Object.fromEntries(u.searchParams.entries());
		// links can come from untrusted pages: commands with confirm always ask
		return k.commands.run(id, args, { source: "uri", confirmed: false });
	}
	if (head === "open" && u.searchParams.get("path")) return openPath(ctx, u.searchParams.get("path")!);
	await k.modules.fire(`onUri:${head}`);
	k.events.emit("app:uri" as never, { url, module: head, path: rest.join("/"), params: Object.fromEntries(u.searchParams) } as never);
}

/** Developer: Record Macro writes invoked commands to commands.toml (Section 5.6). */
function startMacroRecorder(ctx: ModuleContext) {
	const k = ctx.kernel;
	let steps: { run: string; args?: Record<string, unknown> }[] | null = null;
	ctx.subscriptions.push(
		k.commands.onDidExecute.on((r) => {
			if (!steps || !r.ok || r.id === "dev.recordMacro" || r.id.startsWith("palette.")) return;
			steps.push(Object.keys(r.args).length ? { run: r.id, args: r.args } : { run: r.id });
		})
	);
	ctx.commands.handle("dev.recordMacro", async () => {
		if (!steps) {
			steps = [];
			k.context.set("macro.recording", true);
			k.sys.notify.toast("Recording macro. Run the command again to stop.");
			return;
		}
		const recorded = steps;
		steps = null;
		k.context.set("macro.recording", false);
		if (!recorded.length) return k.sys.notify.toast("Nothing recorded");
		const file = k.sys.userCommands!;
		const list = ((file.value.command as unknown[]) ?? []).slice();
		const id = `user.macro${list.length + 1}`;
		list.push({ id, title: `Macro ${list.length + 1}`, steps: recorded });
		file.set({ ...file.value, command: list });
		await file.flush();
		k.events.emit("fw:user-commands" as never, {} as never);
		k.sys.notify.send({ title: `Saved ${id} to commands.toml`, body: stringify({ steps: recorded }).slice(0, 300), kind: "success" });
	});
}
