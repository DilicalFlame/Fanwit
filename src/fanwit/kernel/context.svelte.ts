/**
 * Context keys (Section 4.5): named values describing the current situation. Keys are global,
 * or scoped to a DOM subtree with `use:ctxkeys`; evaluation walks from the focused element (or
 * the element under the pointer for context menus) up to the root, merging scopes.
 */
import { Emitter, toDisposable, type Disposable } from "./disposable";
import { compileWhen, type Lookup, type WhenClause } from "./when";

type Scoped = Element & { __fwctx?: Record<string, unknown> };

export class ContextKeyService {
	/** Bumped on every change; read it inside $derived to re-evaluate when clauses reactively. */
	version = $state(0);
	readonly onDidChange = new Emitter<string[]>();
	private values = new Map<string, unknown>();
	private known = new Map<string, { type: string; description?: string }>();

	set(key: string, value: unknown) {
		if (this.values.get(key) === value) return;
		if (value === undefined) this.values.delete(key);
		else this.values.set(key, value);
		this.bump([key]);
	}

	/** Set a key for as long as the returned disposable lives. */
	bind(key: string, value: unknown): Disposable {
		this.set(key, value);
		return toDisposable(() => this.set(key, undefined));
	}

	get<T = unknown>(key: string): T | undefined {
		return this.values.get(key) as T | undefined;
	}

	/** Describe a key for autocomplete in the when editor and the context keys viewer. */
	declare(key: string, type: string, description?: string) {
		this.known.set(key, { type, description });
	}

	get declared() {
		return [...this.known.entries()].map(([key, v]) => ({ key, ...v }));
	}

	bump(keys: string[] = []) {
		this.version++;
		this.onDidChange.fire(keys);
	}

	/** Lookup starting at `el` (default: focused element), merging DOM scopes over globals. */
	lookup(el?: Element | null, extra?: Record<string, unknown>): Lookup {
		const scopes: Record<string, unknown>[] = [];
		let node = (el ?? (typeof document !== "undefined" ? document.activeElement : null)) as Scoped | null;
		while (node) {
			if (node.__fwctx) scopes.push(node.__fwctx);
			node = node.parentElement as Scoped | null;
		}
		return (key) => {
			if (extra && key in extra) return extra[key];
			for (const s of scopes) if (key in s) return s[key];
			if (key.startsWith("config.")) return this.configLookup?.(key.slice(7));
			return this.values.get(key);
		};
	}

	/** Settings are readable in clauses as `config.<key>`; wired by the settings service. */
	configLookup?: (key: string) => unknown;

	snapshot(el?: Element | null, extra?: Record<string, unknown>): Record<string, unknown> {
		const l = this.lookup(el, extra);
		const out: Record<string, unknown> = {};
		const keys = new Set<string>([...this.values.keys()]);
		let node = (el ?? (typeof document !== "undefined" ? document.activeElement : null)) as Scoped | null;
		while (node) {
			if (node.__fwctx) Object.keys(node.__fwctx).forEach((k) => keys.add(k));
			node = node.parentElement as Scoped | null;
		}
		if (extra) Object.keys(extra).forEach((k) => keys.add(k));
		for (const k of keys) out[k] = l(k);
		return out;
	}

	evaluate(when: WhenClause | undefined, el?: Element | null, extra?: Record<string, unknown>): boolean {
		if (!when) return true;
		return compileWhen(when).eval(this.lookup(el, extra));
	}

	explain(when: WhenClause | undefined, lookup: Lookup): string | null {
		if (!when) return null;
		return compileWhen(when).explain(lookup);
	}

	/** Track focus and selection to maintain `inputFocus`, `textSelected` and `window.focused`. */
	trackDom(): Disposable {
		if (typeof document === "undefined") return toDisposable(() => {});
		const isInput = (el: Element | null) =>
			!!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);
		const onFocus = () => {
			this.set("inputFocus", isInput(document.activeElement));
			this.bump();
		};
		const onSel = () => {
			const s = document.getSelection();
			this.set("textSelected", !!s && !s.isCollapsed);
		};
		const onWin = () => this.set("window.focused", document.hasFocus());
		document.addEventListener("focusin", onFocus);
		document.addEventListener("focusout", onFocus);
		document.addEventListener("selectionchange", onSel);
		window.addEventListener("focus", onWin);
		window.addEventListener("blur", onWin);
		onFocus();
		onWin();
		return toDisposable(() => {
			document.removeEventListener("focusin", onFocus);
			document.removeEventListener("focusout", onFocus);
			document.removeEventListener("selectionchange", onSel);
			window.removeEventListener("focus", onWin);
			window.removeEventListener("blur", onWin);
		});
	}
}

/** `<div use:ctxkeys={{ focusedView: "notes.list" }}>`: scoped context keys for a subtree. */
export function ctxkeys(node: Element, keys: Record<string, unknown>) {
	const el = node as Scoped;
	el.__fwctx = keys;
	return {
		update(next: Record<string, unknown>) {
			el.__fwctx = next;
			activeContext?.bump(Object.keys(next));
		},
		destroy() {
			delete el.__fwctx;
		}
	};
}

let activeContext: ContextKeyService | null = null;
export function setActiveContext(c: ContextKeyService) {
	activeContext = c;
}
