/**
 * The docs site (`vite --mode docs`) is the Manual window on the web host, so it boots the app's
 * kernel. A reader should not be able to open vaults, the command palette or the Settings window
 * from it: only reading commands survive, and the shortcuts that would open the palette search the
 * manual instead.
 */
import type { Kernel } from "../kernel/kernel.svelte";

/** Commands a reader of the docs site can run. Everything else is removed from the registry. */
const KEEP = [
	/^manual\./,
	/^tab\.(next|prev|close|closeOthers|reopen)$/,
	/^layout\.(splitRight|splitDown|equalize|maximizeTabset)$/,
	/^history\.(undo|redo)$/,
	/^theme\.(select|toggleMode|setMode)$/,
	/^notify\.(send|toggleCenter|clearAll)$/,
	/^(clipboard\.copy|edit\.\w+|shell\.openExternal|app\.print|window\.toggleFullscreen|fanwit\.setDensity)$/
];

const allowedOnDocsSite = (id: string) => KEEP.some((r) => r.test(id));

export function docsSite(k: Kernel) {
	k.commands.prune(allowedOnDocsSite);
	// the palette's shortcuts search the manual (lowest tier, so key chips keep showing Ctrl+K)
	for (const key of ["mod+p", "mod+shift+p"]) k.keys.add({ key, command: "manual.focusSearch" }, "docs", "core");
	// popped out and floating panes are drawn by windows the docs site never starts
	k.sys.layout.intercept((a, next) => {
		const away = a.type === "popOut" || a.type === "float" || (a.type === "movePane" && "float" in a.to);
		return away ? undefined : next(a);
	});
}
