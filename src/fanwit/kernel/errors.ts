/**
 * Every error thrown by Fanwit APIs: a stable code, a human message, a hint and a docs link.
 * Codes map to CLI exit codes (see `exitCodeFor`).
 */
export interface FanwitErrorInit {
	message: string;
	hint?: string;
	docs?: string;
	owner?: string;
	cause?: unknown;
}

/**
 * The error every FaNWiT API throws, and the one to throw from your own code: a stable `code`
 * (also the CLI exit code's source), a message, a `hint` that says what to do, and a `docs` link.
 * `ctx.notify.error(e)` shows the hint and an "Open docs" action.
 *
 * @example
 * ```ts
 * throw new FanwitError("NOTES_NOT_FOUND", {
 *   message: `No note at ${path}.`,
 *   hint: "Create it first, or pick another file.",
 *   docs: "manual://fanwit/guides/vaults"
 * });
 * ```
 * @see manual://fanwit/reference/errors
 */
export class FanwitError extends Error {
	readonly code: string;
	readonly hint?: string;
	readonly docs?: string;
	readonly owner?: string;

	constructor(code: string, init: FanwitErrorInit) {
		super(init.message, { cause: init.cause });
		this.name = "FanwitError";
		this.code = code;
		this.hint = init.hint;
		this.docs = init.docs;
		this.owner = init.owner;
	}

	toJSON() {
		return { code: this.code, message: this.message, hint: this.hint, docs: this.docs, owner: this.owner };
	}
}

/**
 * True for a {@link FanwitError}, including one that crossed a worker or window boundary (where
 * `instanceof` fails but the name survives).
 *
 * @example
 * ```ts
 * try { await ctx.commands.run("vault.open", { path }); }
 * catch (e) { if (isFanwitError(e) && e.code === "CANCELLED") return; throw e; }
 * ```
 */
export function isFanwitError(e: unknown): e is FanwitError {
	return e instanceof FanwitError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "FanwitError");
}

/** Normalises anything thrown into a FanwitError. */
export function toFanwitError(e: unknown, code = "UNKNOWN"): FanwitError {
	if (e instanceof FanwitError) return e;
	if (e instanceof Error) return new FanwitError(code, { message: e.message, cause: e });
	// Rust commands reject with a string; "PERMISSION_DENIED: ..." carries its code
	const m = /^([A-Z][A-Z0-9_]+): ([\s\S]*)$/.exec(String(e));
	return m ? new FanwitError(m[1], { message: m[2] }) : new FanwitError(code, { message: String(e) });
}

/** CLI exit codes from Section 15.1.3. */
export function exitCodeFor(e: unknown): number {
	const code = isFanwitError(e) ? e.code : "";
	if (code === "CMD_ARGS" || code === "CMD_ARGS_MISSING") return 2;
	if (code === "CMD_DISABLED") return 3;
	if (code === "CMD_UNKNOWN") return 4;
	if (code === "PERMISSION_DENIED") return 5;
	if (code === "CANCELLED") return 130;
	return 1;
}
