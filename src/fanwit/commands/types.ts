import type { GenericSchema } from "valibot";
import type { WhenClause } from "../kernel/when";

export type ArgType = "string" | "number" | "boolean" | "enum" | "path" | "color" | "ref" | "json";

export interface ArgOption {
	value: string;
	label?: string;
	description?: string;
}

/**
 * Plain argument declaration, usable in manifests and TOML. One schema powers validation, palette
 * prompts for missing values and CLI flags.
 *
 * @example
 * ```ts
 * args: {
 *   size: { type: "number", min: 8, max: 72, default: 14 },
 *   mode: { type: "enum", options: ["split", "replace"] },
 *   file: { type: "path", kind: "file", positional: true }
 * }
 * ```
 */
export interface ArgSpec {
	type: ArgType;
	title?: string;
	description?: string;
	default?: unknown;
	required?: boolean;
	options?: (string | ArgOption)[];
	min?: number;
	max?: number;
	step?: number;
	/** path args */
	kind?: "file" | "folder" | "save";
	/** ref args: what registry the value names */
	ref?: "command" | "view" | "theme" | "window" | "preset";
	multiline?: boolean;
	/** CLI: accept positionally (in declaration order) */
	positional?: boolean;
}

export type ArgSchema = Record<string, ArgSpec> | GenericSchema;

export interface CliExposure {
	name?: string;
	aliases?: string[];
	positional?: string[];
	examples?: string[];
}

/**
 * A command's declaration: data, so the palette, menus, keys and the CLI can list it before the
 * owning module's code has loaded. The handler is registered separately (`ctx.commands.handle`).
 *
 * @example
 * ```ts
 * { id: "notes.newDaily", title: "Open today's daily note", category: "Notes", icon: "calendar", when: "vault.open", cli: true }
 * ```
 * @see manual://fanwit/guides/commands
 */
export interface CommandDefinition {
	/** "<module>.<verbObject>", e.g. "layout.splitRight" */
	id: string;
	/** Sentence case, shown in the palette and menus ("Split right"). */
	title: string;
	/** Shorter label for tight places such as toolbars. */
	shortTitle?: string;
	/** Palette prefix and grouping ("Layout: Split right"). */
	category?: string;
	description?: string;
	/** A Lucide icon name. */
	icon?: string;
	/** Argument schema: validation, palette prompts for missing values and CLI flags. */
	args?: ArgSchema;
	/** Runs only while this clause holds; menus grey the item out otherwise. */
	when?: WhenClause;
	/** Listed in the palette only while this clause holds. */
	visibleWhen?: WhenClause;
	/** Menus show a check mark while this clause holds (toggle commands). */
	toggled?: WhenClause;
	/** `false` hides it from the palette (it still runs from keys, menus and code). */
	palette?: boolean;
	/** Expose it to the app's command line (`app <group> <command>`). */
	cli?: boolean | CliExposure;
	/** Deep links may trigger only commands with uri: true. */
	uri?: boolean;
	/** Reserved for commands that run outside the webview; not enforced yet. */
	runtime?: "ui" | "any" | "rust";
	/** Ask before running; `danger` styles the dialog as destructive. */
	confirm?: { message: string; danger?: boolean; okLabel?: string };
	/** Reserved: undo is decided by the handler returning an {@link UndoRecord}. */
	undoable?: boolean;
	/** Old ids that keep working after a rename. */
	deprecatedAliases?: string[];
	/** Manual page opened with F1 from the palette row. */
	help?: string;
}

export type InvocationSource = "palette" | "key" | "menu" | "toolbar" | "cli" | "uri" | "api" | "test" | "macro" | "notification";

export interface ProgressReporter {
	report(fraction: number | null, message?: string): void;
}

/**
 * How a command was invoked: the second argument of every handler. Handlers rarely need it; it
 * is there for the cases that do (cancelling long work, reporting progress, acting on a menu target).
 *
 * @example
 * ```ts
 * ctx.commands.handle("files.import", async ({ paths }, inv) => {
 *   for (const [i, p] of paths.entries()) {
 *     if (inv.signal.aborted) return;
 *     inv.progress.report(i / paths.length, p);
 *     await importFile(p);
 *   }
 * });
 * ```
 */
export interface Invocation {
	/** Where the call came from: palette, key, menu, cli, uri, api, macro, ... */
	source: InvocationSource;
	/** Label of the window it was invoked in. */
	window: string;
	/** What a context menu was opened on (`use:menu={{ target }}`). */
	target?: unknown;
	/** Aborted when the user cancels. */
	signal: AbortSignal;
	/** Progress shown to the user while the handler runs. */
	progress: ProgressReporter;
	/** Snapshot of the context keys when the call started. */
	context: Record<string, unknown>;
	/** Element the invocation originated from (menus, focused element for keys). */
	element?: Element | null;
	/** Whether missing arguments may be prompted for. */
	interactive: boolean;
}

/**
 * Return this from a handler to make the call undoable. Without `redo`, redo runs the handler
 * again. Add `result` to also return a value to the caller.
 *
 * @example
 * ```ts
 * ctx.commands.handle("notes.rename", async ({ path, to }) => {
 *   await ctx.vault.fs.rename(path, to);
 *   return { label: "Rename note", undo: () => ctx.vault.fs.rename(to, path), result: to };
 * });
 * ```
 */
export interface UndoRecord {
	undo: () => unknown;
	redo?: () => unknown;
	/** Shown in Edit > Undo; defaults to the command's title. */
	label?: string;
}

/**
 * The code behind a command: typed arguments in, any result out (returned by `commands.run`).
 * Return an {@link UndoRecord} to join the undo history.
 *
 * @example
 * ```ts
 * const greet: CommandHandler<{ name: string }, string> = ({ name }) => `Hello, ${name}`;
 * ctx.commands.handle("hello.greet", greet);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandHandler<A = any, R = unknown> = (args: A, inv: Invocation) => R | Promise<R>;

export type Interceptor = (inv: { id: string; args: Record<string, unknown>; invocation: Invocation }, next: () => Promise<unknown>) => unknown;

export interface ExecRecord {
	id: string;
	args: Record<string, unknown>;
	source: InvocationSource;
	ms: number;
	ok: boolean;
	result?: unknown;
	error?: unknown;
	time: number;
}
