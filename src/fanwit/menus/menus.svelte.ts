/**
 * Context Menu Manager (Chapter 7). A menu is data: an ordered list of items, each with a kind
 * and props. Kinds are registered renderers; they emit values passed as arguments to commands.
 * User changes are patches over contributed menus (menus.toml), never copies.
 */
import { untrack, type Component } from "svelte";
import { toDisposable, type Disposable } from "../kernel/disposable";
import type { Kernel } from "../kernel/kernel.svelte";
import { TomlFile } from "../data/toml-file.svelte";
import { joinPath } from "../host/types";
import type { ArgSpec } from "../commands/types";

export interface MenuLocation {
	id: string;
	description?: string;
	/** Type name of the target the location receives (documentation and editor samples). */
	target?: string;
	/** Sample targets for the editor's context simulator. */
	samples?: Record<string, unknown>[];
	owner?: string;
	user?: boolean;
}

export interface MenuItem {
	id: string;
	kind?: string;
	group?: string;
	order?: number;
	command?: string;
	args?: Record<string, unknown>;
	/** Command run while dragging a slider (live preview). */
	preview?: string;
	label?: string;
	icon?: string;
	description?: string;
	when?: string;
	visibleWhen?: string;
	props?: Record<string, unknown>;
	/** Inline submenu items, or another location rendered as a submenu. */
	items?: MenuItem[];
	submenu?: string;
	/** Provider id producing items dynamically at open time. */
	provider?: string;
	owner?: string;
	source?: "core" | "module" | "plugin" | "user";
}

export type PatchOp = "hide" | "show" | "move" | "rename" | "icon" | "regroup" | "insert" | "props" | "pin" | "when";
export interface MenuPatch {
	location: string;
	op: PatchOp;
	item: string | MenuItem;
	before?: string;
	after?: string;
	group?: string;
	label?: string;
	icon?: string;
	props?: Record<string, unknown>;
	when?: string;
}

export type KeyboardModel = "row" | "grid" | "slider" | "input" | "none";

export interface MenuKindProps<P = Record<string, unknown>> {
	item: ResolvedItem;
	props: P;
	value?: unknown;
	/** Emit a value: merged into the command args and run. */
	emit(value: Record<string, unknown>, o?: { preview?: boolean; keepOpen?: boolean }): void;
	close(): void;
	/** Editor preview: commands are not executed. */
	inert?: boolean;
}

export interface MenuItemKind {
	kind: string;
	title: string;
	description?: string;
	/** Props schema: drives validation and the editor's generated property form. */
	props?: Record<string, ArgSpec>;
	emits?: Record<string, ArgSpec>;
	keyboard?: KeyboardModel;
	role?: string;
	nativeFallback?: "submenu" | "action" | "hidden";
	component: (() => Promise<{ default: Component<MenuKindProps<any>> }>) | Component<MenuKindProps<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
	owner?: string;
}

export type MenuProvider = (target: unknown, k: Kernel) => MenuItem[] | Promise<MenuItem[]>;

export interface ResolvedItem extends MenuItem {
	kind: string;
	label: string;
	enabled: boolean;
	checked: boolean;
	disabledReason?: string | null;
	keys?: string[] | null;
	hidden?: boolean;
	userInserted?: boolean;
	children?: ResolvedGroup[];
	/** Patched in this location (badges in the editor). */
	patched?: boolean;
}

export interface ResolvedGroup {
	id: string;
	items: ResolvedItem[];
}

export interface ResolveOptions {
	target?: unknown;
	element?: Element | null;
	/** Include hidden items (editor). */
	includeHidden?: boolean;
	/** Extra context keys (editor simulator). */
	context?: Record<string, unknown>;
}

const GROUP_ORDER = ["navigation", "open", "clipboard", "edit", "style", "modify", "arrange", "view", "window", "share", "dev", "other", "danger"];

export function defineMenuItemKind(k: MenuItemKind): MenuItemKind {
	return k;
}

