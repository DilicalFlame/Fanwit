/**
 * Undo and redo (Section 5.5). Stacks per history scope: views set the scope with the
 * `history.scope` context key (one per document or view); otherwise one per window.
 */
import type { UndoRecord } from "./types";

interface Stack {
	undo: UndoRecord[];
	redo: UndoRecord[];
}

const LIMIT = 200;

export class HistoryService {
	version = $state(0);
	private stacks = new Map<string, Stack>();
	private tx: { label: string; records: UndoRecord[] } | null = null;

	constructor(private currentScope: () => string = () => "window") {}

	private stack(scope = this.currentScope()): Stack {
		let s = this.stacks.get(scope);
		if (!s) this.stacks.set(scope, (s = { undo: [], redo: [] }));
		return s;
	}

	push(rec: UndoRecord, scope?: string) {
		if (this.tx) {
			this.tx.records.push(rec);
			return;
		}
		const s = this.stack(scope);
		s.undo.push(rec);
		if (s.undo.length > LIMIT) s.undo.shift();
		s.redo.length = 0;
		this.version++;
	}

	/** Group everything pushed while `fn` runs into one undo step. */
	async transaction<T>(label: string, fn: () => T | Promise<T>, scope?: string): Promise<T> {
		if (this.tx) return fn();
		this.tx = { label, records: [] };
		try {
			return await fn();
		} finally {
			const { records } = this.tx;
			this.tx = null;
			if (records.length) {
				this.push(
					{
						label,
						undo: async () => {
							for (const r of [...records].reverse()) await r.undo();
						},
						redo: async () => {
							for (const r of records) await r.redo?.();
						}
					},
					scope
				);
			}
		}
	}

	canUndo(scope?: string) {
		void this.version;
		return this.stack(scope).undo.length > 0;
	}
	canRedo(scope?: string) {
		void this.version;
		return this.stack(scope).redo.length > 0;
	}
	peek(scope?: string) {
		void this.version;
		const s = this.stack(scope);
		return { undo: s.undo.at(-1)?.label, redo: s.redo.at(-1)?.label };
	}

	async undo(scope?: string) {
		const s = this.stack(scope);
		const rec = s.undo.pop();
		if (!rec) return false;
		await rec.undo();
		if (rec.redo) s.redo.push(rec);
		this.version++;
		return rec.label ?? true;
	}

	async redo(scope?: string) {
		const s = this.stack(scope);
		const rec = s.redo.pop();
		if (!rec?.redo) return false;
		await rec.redo();
		s.undo.push(rec);
		this.version++;
		return rec.label ?? true;
	}

	clear(scope?: string) {
		if (scope) this.stacks.delete(scope);
		else this.stacks.clear();
		this.version++;
	}
}
