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

export function isFanwitError(e: unknown): e is FanwitError {
	return e instanceof FanwitError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "FanwitError");
}

/** Normalises anything thrown into a FanwitError. */
export function toFanwitError(e: unknown, code = "UNKNOWN"): FanwitError {
	if (e instanceof FanwitError) return e;
	if (e instanceof Error) return new FanwitError(code, { message: e.message, cause: e });
	return new FanwitError(code, { message: String(e) });
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