/** "${target.path}" templating: a whole-string template keeps the raw value's type. */
export function templateArgs(args: Record<string, unknown> | undefined, scope: Record<string, unknown>): Record<string, unknown> {
	if (!args) return {};
	const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), scope);
	const sub = (v: unknown): unknown => {
		if (typeof v === "string") {
			const whole = /^\$\{([^}]+)\}$/.exec(v);
			if (whole) return get(whole[1].trim());
			return v.replace(/\$\{([^}]+)\}/g, (_, p) => String(get(p.trim()) ?? ""));
		}
		if (Array.isArray(v)) return v.map(sub);
		if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
		return v;
	};
	return sub(args) as Record<string, unknown>;
}

/** Apply patches to a location's contributed items. Pure; exported for tests. */
export function applyPatches(items: MenuItem[], patches: MenuPatch[]): (MenuItem & { hidden?: boolean; userInserted?: boolean; patched?: boolean })[] {
	let list: (MenuItem & { hidden?: boolean; userInserted?: boolean; patched?: boolean })[] = items.map((i) => ({ ...i }));
	for (const p of patches) {
		const id = typeof p.item === "string" ? p.item : p.item.id;
		const at = list.findIndex((i) => i.id === id);
		const it = list[at];
		switch (p.op) {
			case "insert": {
				if (typeof p.item === "string" || at >= 0) break;
				const fresh = { ...p.item, group: p.group ?? p.item.group ?? "other", source: "user" as const, userInserted: true, patched: true };
				const ref = list.findIndex((i) => i.id === (p.before ?? p.after));
				if (ref >= 0) list.splice(p.before ? ref : ref + 1, 0, { ...fresh, group: fresh.group ?? list[ref].group, order: list[ref].order });
				else list.push(fresh);
				break;
			}
			case "hide":
				if (it) Object.assign(it, { hidden: true, patched: true });
				break;
			case "show":
				if (it) Object.assign(it, { hidden: false, patched: true });
				break;
			case "rename":
				if (it) Object.assign(it, { label: p.label, patched: true });
				break;
			case "icon":
				if (it) Object.assign(it, { icon: p.icon, patched: true });
				break;
			case "regroup":
				if (it) Object.assign(it, { group: p.group, patched: true });
				break;
			case "props":
				if (it) Object.assign(it, { props: { ...(it.props ?? {}), ...(p.props ?? {}) }, patched: true });
				break;
			case "when":
				if (it) Object.assign(it, { when: p.when, patched: true });
				break;
			case "pin":
				if (it) Object.assign(it, { group: "navigation", order: -1, patched: true });
				break;
			case "move": {
				if (!it) break;
				list.splice(at, 1);
				const ref = list.findIndex((i) => i.id === (p.before ?? p.after));
				if (ref >= 0) {
					const moved = { ...it, group: list[ref].group, order: list[ref].order, patched: true };
					list.splice(p.before ? ref : ref + 1, 0, moved);
				} else list.push({ ...it, group: p.group ?? it.group, patched: true });
				break;
			}
		}
	}
	list = list.map((i, n) => ({ ...i, order: i.order ?? n }));
	return list;
}

export class MenuService {
	version = $state(0);
	locations = new Map<string, MenuLocation>();
	private items = new Map<string, MenuItem[]>();
	kinds = new Map<string, MenuItemKind>();
	providers = new Map<string, MenuProvider>();
	file: TomlFile<{ patch?: MenuPatch[]; location?: MenuLocation[] }> | null = null;
	private kindCache = new Map<string, Component<MenuKindProps<any>>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
	/** Open menu state rendered by <MenuHost/>. */
	open = $state<{ location: string; x: number; y: number; target?: unknown; element?: Element | null; anchor?: DOMRect; items?: MenuItem[] } | null>(null);

	constructor(private k: Kernel) {}

	async load(dir: string) {
		this.file = new TomlFile(this.k.host, joinPath(dir, "menus.toml"), {
			template: "# Patches over contributed menus. Ids are stable across app updates.\n# Written by the Context Menu Editor; safe to edit by hand.\n"
		});
		await this.file.load();
		await this.file.watch();
		this.file.onDidChangeFromDisk.on(() => this.version = untrack(() => this.version) + 1);
		for (const l of this.file.value.location ?? []) this.locations.set(l.id, { ...l, user: true, owner: "user" });
		this.version = untrack(() => this.version) + 1;
	}

	get patches(): MenuPatch[] {
		void this.version;
		return (this.file?.value.patch ?? []) as MenuPatch[];
	}

