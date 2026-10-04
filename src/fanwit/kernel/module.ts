/**
 * Modules (Section 4.1): static contributions read at boot without running code, plus an
 * activate(ctx) that loads only when an activation event fires.
 */
import type { ModuleContext } from "./context-api";

/**
 * Contribution points. Systems register a handler per key (commands, keybindings, menus, ...).
 * Extend by declaration merging when you add a point.
 *
 * @example
 * ```ts
 * declare module "$fanwit" {
 *   interface Contributions { snippets: { id: string; body: string }[] }
 * }
 * // the handler receives each module's list and returns what undoes it
 * k.modules.definePoint("snippets", (owner, list) => registerSnippets(owner, list as Snippet[]));
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Contributions {}

export type ActivateFn = (ctx: ModuleContext) => void | Promise<void>;
export type ActivateLoader = () => Promise<{ default: ActivateFn } | ActivateFn>;

/**
 * A feature: what it contributes (data, read at boot without running code) and an `activate`
 * that loads the first time one of its activation events fires. Commands, views, windows and
 * services in `contributes` add their own events (`onCommand:<id>`, `onView:<id>`, ...).
 *
 * @example
 * ```ts
 * export default defineModule({
 *   id: "notes",
 *   contributes: { commands: [{ id: "notes.newDaily", title: "Open today's daily note" }] },
 *   activate: () => import("./activate")
 * });
 * ```
 * @see manual://fanwit/guides/modules
 */
export interface ModuleDefinition {
	/** Unique; also the prefix of the module's command ids and storage keys. */
	id: string;
	title?: string;
	description?: string;
	/** Extra events that activate the module. Core modules may use onStartup; everyone else should prefer lazy events. */
	activationEvents?: string[];
	/** Contribution points (commands, views, menus, settings, ...): data the app reads at boot. */
	contributes?: Partial<Contributions> & Record<string, unknown>;
	/** Either the activate function itself or a loader (`() => import("./activate")`). */
	activate?: ActivateFn | ActivateLoader;
	/** "core" | "module" | "plugin": decides precedence for keybindings and labels in editors. */
	tier?: "core" | "module" | "plugin";
}

/**
 * Declare a module. It only types the definition (it returns it unchanged); the app finds modules
 * by glob (`src/app/modules/<id>/module.ts`), so default-export it. `pnpm fw add module <id>` writes one.
 *
 * @example
 * ```ts
 * import { defineModule } from "$fanwit";
 *
 * export default defineModule({
 *   id: "hello",
 *   contributes: { commands: [{ id: "hello.greet", title: "Greet", args: { name: { type: "string" } } }] },
 *   activate(ctx) {
 *     ctx.commands.handle("hello.greet", ({ name }) => ctx.notify.toast(`Hello, ${name}`));
 *   }
 * });
 * ```
 */
export function defineModule<const M extends ModuleDefinition>(m: M): M {
	return m;
}

/** Implicit activation events derived from contributions. */
export function implicitEvents(m: ModuleDefinition): string[] {
	const c = (m.contributes ?? {}) as Record<string, unknown>;
	const ev: string[] = [];
	for (const cmd of (c.commands as { id: string }[] | undefined) ?? []) ev.push(`onCommand:${cmd.id}`);
	for (const v of (c.views as { id: string }[] | undefined) ?? []) ev.push(`onView:${v.id}`);
	for (const w of (c.windows as { kind: string }[] | undefined) ?? []) ev.push(`onWindow:${w.kind}`);
	for (const s of (c.services as string[] | undefined) ?? []) ev.push(`onService:${s}`);
	return ev;
}

/** Matches an event against a declared pattern (`onVaultFile:*.md`, `onCommand:*`). */
export function eventMatches(pattern: string, event: string) {
	if (pattern === event) return true;
	if (!pattern.includes("*")) return false;
	const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*?/g, ".*") + "$");
	return re.test(event);
}
