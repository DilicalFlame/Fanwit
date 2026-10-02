/**
 * Modules (Section 4.1): static contributions read at boot without running code, plus an
 * activate(ctx) that loads only when an activation event fires.
 */
import type { ModuleContext } from "./context-api";

/**
 * Contribution points. Systems register a handler per key (commands, keybindings, menus, ...).
 * Extend by declaration merging when you add a point.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Contributions {}

export type ActivateFn = (ctx: ModuleContext) => void | Promise<void>;
export type ActivateLoader = () => Promise<{ default: ActivateFn } | ActivateFn>;

export interface ModuleDefinition {
	id: string;
	title?: string;
	description?: string;
	/** Core modules may use onStartup; everyone else should prefer lazy events. */
	activationEvents?: string[];
	contributes?: Partial<Contributions> & Record<string, unknown>;
	/** Either the activate function itself or a loader (`() => import("./activate")`). */
	activate?: ActivateFn | ActivateLoader;
	/** "core" | "module" | "plugin": decides precedence for keybindings and labels in editors. */
	tier?: "core" | "module" | "plugin";
}

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