	addLocation(l: MenuLocation, owner: string): Disposable {
		this.locations.set(l.id, { ...l, owner });
		this.version = untrack(() => this.version) + 1;
		return toDisposable(() => {
			this.locations.delete(l.id);
			this.version = untrack(() => this.version) + 1;
		});
	}

	contribute(location: string, items: MenuItem[], owner: string, source: MenuItem["source"] = "module"): Disposable {
		const tagged = items.map((i) => ({ ...i, owner, source }));
		this.items.set(location, [...(this.items.get(location) ?? []), ...tagged]);
		if (!this.locations.has(location)) this.locations.set(location, { id: location, owner });
		this.version = untrack(() => this.version) + 1;
		return toDisposable(() => {
			this.items.set(location, (this.items.get(location) ?? []).filter((i) => !tagged.includes(i as never)));
			this.version = untrack(() => this.version) + 1;
		});
	}

	registerKind(kind: MenuItemKind, owner: string): Disposable {
		this.kinds.set(kind.kind, { ...kind, owner });
		this.version = untrack(() => this.version) + 1;
		return toDisposable(() => this.kinds.delete(kind.kind));
	}

	registerProvider(id: string, p: MenuProvider): Disposable {
		this.providers.set(id, p);
		return toDisposable(() => this.providers.delete(id));
	}

	/** Lazily import a kind's component and keep it warm. */
	async kindComponent(kind: string) {
		const hit = this.kindCache.get(kind);
		if (hit) return hit;
		const def = this.kinds.get(kind) ?? this.kinds.get("action")!;
		const c = def.component;
		const comp = typeof c === "function" && c.length === 0 && !("prototype" in c && (c as { prototype?: object }).prototype) ? ((await (c as () => Promise<{ default: Component<MenuKindProps> }>)()).default as Component<MenuKindProps>) : (c as Component<MenuKindProps>);
		this.kindCache.set(kind, comp);
		return comp;
	}

	contributed(location: string): MenuItem[] {
		void this.version;
		return this.items.get(location) ?? [];
	}

	patchesFor(location: string) {
		return this.patches.filter((p) => p.location === location);
	}

	/** Resolve a location into ordered groups of items, filtered by when clauses. */
	async resolve(location: string, o: ResolveOptions = {}): Promise<ResolvedGroup[]> {
		const raw = applyPatches(this.contributed(location), this.patchesFor(location));
		const scope = { target: o.target ?? {}, context: o.context ?? {} };
		const extra = { "menu.target": location, ...(o.context ?? {}) };
		const out: ResolvedItem[] = [];
		for (const item of raw) {
			if (item.hidden && !o.includeHidden) continue;
			if (item.provider) {
				const p = this.providers.get(item.provider);
				const provided = p ? await Promise.resolve(p(o.target, this.k)).catch(() => []) : [];
				for (const pi of provided) out.push(this.resolveItem({ ...pi, group: pi.group ?? item.group }, scope, o.element, extra, o.includeHidden));
				continue;
			}
			const r = this.resolveItem(item, scope, o.element, extra, o.includeHidden);
			if (r.hidden && !o.includeHidden) continue;
			if (item.submenu) r.children = await this.resolve(item.submenu, o);
			else if (item.items) {
				const childGroups = new Map<string, ResolvedItem[]>();
				for (const ci of item.items) {
					const rc = this.resolveItem({ ...ci, id: ci.id ?? `${item.id}.${ci.command}` }, scope, o.element, extra, o.includeHidden);
					if (rc.hidden && !o.includeHidden) continue;
					const g = ci.group ?? "navigation";
					childGroups.set(g, [...(childGroups.get(g) ?? []), rc]);
				}
				r.children = [...childGroups.entries()].map(([id, items]) => ({ id, items }));
			}
			out.push(r);
		}
		const groups = new Map<string, ResolvedItem[]>();
		for (const i of out) groups.set(i.group ?? "other", [...(groups.get(i.group ?? "other") ?? []), i]);
		const rank = (g: string) => {
			const n = GROUP_ORDER.indexOf(g);
			return n < 0 ? GROUP_ORDER.indexOf("other") - 0.5 : n;
		};
		return [...groups.entries()]
			.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
			.map(([id, items]) => ({ id, items: items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }))
			.filter((g) => g.items.length);
	}

