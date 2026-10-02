import type { GenericSchema } from "valibot";
import type { WhenClause } from "../kernel/when";

export type ArgType = "string" | "number" | "boolean" | "enum" | "path" | "color" | "ref" | "json";

export interface ArgOption {
	value: string;
	label?: string;
	description?: string;
}

/** Plain argument declaration, usable in manifests and TOML. One schema powers validation, palette prompts and CLI flags. */
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

export interface CommandDefinition {
	/** "<module>.<verbObject>", e.g. "layout.splitRight" */
	id: string;
	title: string;
	shortTitle?: string;
	category?: string;
	description?: string;
	icon?: string;
	args?: ArgSchema;
	when?: WhenClause;
	visibleWhen?: WhenClause;
	toggled?: WhenClause;
	palette?: boolean;
	cli?: boolean | CliExposure;
	/** Deep links may trigger only commands with uri: true. */
	uri?: boolean;
	runtime?: "ui" | "any" | "rust";
	confirm?: { message: string; danger?: boolean; okLabel?: string };
	undoable?: boolean;
	deprecatedAliases?: string[];
	/** Manual page opened with F1 from the palette row. */
	help?: string;
}

export type InvocationSource = "palette" | "key" | "menu" | "toolbar" | "cli" | "uri" | "api" | "test" | "macro" | "notification";

export interface ProgressReporter {
	report(fraction: number | null, message?: string): void;
}

export interface Invocation {
	source: InvocationSource;
	window: string;
	target?: unknown;
	signal: AbortSignal;
	progress: ProgressReporter;
	context: Record<string, unknown>;
	/** Element the invocation originated from (menus, focused element for keys). */
	element?: Element | null;
	/** Whether missing arguments may be prompted for. */
	interactive: boolean;
}

export interface UndoRecord {
	undo: () => unknown;
	redo?: () => unknown;
	label?: string;
}

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
