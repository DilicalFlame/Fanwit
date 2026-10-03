/** Labs: the kitchen sink (Section 1.8). Removed with `fw strip` or features.labs = false. */
import { defineModule } from "../kernel/module";
import type { ViewContribution } from "../layout/views";
import { canvas } from "../views/labs/canvas.svelte";

const lab = (id: string, title: string, icon: string, description: string, component: ViewContribution["component"]): ViewContribution => ({ id, title, icon, description, component, category: "Labs", singleton: true, help: `labs#${id.split(".")[1]}` });

export const labsModule = defineModule({
	id: "fanwit.labs",
	title: "Labs",
	contributes: {
		views: [
			{ id: "fanwit.labs", title: "Labs", icon: "flask-conical", component: () => import("../views/labs/LabsList.svelte"), regions: ["sidebar"], singleton: true },
			lab("fanwit.layoutLab", "Layout Lab", "layout-dashboard", "Edit workspace.toml live, see the layout and the action log", () => import("../views/labs/LayoutLab.svelte")),
			lab("fanwit.windowLab", "Window Lab", "app-window", "Child, panel and sheet windows, focus lock and feedback", () => import("../views/labs/WindowLab.svelte")),
			lab("fanwit.menuLab", "Menu Lab", "list-tree", "Colour swatches and sliders inside a context menu", () => import("../views/labs/MenuLab.svelte")),
			lab("fanwit.notificationLab", "Notification Lab", "bell-ring", "Every route, kind, progress and dedupe", () => import("../views/labs/NotificationLab.svelte")),
			lab("fanwit.componentGallery", "Component Gallery", "shapes", "shadcn-svelte and workbench components", () => import("../views/labs/ComponentGallery.svelte")),
			lab("fanwit.dbExplorer", "Database Explorer", "database", "Browse tables per scope and run queries", () => import("../views/labs/DbExplorer.svelte")),
			lab("fanwit.commandLab", "Command and CLI Lab", "square-terminal", "Run any command with a generated form; see its CLI", () => import("../views/labs/CommandLab.svelte")),
			{ id: "fanwit.labExport", title: "Export", icon: "download", component: () => import("../views/labs/ExportDialog.svelte") },
			{ id: "fanwit.colorPicker", title: "Colour picker", icon: "pipette", component: () => import("../views/labs/ColorPickerView.svelte"), singleton: true }
		],
		windows: [
			{ kind: "lab.export", base: "child", view: "fanwit.labExport", title: "Export", focus: "lock", onBlocked: ["bell", "shake"], instance: "multiple" },
			{ kind: "lab.colorPicker", base: "panel", view: "fanwit.colorPicker", title: "Colour picker", size: [300, 420], alwaysOnTop: true, web: "pip" }
		],
		commands: [
			{ id: "labs.openExport", title: "Open sample export dialog (focus lock)", category: "Labs", icon: "download" },
			{ id: "labs.openColorPicker", title: "Open colour picker panel", category: "Labs", icon: "pipette" },
			{ id: "canvas.setFill", title: "Set fill", category: "Canvas", palette: false, undoable: true, args: { ids: { type: "json" }, color: { type: "color" } } },
			{ id: "canvas.previewOpacity", title: "Preview opacity", category: "Canvas", palette: false, args: { ids: { type: "json" }, value: { type: "number" } } },
			{ id: "canvas.setOpacity", title: "Set opacity", category: "Canvas", palette: false, undoable: true, args: { ids: { type: "json" }, value: { type: "number", min: 0, max: 100 } } },
			{ id: "canvas.bringToFront", title: "Bring to front", category: "Canvas", icon: "bring-to-front", palette: false, undoable: true, args: { ids: { type: "json" } } },
			{ id: "canvas.sendToBack", title: "Send to back", category: "Canvas", icon: "send-to-back", palette: false, undoable: true, args: { ids: { type: "json" } } },
			{ id: "canvas.toggleRound", title: "Toggle rounded", category: "Canvas", icon: "circle", palette: false, undoable: true, args: { ids: { type: "json" } } },
			{ id: "canvas.lock", title: "Lock", category: "Canvas", icon: "lock", palette: false, args: { ids: { type: "json" } } },
			{ id: "canvas.duplicate", title: "Duplicate", category: "Canvas", icon: "copy-plus", palette: false, undoable: true, args: { ids: { type: "json" } } },
			{ id: "canvas.delete", title: "Delete", category: "Canvas", icon: "trash-2", palette: false, undoable: true, when: "!selection.locked", args: { ids: { type: "json" } } }
		],
		menuLocations: [
			{ id: "canvas/selection", description: "Right click on selected shapes", target: "ShapeSelection", samples: [{ ids: ["a"], opacity: 100, fill: "#3b82f6" }] },
			{ id: "canvas/empty", description: "Right click on the empty canvas" }
		],
		menus: {
			"canvas/selection": [
				{ id: "canvas.quick", kind: "icon-row", group: "clipboard", order: 1, props: { label: "Quick actions", items: [{ icon: "copy-plus", label: "Duplicate", command: "canvas.duplicate" }, { icon: "bring-to-front", label: "Bring to front", command: "canvas.bringToFront" }, { icon: "send-to-back", label: "Send to back", command: "canvas.sendToBack" }, { icon: "circle", label: "Round", command: "canvas.toggleRound" }] }, args: { ids: "${target.ids}" } },
				{ id: "canvas.fill", kind: "color-swatches", group: "style", order: 10, props: { label: "Fill", palette: "theme", recent: true, allowCustom: true, columns: 8, valueFrom: "target.fill" }, command: "canvas.setFill", args: { ids: "${target.ids}" } },
				{ id: "canvas.opacity", kind: "slider", group: "style", order: 20, props: { label: "Opacity", min: 0, max: 100, step: 1, unit: "%", valueFrom: "target.opacity" }, command: "canvas.setOpacity", preview: "canvas.previewOpacity", args: { ids: "${target.ids}" } },
				{ id: "canvas.arrange", kind: "submenu", group: "arrange", order: 1, label: "Arrange", icon: "layers", items: [{ id: "canvas.front", command: "canvas.bringToFront", args: { ids: "${target.ids}" } }, { id: "canvas.back", command: "canvas.sendToBack", args: { ids: "${target.ids}" } }] },
				{ id: "canvas.lock", command: "canvas.lock", group: "arrange", order: 2, args: { ids: "${target.ids}" } },
				{ id: "canvas.delete", command: "canvas.delete", group: "danger", order: 1, args: { ids: "${target.ids}" } }
			],
			"canvas/empty": [{ id: "canvas.reset", command: "labs.resetCanvas", group: "navigation", order: 1, label: "Select all" }]
		}
	},
	activate(ctx) {
		const k = ctx.kernel;
		const pick = (ids: unknown) => canvas.shapes.filter((s) => (ids as string[] | undefined)?.includes(s.id));
		const h = ctx.commands.handle;
		h("labs.openExport", async () => {
			const w = await k.sys.windows.open("lab.export");
			const r = await w.result;
			if (r) k.sys.notify.send({ title: "Export chosen", body: JSON.stringify(r), kind: "success" });
			return r;
		});
		h("labs.openColorPicker", () => (k.host.caps.nativeWindows ? k.sys.windows.open("lab.colorPicker") : k.sys.layout.openView("fanwit.colorPicker", {}, { target: "float" })));
		const change = <T>(ids: unknown, field: "fill" | "opacity" | "round", value: (s: { fill: string; opacity: number; round: boolean }) => T, label: string) => {
			const shapes = pick(ids);
			const before = shapes.map((s) => s[field]);
			shapes.forEach((s) => ((s as unknown as Record<string, unknown>)[field] = value(s)));
			for (const s of shapes) delete canvas.preview[s.id];
			return { label, undo: () => shapes.forEach((s, i) => ((s as unknown as Record<string, unknown>)[field] = before[i])) };
		};
		h("canvas.setFill", ({ ids, color }: { ids: string[]; color: string }) => change(ids, "fill", () => color, "Set fill"));
		h("canvas.previewOpacity", ({ ids, value }: { ids: string[]; value: number }) => {
			for (const s of pick(ids)) canvas.preview[s.id] = value;
		});
		h("canvas.setOpacity", ({ ids, value }: { ids: string[]; value: number }) => change(ids, "opacity", () => value, "Set opacity"));
		h("canvas.toggleRound", ({ ids }: { ids: string[] }) => change(ids, "round", (s) => !s.round, "Toggle rounded"));
		const reorder = (ids: unknown, front: boolean) => {
			const before = [...canvas.shapes];
			const moving = pick(ids);
			const rest = canvas.shapes.filter((s) => !moving.includes(s));
			canvas.shapes = front ? [...rest, ...moving] : [...moving, ...rest];
			return { label: front ? "Bring to front" : "Send to back", undo: () => (canvas.shapes = before) };
		};
		h("canvas.bringToFront", ({ ids }: { ids: string[] }) => reorder(ids, true));
		h("canvas.sendToBack", ({ ids }: { ids: string[] }) => reorder(ids, false));
		h("canvas.lock", ({ ids }: { ids: string[] }) => pick(ids).forEach((s) => (s.locked = !s.locked)));
		h("canvas.duplicate", ({ ids }: { ids: string[] }) => {
			const copies = pick(ids).map((s) => ({ ...s, id: Math.random().toString(36).slice(2, 6), x: s.x + 20, y: s.y + 20, locked: false }));
			canvas.shapes = [...canvas.shapes, ...copies];
			canvas.selected = copies.map((c) => c.id);
			return { label: "Duplicate", undo: () => (canvas.shapes = canvas.shapes.filter((s) => !copies.includes(s))) };
		});
		h("canvas.delete", ({ ids }: { ids: string[] }) => {
			const before = [...canvas.shapes];
			canvas.shapes = canvas.shapes.filter((s) => !(ids as string[]).includes(s.id));
			canvas.selected = [];
			return { label: "Delete shapes", undo: () => (canvas.shapes = before) };
		});
		ctx.commands.register({ id: "labs.resetCanvas", title: "Select all shapes", palette: false }, () => (canvas.selected = canvas.shapes.map((s) => s.id)));
	}
});
