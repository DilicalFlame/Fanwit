import type { ModuleContext } from "$fanwit";

export default function activate(ctx: ModuleContext) {
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
