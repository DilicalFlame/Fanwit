/**
 * After the first paint (Section 3.6, 16.5.1): show the window, offer the crash report, run
 * onboarding on first launch, restore the last vault, hand over launch paths and deep links,
 * then activate lazy work in an idle callback.
 */
import type { Kernel } from "./kernel/kernel.svelte";
import { joinPath } from "./host/types";
import { logs } from "./kernel/logger";
import { handleDeepLink } from "./core/handlers.svelte";

const idle = (fn: () => void) => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(fn) : setTimeout(fn, 1));

/** Every window: show after first paint, report errors, flush on blur and close. */
export async function afterFirstPaint(k: Kernel) {
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	k.lifecycle.set("ready");
	// first run on desktop: the main window stays hidden until onboarding closes (mainStartup shows it)
	const deferred = k.host.windows.label === "main" && k.host.caps.nativeWindows && (await needsOnboarding(k));
	if (!k.sys.info.headless && !deferred) await k.host.windows.show().catch(() => {});
	const log = logs.scoped("app");
	window.addEventListener("error", (e) => log.error("uncaught:", e.message, { file: e.filename, line: e.lineno }));
	window.addEventListener("unhandledrejection", (e) => log.error("unhandled rejection:", String((e.reason as Error)?.message ?? e.reason)));
	window.addEventListener("blur", () => void flush(k));
	// reloads (including dev hot reloads) and closing a browser tab: best effort
	window.addEventListener("pagehide", () => void flush(k));
	k.host.windows.onCloseRequested(async () => {
		if (k.windowKind === "main" && k.host.windows.label === "main") {
			const reasons = await k.lifecycle.collectVetoes("close");
			if (reasons.length && !(await k.sys.dialog.ask(`${reasons.join("\n")}\n\nClose anyway?`, { title: "Unsaved work", okLabel: "Close anyway", kind: "warning" }))) return false;
		}
		await flush(k);
		return true;
	});
	// network status for when clauses and retry logic
	const online = () => k.context.set("network.online", navigator.onLine);
	online();
	window.addEventListener("online", online);
	window.addEventListener("offline", online);
	k.context.declare("network.online", "boolean", "The device is online");
	// files dropped from the OS route to a command (Section 21.1)
	k.host.onFileDrop((paths) => void dropped(k, paths));
	k.lifecycle.set("restored");
	idle(() => {
		void k.modules.fire("onStartupFinished", true).then(() => {
			k.lifecycle.set("idle");
			log.info(`startup finished (${Math.round(performance.now())} ms since navigation)`);
		});
	});
}

async function dropped(k: Kernel, paths: string[]) {
	if (k.host.kind === "tauri") return k.commands.run("app.openPaths", { paths }, { source: "api" }).catch((e) => k.sys.notify.error(e));
	// web: copy dropped files into the open vault
	const v = k.sys.vault;
	if (!v.current) return k.sys.notify.toast("Open a vault to import dropped files", "warning");
	for (const p of paths) {
		const name = p.split("/").pop()!;
		await v.fs.write(name, await k.host.fs.read(p));
	}
	k.sys.notify.toast(`Imported ${paths.length} file${paths.length > 1 ? "s" : ""} into ${v.current.name}`, "success");
}

async function flush(k: Kernel) {
	const s = k.sys;
	await Promise.all([s.layout.flush(), s.settings.flush(), s.storage.flush(), s.menus.file?.flush()].map((p) => Promise.resolve(p).catch(() => {})));
}

async function needsOnboarding(k: Kernel) {
	if (k.sys.info.headless || k.sys.config.features?.onboarding === false) return false;
	return !(await k.sys.storage.get<boolean>("fanwit", "onboarded").catch(() => false));
}

