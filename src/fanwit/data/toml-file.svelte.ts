/**
 * A live TOML file (principle P2): the app writes it (format preserving on desktop) and the
 * file is watched, so a manual edit flows back in. Our own writes are recognised by content and
 * ignored (echo suppression). Invalid edits keep the last good value and report diagnostics.
 */
import { parse, TomlError } from "smol-toml";
import { debounce, Emitter, type Disposable } from "../kernel/disposable";
import type { Host } from "../host/types";
import { dirname } from "../host/types";

export interface TomlDiagnostic {
	file: string;
	line?: number;
	column?: number;
	message: string;
	severity: "error" | "warning";
}

export interface TomlFileOptions<T> {
	/** Initial content written when the file does not exist (keeps a helpful header comment). */
	template?: string;
	/** Semantic validation; return diagnostics to reject a value from disk. */
	validate?: (value: Record<string, unknown>, text: string) => TomlDiagnostic[];
	/** Write debounce in ms (default 150, Section 8.7.1). */
	debounce?: number;
	/** Default value when the file is missing or empty. */
	fallback?: () => T;
}

/** Line and column of the first occurrence of a table header or key, for diagnostics. */
export function locate(text: string, needle: string): { line: number; column: number } | undefined {
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const c = lines[i].indexOf(needle);
		if (c >= 0) return { line: i + 1, column: c + 1 };
	}
	return undefined;
}

export class TomlFile<T extends Record<string, unknown> = Record<string, unknown>> {
	value = $state.raw<T>({} as T);
	text = $state("");
	diagnostics = $state.raw<TomlDiagnostic[]>([]);
	loaded = $state(false);
	/** Fires with the new value whenever the file changes on disk (not for our own writes). */
	readonly onDidChangeFromDisk = new Emitter<T>();
	private lastWritten: string | null = null;
	private watcher: Disposable | null = null;
	private pending: T | null = null;
	private writeLater: ReturnType<typeof debounce<[]>>;

	constructor(
		private host: Host,
		readonly path: string,
		private o: TomlFileOptions<T> = {}
	) {
		this.writeLater = debounce(() => void this.flush(), o.debounce ?? 150);
	}

	async load(): Promise<T> {
		let text = "";
		try {
			text = await this.host.fs.readText(this.path);
		} catch {
			if (this.o.template !== undefined) {
				await this.host.fs.mkdir(dirname(this.path)).catch(() => {});
				await this.host.fs.writeText(this.path, this.o.template).catch(() => {});
				text = this.o.template;
				this.lastWritten = text;
			}
		}
		this.accept(text, false);
		this.loaded = true;
		return this.value;
	}

	/** Parse text; on success adopt it, otherwise keep the last good value and report. */
	private accept(text: string, fromDisk: boolean): boolean {
		this.text = text;
		let parsed: Record<string, unknown>;
		try {
			parsed = text.trim() ? (parse(text) as Record<string, unknown>) : ((this.o.fallback?.() ?? {}) as Record<string, unknown>);
		} catch (e) {
			const te = e as TomlError & { line?: number; column?: number };
			this.diagnostics = [{ file: this.path, line: te.line, column: te.column, message: firstLine(te.message), severity: "error" }];
			return false;
		}
		const diags = this.o.validate?.(parsed, text) ?? [];
		this.diagnostics = diags;
		if (diags.some((d) => d.severity === "error")) return false;
		this.value = parsed as T;
		if (fromDisk) this.onDidChangeFromDisk.fire(this.value);
		return true;
	}

	/** Start watching the file for manual edits. */
	async watch(): Promise<void> {
		if (this.watcher) return;
		const check = debounce(async () => {
			let text: string;
			try {
				text = await this.host.fs.readText(this.path);
			} catch {
				return;
			}
			if (text === this.lastWritten || text === this.text) return; // our own echo
			this.accept(text, true);
		}, 50);
		this.watcher = await this.host.fs.watch(this.path, (events) => {
			if (events.some((e) => e.path.replace(/\\/g, "/").endsWith(this.path.replace(/\\/g, "/").split("/").pop()!))) check();
		});
	}

	/** Replace the whole value and schedule a (debounced) write. */
	set(value: T) {
		this.value = value;
		this.pending = value;
		this.writeLater();
	}

	/** Write pending changes now (window blur, vault switch, shutdown). */
	async flush() {
		const v = this.pending;
		if (!v) return;
		this.pending = null;
		await this.host.fs.mkdir(dirname(this.path)).catch(() => {});
		const text = await this.host.fs.writeToml(this.path, v);
		this.lastWritten = text;
		this.text = text;
		this.diagnostics = [];
	}

	/** Write raw text (the in-app TOML editor). Applies it if valid. */
	async writeText(text: string): Promise<boolean> {
		const ok = this.accept(text, true);
		this.lastWritten = text;
		await this.host.fs.writeText(this.path, text);
		return ok;
	}

	dispose() {
		this.writeLater.flush();
		this.watcher?.dispose();
		this.watcher = null;
	}
}

function firstLine(s: string) {
	return s.split("\n")[0].replace(/^Invalid TOML document: /, "");
}