	private resolveItem(item: MenuItem & { hidden?: boolean; userInserted?: boolean; patched?: boolean }, scope: Record<string, unknown>, el: Element | null | undefined, extra: Record<string, unknown>, _includeHidden?: boolean): ResolvedItem {
		const cmd = item.command ? this.k.commands.get(item.command) : undefined;
		const ctx = this.k.context;
		const visible = ctx.evaluate(item.visibleWhen, el, extra) && (!cmd || ctx.evaluate(cmd.def.visibleWhen, el, extra));
		const enabledWhen = ctx.evaluate(item.when, el, extra);
		const cmdEnabled = !cmd || ctx.evaluate(cmd.def.when, el, extra);
		const kind = item.kind ?? (item.items || item.submenu ? "submenu" : "action");
		const label = item.label ?? (item.props?.label as string | undefined) ?? (cmd ? cmd.def.shortTitle ?? cmd.def.title : item.command ?? item.id);
		const disabledReason = !enabledWhen ? ctx.explain(item.when, ctx.lookup(el, extra)) : !cmdEnabled ? ctx.explain(cmd!.def.when, ctx.lookup(el, extra)) : null;
		return {
			...item,
			kind,
			label,
			icon: item.icon ?? cmd?.def.icon,
			description: item.description ?? cmd?.def.description,
			args: templateArgs(item.args, scope),
			enabled: enabledWhen && cmdEnabled && (!item.command || !!cmd),
			checked: cmd?.def.toggled ? ctx.evaluate(cmd.def.toggled, el, extra) : false,
			disabledReason,
			keys: item.command ? this.k.keys.label(item.command) : null,
			hidden: item.hidden || !visible
		};
	}

	/** Run the item's command with its templated args merged with the kind's emitted value. */
	async run(item: ResolvedItem, value: Record<string, unknown> = {}, o: { target?: unknown; element?: Element | null; preview?: boolean } = {}) {
		const command = o.preview ? item.preview : item.command;
		if (!command) return;
		try {
			await this.k.commands.run(command, { ...(item.args ?? {}), ...value }, { source: "menu", target: o.target, element: o.element });
		} catch (e) {
			this.k.sys.notify?.error(e);
		}
	}

	/** Open a location as a context menu at a point. */
	show(location: string, x: number, y: number, o: { target?: unknown; element?: Element | null; anchor?: DOMRect } = {}) {
		this.open = { location, x, y, ...o };
	}

	close() {
		this.open = null;
	}

	// ----- patches (written by the editor) -----

	private writePatches(next: MenuPatch[]) {
		if (!this.file) return;
		const v = { ...this.file.value, patch: next };
		this.file.set(v as never);
		this.version = untrack(() => this.version) + 1;
	}

	patch(location: string, p: Omit<MenuPatch, "location">) {
		this.writePatches([...this.patches, { location, ...p }]);
	}

	resetItem(location: string, item: string) {
		this.writePatches(this.patches.filter((p) => !(p.location === location && (typeof p.item === "string" ? p.item : p.item.id) === item)));
	}

	resetLocation(location: string) {
		this.writePatches(this.patches.filter((p) => p.location !== location));
	}

	setPatches(location: string, list: MenuPatch[]) {
		this.writePatches([...this.patches.filter((p) => p.location !== location), ...list]);
	}

	/** Create a user location (developer mode: "Edit this menu" on an element without a menu). */
	createUserLocation(id: string, description: string) {
		if (this.locations.has(id)) return;
		const l: MenuLocation = { id, description, user: true, owner: "user" };
		this.locations.set(id, l);
		if (this.file) this.file.set({ ...this.file.value, location: [...(this.file.value.location ?? []), { id, description }] } as never);
		this.version = untrack(() => this.version) + 1;
	}

	patchToml(location: string): string {
		const esc = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v).replace(/"(\w+)":/g, "$1 = ").replace(/,/g, ", "));
		return this.patchesFor(location)
			.map((p) =>
				[
					"[[patch]]",
					...Object.entries(p)
						.filter(([, v]) => v !== undefined)
						.map(([k, v]) => `${k} = ${typeof v === "object" ? "{ " + Object.entries(v as object).map(([a, b]) => `${a} = ${esc(b)}`).join(", ") + " }" : esc(v)}`)
				].join("\n")
			)
			.join("\n\n");
	}
}
