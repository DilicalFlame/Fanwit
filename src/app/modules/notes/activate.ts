import type { ModuleContext } from "$fanwit";

/** [[wikilinks]] and [text](relative.md) links in a note. */
export function extractLinks(text: string): string[] {
	const out = new Set<string>();
	for (const m of text.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) out.add(m[1].trim().replace(/(\.md)?$/, ".md"));
	for (const m of text.matchAll(/\]\(([^)\s]+\.md)\)/g)) if (!/^[a-z]+:/i.test(m[1])) out.add(m[1].replace(/^\.\//, ""));
	return [...out];
}

export default function activate(ctx: ModuleContext) {
	// Obsidian style backlinks: an indexer the vault keeps current, queried with SQL
	ctx.subscriptions.push(ctx.vault.index.register({ id: "notes.links", glob: "**/*.md", parse: (_path, text) => ({ links: extractLinks(text) }) }));
	ctx.commands.handle("notes.showBacklinks", () => ctx.layout.openView("notes.backlinks", {}, { target: "inspector" }));
	ctx.commands.handle("notes.newDaily", async () => {
		const folder = ctx.settings.get<string>("notes.daily.folder") || "Daily";
		const today = new Date().toISOString().slice(0, 10);
		const path = `${folder}/${today}.md`;
		if (!(await ctx.vault.fs.exists(path))) await ctx.vault.fs.write(path, `# ${today}\n\n`);
		await ctx.layout.openView("notes.editor", { path });
		return path;
	});
	ctx.commands.handle("notes.openPreview", (args: { path?: string }) => {
		const path = args.path ?? (ctx.layout.active?.props?.path as string | undefined);
		if (path) return ctx.layout.openView("notes.preview", { path }, { target: "beside" });
	});
	ctx.commands.handle("notes.togglePreview", () => ctx.events.emit("notes:togglePreview" as never, {} as never));
}
