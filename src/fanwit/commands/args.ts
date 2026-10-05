/**
 * Argument schemas: plain ArgSpec maps or Valibot object schemas, normalised to ArgSpec so the
 * palette, the CLI and the settings UI can all introspect them.
 */
import * as v from "valibot";
import { FanwitError } from "../kernel/errors";
import type { ArgOption, ArgSchema, ArgSpec } from "./types";

type AnySchema = v.GenericSchema & { type: string; entries?: Record<string, AnySchema>; wrapped?: AnySchema; default?: unknown; options?: unknown[]; pipe?: { type: string; requirement?: unknown }[] };

export function isValibot(s: ArgSchema | undefined): s is v.GenericSchema {
	return !!s && typeof s === "object" && "~standard" in s;
}

function specOf(schema: AnySchema): ArgSpec {
	let s = schema;
	let required = true;
	let def: unknown;
	while (s.type === "optional" || s.type === "nullish" || s.type === "nullable" || s.type === "exact_optional") {
		required = false;
		if (s.default !== undefined) def = typeof s.default === "function" ? (s.default as () => unknown)() : s.default;
		s = s.wrapped!;
	}
	const spec: ArgSpec = { type: "string", required, default: def };
	switch (s.type) {
		case "number":
			spec.type = "number";
			for (const p of s.pipe ?? []) {
				if (p.type === "min_value") spec.min = p.requirement as number;
				if (p.type === "max_value") spec.max = p.requirement as number;
			}
			break;
		case "boolean":
			spec.type = "boolean";
			break;
		case "picklist":
		case "enum":
			spec.type = "enum";
			spec.options = (s.options as string[]).map(String);
			break;
		case "string":
			for (const p of s.pipe ?? []) {
				if (p.type === "hex_color") spec.type = "color";
				const meta = p as unknown as { type: string; metadata?: Record<string, unknown> };
				if (meta.type === "metadata" && meta.metadata) Object.assign(spec, meta.metadata);
			}
			break;
		default:
			if (s.type !== "string") spec.type = "json";
	}
	return spec;
}

/** Normalised ArgSpec map for any schema. */
export function argSpecs(schema: ArgSchema | undefined): Record<string, ArgSpec> {
	if (!schema) return {};
	if (isValibot(schema)) {
		const s = schema as AnySchema;
		if (s.type !== "object" || !s.entries) return {};
		return Object.fromEntries(Object.entries(s.entries).map(([k, e]) => [k, specOf(e)]));
	}
	return schema as Record<string, ArgSpec>;
}

export function optionValues(spec: ArgSpec): ArgOption[] {
	return (spec.options ?? []).map((o) => (typeof o === "string" ? { value: o } : o));
}

/** Names of required arguments that are still missing. */
export function missingArgs(schema: ArgSchema | undefined, args: Record<string, unknown>): string[] {
	return Object.entries(argSpecs(schema))
		.filter(([k, s]) => args[k] === undefined && s.default === undefined && s.required !== false && s.type !== "boolean")
		.map(([k]) => k);
}

/** Coerce strings (CLI, URI, TOML) to the declared types. */
export function coerceArgs(schema: ArgSchema | undefined, args: Record<string, unknown>): Record<string, unknown> {
	const specs = argSpecs(schema);
	const out: Record<string, unknown> = { ...args };
	for (const [k, s] of Object.entries(specs)) {
		const val = out[k];
		if (typeof val !== "string") continue;
		if (s.type === "number" && val.trim() !== "" && !Number.isNaN(Number(val))) out[k] = Number(val);
		else if (s.type === "boolean") out[k] = !["false", "0", "no", "off", ""].includes(val.toLowerCase());
		else if (s.type === "json") {
			try {
				out[k] = JSON.parse(val);
			} catch {
				/* leave as string; validation reports it */
			}
		}
	}
	return out;
}

/** Validate and apply defaults. Throws FanwitError CMD_ARGS. */
export function validateArgs(id: string, schema: ArgSchema | undefined, args: Record<string, unknown>): Record<string, unknown> {
	if (!schema) return args;
	if (isValibot(schema)) {
		const r = v.safeParse(schema, args);
		if (!r.success) {
			const issue = r.issues[0];
			const path = issue.path?.map((p) => String(p.key)).join(".") ?? "";
			throw new FanwitError("CMD_ARGS", {
				message: `Invalid argument${path ? ` "${path}"` : ""} for ${id}: ${issue.message}`,
				hint: "Check the argument types in the command's schema.",
				docs: "manual://commands#arguments"
			});
		}
		return { ...args, ...(r.output as Record<string, unknown>) };
	}
	const out: Record<string, unknown> = { ...args };
	for (const [k, s] of Object.entries(schema as Record<string, ArgSpec>)) {
		let val = out[k];
		if (val === undefined) {
			if (s.default !== undefined) out[k] = s.default;
			else if (s.type === "boolean") out[k] = false;
			else if (s.required !== false) throw new FanwitError("CMD_ARGS_MISSING", { message: `Missing argument "${k}" for ${id}.`, hint: `Pass --${k} <value>.` });
			continue;
		}
		const bad = (why: string) =>
			new FanwitError("CMD_ARGS", { message: `Invalid argument "${k}" for ${id}: ${why}.`, docs: "manual://commands#arguments" });
		switch (s.type) {
			case "number":
				if (typeof val !== "number" || Number.isNaN(val)) throw bad("expected a number");
				if (s.min !== undefined && val < s.min) throw bad(`must be at least ${s.min}`);
				if (s.max !== undefined && val > s.max) throw bad(`must be at most ${s.max}`);
				break;
			case "boolean":
				if (typeof val !== "boolean") throw bad("expected true or false");
				break;
			case "enum": {
				const allowed = optionValues(s).map((o) => o.value);
				if (!allowed.includes(String(val))) throw bad(`expected one of ${allowed.join(", ")}`);
				break;
			}
			case "color":
				if (typeof val !== "string") throw bad("expected a colour string");
				break;
			case "json":
				break;
			default:
				if (typeof val !== "string") val = out[k] = String(val);
		}
	}
	return out;
}

/**
 * Attach palette and CLI metadata to a Valibot schema, for commands that validate their args with
 * Valibot instead of a plain {@link ArgSpec} map.
 *
 * @example
 * ```ts
 * import * as v from "valibot";
 * args: v.object({ file: v.pipe(v.string(), argMeta({ type: "path", kind: "file", title: "File to import" })) })
 * ```
 */
export function argMeta<T = unknown>(meta: Partial<ArgSpec>) {
	// T is inferred from the pipe it sits in (v.pipe(v.string(), argMeta(...)) makes it string)
	return v.metadata<T, Record<string, unknown>>(meta as Record<string, unknown>);
}
