// Runs in a Web Worker (isolation = "worker"): no DOM, no IPC; ctx is a permission checked proxy.
import { definePlugin } from "@fanwit/plugin-sdk";

export default definePlugin((ctx) => {
	const item = ctx.statusbar.item("wordCount.item");
	const NOTE = "notes.editor";
	// live text of open notes (notes:changed carries unsaved edits), by path
	const live = new Map();
	let active = { view: null, path: null };
	let mode = "words";
	let last = { path: "", words: 0, chars: 0 };

	const wpm = () => ctx.settings.get("wordCount.wpm") || 230;
	const count = (text) => ({ words: text.trim().split(/\s+/).filter(Boolean).length, chars: text.replace(/\s/g, "").length });

	function show() {
		if (active.view !== NOTE || !active.path) {
			// not in a note: the count of the previous one would be wrong here
			item.text = "";
			return;
		}
		const minutes = Math.max(1, Math.ceil(last.words / wpm()));
		item.text = mode === "chars" ? `${last.chars} characters` : mode === "time" ? `${minutes} min read` : `${last.words} words`;
		item.tooltip = `${last.words} words, ${last.chars} characters, ${minutes} min read. Right click for options.`;
	}
	async function measure(path) {
		if (!path) return show();
		let text = live.get(path);
		if (text === undefined) {
			try {
				text = await ctx.vault.readText(path);
			} catch (err) {
				ctx.log.warn("word count:", err.message);
				text = "";
			}
		}
		if (path !== active.path) return; // the user moved on while we read
		last = { path, ...count(text) };
		show();
	}

	ctx.events.on("layout:activePane", (e) => {
		active = { view: e.view, path: e.path };
		void measure(e.view === NOTE ? e.path : null);
	});
	// layout:activePane alone says which note is in front; note events only refresh the text
	ctx.events.on("notes:changed", (e) => {
		live.set(e.path, e.text ?? "");
		if (e.path === active.path) void measure(e.path);
	});

	ctx.commands.handle("wordCount.show", () => {
		ctx.notify.toast(last.path ? `${last.path}: ${last.words} words, ${last.chars} characters` : "Open a note to count its words");
		return last;
	});
	// the status item's context menu (plugin.toml [[contributes.menus."statusbar/item"]]) picks what it shows
	ctx.commands.handle("wordCount.mode", ({ mode: m }) => {
		mode = m;
		show();
	});
	show();
});
