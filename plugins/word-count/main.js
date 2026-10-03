// Runs in a Web Worker (isolation = "worker"): no DOM, no IPC; ctx is a permission checked proxy.
import { definePlugin } from "@fanwit/plugin-sdk";

export default definePlugin((ctx) => {
	const item = ctx.statusbar.item("wordCount.item");
	let last = { words: 0, path: "" };
	const count = (text) => text.trim().split(/\s+/).filter(Boolean).length;
	const show = (words, path) => {
		last = { words, path };
		item.text = `${words} words`;
		item.tooltip = `${Math.max(1, Math.ceil(words / (ctx.settings.get("wordCount.wpm") || 230)))} min read`;
	};
	ctx.events.on("notes:changed", (e) => show(count(e.text ?? ""), e.path));
	ctx.events.on("notes:opened", async (e) => {
		try {
			show(count(await ctx.vault.readText(e.path)), e.path);
		} catch (err) {
			ctx.log.warn("word count:", err.message);
		}
	});
	ctx.commands.handle("wordCount.show", () => {
		ctx.notify.toast(last.path ? `${last.path}: ${last.words} words` : "Open a note to count its words");
		return last;
	});
	item.text = "– words";
});
