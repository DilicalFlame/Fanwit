/**
 * Rust playground: the code compiles and runs on the official Rust Playground
 * (play.rust-lang.org, which allows calls from any page), so readers need no Rust install. Only the
 * standard library is available there; Tauri code is shown, not run.
 */
const API = "https://play.rust-lang.org/execute";

export interface RustResult {
	ok: boolean;
	stdout: string;
	/** Compiler errors and warnings, and what the program wrote to stderr; cargo's progress lines removed. */
	stderr: string;
}

/** Cargo's own progress lines, which say nothing about the reader's code. */
const PROGRESS = /^\s*(Compiling playground|Finished `|Running `target|Running unittests|Doc-tests)/;

/** Code with #[test] functions and no main runs its tests (cargo test) instead of a program. */
export const isTests = (code: string) => /#\[test\]/.test(code) && !/fn\s+main\s*\(/.test(code);

export async function runRust(code: string, signal?: AbortSignal): Promise<RustResult> {
	const tests = isTests(code);
	const res = await fetch(API, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ channel: "stable", mode: "debug", edition: "2024", crateType: tests ? "lib" : "bin", tests, code, backtrace: false }),
		signal
	});
	if (!res.ok) throw new Error(`The Rust Playground answered ${res.status}. Try again, or open the code there.`);
	const r = (await res.json()) as { success: boolean; stdout?: string; stderr?: string; error?: string };
	if (r.error) throw new Error(r.error);
	const stderr = (r.stderr ?? "")
		.split("\n")
		.filter((l) => !PROGRESS.test(l))
		.join("\n")
		.trim();
	return { ok: r.success, stdout: r.stdout ?? "", stderr };
}

/** The same code, opened in the Rust Playground's own editor. */
export const playgroundUrl = (code: string) => `https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&code=${encodeURIComponent(code)}`;