/** Main window only: first launch flow and restoring state. */
export async function mainStartup(k: Kernel) {
	const { vault, settings, windows, layout } = k.sys;
	const params = new URLSearchParams(location.search);

	// crash on the previous run
	const crashPath = joinPath(k.host.dirs.log, "crash.json");
	const crash = await k.host.fs.readText(crashPath).catch(() => null);
	if (crash) {
		await k.host.fs.remove(crashPath).catch(() => {});
		try {
			void windows.open("crash", JSON.parse(crash));
		} catch {
			/* malformed marker */
		}
	}

	// vault: explicit ?vault=, launch paths, or the last one
	const launch = k.host.kind === "tauri" ? await k.host.invoke<string[]>("fw_take_launch_paths").catch(() => []) : [];
	const explicit = params.get("vault");
	try {
		if (explicit) await vault.open(explicit);
		else if (!launch.length && settings.get("general.startup.restoreVault") && vault.recentList[0]) {
			const last = vault.recentList[0];
			if (await k.host.fs.exists(last.path).catch(() => false)) await vault.open(last.path);
		}
	} catch (e) {
		logs.scoped("vault").warn("could not restore the last vault:", (e as Error).message);
	}
	if (launch.length) void k.commands.run("app.openPaths", { paths: launch }, { source: "uri" }).catch((e: unknown) => k.sys.notify.error(e));

	if (!settings.get("general.startup.showWelcome")) {
		const welcome = Object.entries(layout.doc.pane).find(([, p]) => p.view === "fanwit.welcome")?.[0];
		if (welcome && Object.keys(layout.doc.pane).length > 1) void layout.dispatch({ type: "closePane", pane: welcome }, { undoable: false });
	}

	// first run: onboarding, then the vault manager when the data mode needs a vault
	if (await needsOnboarding(k)) {
		try {
			const w = await windows.open("onboarding");
			await w.result;
		} finally {
			if (k.host.caps.nativeWindows) await k.host.windows.show().catch(() => {});
		}
	}
	if (k.sys.config.data?.mode === "vault" && !vault.current && !k.sys.info.headless) void windows.open("vaults");

	// deep links (desktop: plugin; web: ?link=)
	if (k.host.kind === "tauri") {
		const dl = await import("@tauri-apps/plugin-deep-link");
		const ctx = k.modules.modules.get("fanwit.core")!.ctx!;
		for (const url of (await dl.getCurrent().catch(() => null)) ?? []) void handleDeepLink(ctx, url).catch((e: unknown) => k.sys.notify.error(e));
		void dl.onOpenUrl((urls) => urls.forEach((u) => void handleDeepLink(ctx, u).catch((e: unknown) => k.sys.notify.error(e))));
	} else if (params.get("link")) {
		void handleDeepLink(k.modules.modules.get("fanwit.core")!.ctx!, params.get("link")!).catch((e: unknown) => k.sys.notify.error(e));
	}

	watchLayoutWindows(k);
}

/** Popped out panes: each extra layout window becomes a native window (or a virtual one on the web). */
function watchLayoutWindows(k: Kernel) {
	const { layout, windows } = k.sys;
	const open = new Set<string>();
	$effect.root(() => {
		$effect(() => {
			const ids = Object.entries(layout.doc.window)
				.filter(([id, w]) => id !== "main" && w.kind === "aux")
				.map(([id]) => id);
			for (const id of ids) {
				if (open.has(id)) continue;
				open.add(id);
				if (k.host.caps.nativeWindows) {
					const q = new URLSearchParams({ window: id });
					if (k.sys.vault.current) q.set("vault", k.sys.vault.current.path);
					const title = layout.paneTitle(firstPane(k, id) ?? id);
					// the new window reads workspace.toml from disk: write the pop out first
					void layout.flush().then(() => k.host.windows.open({ label: `aux-${id}`, url: `/w/view?${q}`, title, width: 900, height: 640, stateKey: `view:${id}`, visible: false }));
				} else {
					const v = { id: `aux-${id}`, kind: "view", spec: { kind: "view", base: "aux" as const, view: "layout" }, props: {}, title: layout.paneTitle(firstPane(k, id) ?? id), rect: { x: 120 + open.size * 24, y: 80 + open.size * 24, w: 720, h: 480 }, z: 50, minimized: false, maximized: false, modal: false, opener: "main", resolve: () => void layout.dispatch({ type: "popIn", window: id }), feedback: null, layoutWindow: id };
					windows.virtual = [...windows.virtual, v];
				}
			}
			for (const id of [...open]) {
				if (ids.includes(id)) continue;
				open.delete(id);
				if (k.host.caps.nativeWindows) void k.host.windows.close(`aux-${id}`).catch(() => {});
				else windows.virtual = windows.virtual.filter((v) => v.layoutWindow !== id);
			}
		});
	});
}

function firstPane(k: Kernel, windowId: string): string | undefined {
	const doc = k.sys.layout.doc;
	let id = doc.window[windowId]?.root;
	for (let i = 0; id && i < 20; i++) {
		if (doc.pane[id]) return id;
		const n = doc.node[id] as { children?: string[]; panes?: string[] } | undefined;
		if (n?.panes?.length) return n.panes[0];
		id = n?.children?.[0];
	}
	return undefined;
}
