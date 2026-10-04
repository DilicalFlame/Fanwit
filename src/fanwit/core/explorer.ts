/** File commands behind the explorer, quick capture and the vault manager menus. */
import { defineModule } from "../kernel/module";
import { FanwitError } from "../kernel/errors";
import { viewForPath } from "./palette";

const join = (dir: string, name: string) => (dir ? `${dir.replace(/\/+$/, "")}/${name}` : name);

export const explorerModule = defineModule({
	id: "fanwit.explorer",
	title: "Explorer",
	tier: "core",
	contributes: {
		commands: [
			{ id: "explorer.newFile", title: "New file", category: "Explorer", icon: "file-plus", when: "vault.open", args: { dir: { type: "string", default: "" }, name: { type: "string", title: "File name" } } },
			{ id: "explorer.newFolder", title: "New folder", category: "Explorer", icon: "folder-plus", when: "vault.open", args: { dir: { type: "string", default: "" }, name: { type: "string", title: "Folder name" } } },
			{ id: "explorer.open", title: "Open", category: "Explorer", icon: "file-text", palette: false, args: { path: { type: "string" } } },
			{ id: "explorer.openToSide", title: "Open to the side", category: "Explorer", icon: "columns-2", palette: false, args: { path: { type: "string" } } },
			{ id: "explorer.rename", title: "Rename", category: "Explorer", icon: "pencil", palette: false, undoable: true, args: { path: { type: "string" }, to: { type: "string", title: "New name" } } },
			{ id: "explorer.delete", title: "Delete", category: "Explorer", icon: "trash-2", palette: false, args: { path: { type: "string" } } },
			{ id: "explorer.copyPath", title: "Copy path", category: "Explorer", icon: "copy", palette: false, args: { path: { type: "string" } } },
			{ id: "explorer.reveal", title: "Reveal in file manager", category: "Explorer", icon: "folder-search", palette: false, args: { path: { type: "string" } }, when: "host.nativeWindows" },
			{ id: "capture.append", title: "Append to inbox", category: "Capture", icon: "inbox", args: { text: { type: "string" }, file: { type: "string", default: "Inbox.md" } }, cli: true },
			{ id: "vault.forget", title: "Remove from list", category: "Vault", palette: false, args: { path: { type: "string" } } },
			{ id: "vault.pin", title: "Pin vault", category: "Vault", palette: false, args: { path: { type: "string" } } }
		],
		menuLocations: [
			{ id: "vault/item", description: "A vault in the Vault Manager", target: "RecentVault" },
			{ id: "keys/row", description: "A row in the keyboard shortcuts editor", target: "Command" }
		],
		menus: {
			"explorer/item": [
				{ id: "explorer.open", command: "explorer.open", group: "navigation", order: 1, args: { path: "${target.path}" }, when: "!explorer.isDir" },
				{ id: "explorer.openToSide", command: "explorer.openToSide", group: "navigation", order: 2, args: { path: "${target.path}" }, when: "!explorer.isDir" },
				{ id: "explorer.newFile", command: "explorer.newFile", group: "open", order: 1, args: { dir: "${target.dir}" } },
				{ id: "explorer.newFolder", command: "explorer.newFolder", group: "open", order: 2, args: { dir: "${target.dir}" } },
				{ id: "explorer.copyPath", command: "explorer.copyPath", group: "clipboard", order: 1, args: { path: "${target.path}" } },
				{ id: "explorer.reveal", command: "explorer.reveal", group: "clipboard", order: 2, args: { path: "${target.path}" } },
				{ id: "explorer.rename", command: "explorer.rename", group: "modify", order: 1, args: { path: "${target.path}" } },
				{ id: "explorer.delete", command: "explorer.delete", group: "danger", order: 1, args: { path: "${target.path}" } }
			],
			"explorer/empty": [
				{ id: "explorer.newFile.root", command: "explorer.newFile", group: "open", order: 1, args: { dir: "" } },
				{ id: "explorer.newFolder.root", command: "explorer.newFolder", group: "open", order: 2, args: { dir: "" } }
			],
			"vault/item": [
				{ id: "vault.item.open", command: "vault.open", group: "navigation", order: 1, label: "Open", args: { path: "${target.path}" } },
				{ id: "vault.item.newWindow", command: "vault.openInNewWindow", group: "navigation", order: 2, label: "Open in new window", args: { path: "${target.path}" } },
				{ id: "vault.item.pin", command: "vault.pin", group: "modify", order: 1, args: { path: "${target.path}" } },
				{ id: "vault.item.reveal", command: "shell.reveal", group: "modify", order: 2, label: "Reveal in file manager", args: { path: "${target.path}" }, when: "host.nativeWindows" },
				{ id: "vault.item.forget", command: "vault.forget", group: "danger", order: 1, label: "Remove from list (keeps files)", args: { path: "${target.path}" } }
			],
			"keys/row": [
				{ id: "keys.row.run", command: "fanwit.runCommand", group: "navigation", order: 1, label: "Run command", args: { id: "${target.command}" } }
			]
		}
	},
	activate(ctx) {
		const k = ctx.kernel;
		const { vault, layout, notify } = k.sys;
		const h = ctx.commands.handle;
		h("explorer.open", ({ path }: { path: string }) => {
			const view = viewForPath(k, path);
			if (!view) throw new FanwitError("VIEW_NONE", { message: `No view opens ${path}.` });
			return layout.openView(view, { path });
		});
		h("explorer.openToSide", ({ path }: { path: string }) => layout.openView(viewForPath(k, path) ?? "fanwit.textEditor", { path }, { target: "beside" }));
		h("explorer.newFile", async ({ dir, name }: { dir: string; name: string }) => {
			const path = join(dir, name.includes(".") ? name : `${name}.md`);
			if (await vault.fs.exists(path)) throw new FanwitError("FILE_EXISTS", { message: `${path} already exists.` });
			await vault.fs.write(path, path.endsWith(".md") ? `# ${name.replace(/\.md$/, "")}\n` : "");
			await layout.openView(viewForPath(k, path) ?? "fanwit.textEditor", { path });
			return { undo: () => vault.fs.trash(path), label: `Create ${path}`, result: path };
		});
		h("explorer.newFolder", async ({ dir, name }: { dir: string; name: string }) => {
			await vault.fs.mkdir(join(dir, name));
			return join(dir, name);
		});
		h("explorer.rename", async ({ path, to }: { path: string; to: string }) => {
			const target = to.includes("/") ? to : join(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", to);
			if (await vault.fs.exists(target)) throw new FanwitError("FILE_EXISTS", { message: `${target} already exists.` });
			await vault.fs.rename(path, target);
			// open tabs follow renames
			for (const [id, p] of Object.entries(layout.doc.pane)) if (p.props?.path === path) await layout.dispatch({ type: "setAttrs", table: "pane", id, attrs: { props: { ...p.props, path: target } } }, { undoable: false });
			return { undo: () => vault.fs.rename(target, path), redo: () => vault.fs.rename(path, target), label: `Rename ${path}` };
		});
		h("explorer.delete", async ({ path }: { path: string }) => {
			const ok = await k.sys.dialog.ask(`Move "${path}" to the ${vault.trashMode() === "vault" ? "vault's .trash folder" : "trash"}?`, { title: "Delete", okLabel: "Move to trash", kind: "warning" });
			if (!ok) return;
			for (const [id, p] of Object.entries(layout.doc.pane)) if (typeof p.props?.path === "string" && (p.props.path === path || (p.props.path as string).startsWith(path + "/"))) await layout.dispatch({ type: "closePane", pane: id });
			await vault.fs.trash(path);
			notify.toast(`Moved ${path} to trash`);
		});
		h("explorer.copyPath", async ({ path }: { path: string }) => {
			await navigator.clipboard.writeText(path);
			notify.toast("Path copied", "success");
		});
		h("explorer.reveal", ({ path }: { path: string }) => k.host.reveal(`${vault.current!.path}/${path}`));
		h("capture.append", async ({ text, file }: { text: string; file: string }) => {
			if (!vault.current) throw new FanwitError("VAULT_NONE", { message: "Open a vault to capture into.", hint: "Quick capture appends to Inbox.md in the open vault." });
			const prev = (await vault.fs.exists(file)) ? await vault.fs.readText(file) : "# Inbox\n";
			const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
			await vault.fs.write(file, `${prev.replace(/\n*$/, "\n")}- ${stamp} ${text}\n`);
			notify.toast(`Captured to ${file}`, "success");
			return file;
		});
		h("vault.forget", ({ path }: { path: string }) => vault.forget(path));
		h("vault.pin", ({ path }: { path: string }) => vault.pin(path, !vault.recentList.find((v) => v.path === path)?.pinned));
		ctx.commands.register({ id: "fanwit.runCommand", title: "Run command", palette: false, args: { id: { type: "string" } } }, ({ id }: { id: string }) => k.commands.run(id, {}, { source: "menu" }));
	}
});
