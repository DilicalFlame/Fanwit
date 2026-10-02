/**
 * Logger (Section 4.7). Scoped loggers with structured fields, per scope levels, a ring buffer of
 * the last 5000 records (front and back) for the Log Viewer, host routing and redaction.
 */
import StackTrace from "stacktrace-js";
import { Emitter } from "./disposable";
import type { Host, LogLevel } from "../host/types";

export interface LogRecord {
	id: number;
	time: number;
	level: LogLevel;
	scope: string;
	message: string;
	fields?: Record<string, unknown>;
	source: "front" | "back";
	location?: string;
}

const ORDER: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
const RING = 5000;

export type Redactor = (text: string) => string;

export class LogService {
	readonly records: LogRecord[] = [];
	readonly onRecord = new Emitter<LogRecord>();
	private seq = 0;
	private host: Host | null = null;
	private redactors: Redactor[] = [];
	/** Default minimum level and per scope overrides (setting `log.levels`). */
	level: LogLevel = import.meta.env?.DEV ? "debug" : "info";
	levels: Record<string, LogLevel> = {};
	/** Capture caller file and line (dev only; costs a stack trace per call). */
	captureLocation = !!import.meta.env?.DEV;

	attach(host: Host) {
		this.host = host;
		const home = host.dirs.home;
		if (home) this.addRedactor((t) => t.split(home).join("~"));
	}

	addRedactor(r: Redactor) {
		this.redactors.push(r);
	}

	scoped(scope: string): ScopedLogger {
		return new ScopedLogger(this, scope);
	}

	enabled(scope: string, level: LogLevel) {
		const min = this.levels[scope] ?? this.level;
		return ORDER[level] >= ORDER[min];
	}

	private redact(t: string) {
		for (const r of this.redactors) t = r(t);
		return t.replace(/\b(token|password|secret|apikey|api_key)(["'\s:=]+)([^\s"',}]+)/gi, "$1$2***");
	}

	/** Records coming from Rust (via the webview log target). */
	pushBackend(level: LogLevel, message: string) {
		const m = /^\[([^\]]+)\]\s*(.*)$/s.exec(message);
		this.push({ level, scope: m ? m[1] : "rust", message: m ? m[2] : message, source: "back" });
	}

	push(r: Omit<LogRecord, "id" | "time"> & { time?: number }) {
		const rec: LogRecord = { id: ++this.seq, time: r.time ?? Date.now(), ...r, message: this.redact(r.message) };
		this.records.push(rec);
		if (this.records.length > RING) this.records.splice(0, this.records.length - RING);
		this.onRecord.fire(rec);
		return rec;
	}

	write(scope: string, level: LogLevel, message: string, fields?: Record<string, unknown>) {
		if (!this.enabled(scope, level)) return;
		const rec = this.push({ level, scope, message, fields, source: "front" });
		const text = `[${scope}] ${rec.message}${fields ? " " + this.redact(safeJson(fields)) : ""}`;
		if (!this.host) return console[level === "trace" ? "debug" : level](text);
		if (!this.captureLocation) return this.host.log.write(level, text);
		const err = new Error();
		StackTrace.fromError(err)
			.then((frames) => {
				// 0 write, 1 ScopedLogger method, 2 caller
				const f = frames.find((fr, i) => i >= 2 && !/logger\.ts/.test(fr.fileName ?? "")) ?? frames[2];
				const file = (f?.fileName ?? "unknown").replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
				rec.location = `${file}:${f?.lineNumber ?? "?"}`;
				this.host!.log.write(level, text, rec.location);
			})
			.catch(() => this.host!.log.write(level, text));
	}
}

function safeJson(v: unknown) {
	try {
		return JSON.stringify(v);
	} catch {
		return "[unserializable]";
	}
}

function format(args: unknown[]): { message: string; fields?: Record<string, unknown> } {
	// log.info("saved", { path, ms }): a trailing plain object becomes structured fields
	const last = args[args.length - 1];
	let fields: Record<string, unknown> | undefined;
	if (args.length > 1 && last && typeof last === "object" && !Array.isArray(last) && !(last instanceof Error)) {
		fields = last as Record<string, unknown>;
		args = args.slice(0, -1);
	}
	const message = args
		.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "object" && a !== null ? safeJson(a) : String(a)))
		.join(" ");
	return { message, fields };
}

export class ScopedLogger {
	constructor(
		private svc: LogService,
		readonly scope: string
	) {}
	trace = (...a: unknown[]) => this.emit("trace", a);
	debug = (...a: unknown[]) => this.emit("debug", a);
	info = (...a: unknown[]) => this.emit("info", a);
	warn = (...a: unknown[]) => this.emit("warn", a);
	error = (...a: unknown[]) => this.emit("error", a);
	child(scope: string) {
		return new ScopedLogger(this.svc, `${this.scope}.${scope}`);
	}
	private emit(level: LogLevel, args: unknown[]) {
		if (!this.svc.enabled(this.scope, level)) return;
		const { message, fields } = format(args);
		this.svc.write(this.scope, level, message, fields);
	}
}

/** The process wide log service; kernels attach their host at boot. */
export const logs = new LogService();
export const logger = logs.scoped("app");
