/**
 * Something to undo later: a registration, a listener, a timer. Every `register`, `on`, `bind`
 * and `add` in the API returns one. Push it to `ctx.subscriptions` and it is disposed when the
 * module deactivates, or call `dispose()` yourself.
 *
 * @example
 * ```ts
 * const d = ctx.events.on("notes:saved", refresh);
 * d.dispose(); // stop listening
 * ```
 */
export interface Disposable {
	dispose(): void;
}

/**
 * Wrap a cleanup function as a {@link Disposable}. Disposing twice runs it once.
 *
 * @example
 * ```ts
 * const timer = setInterval(poll, 5000);
 * ctx.subscriptions.push(toDisposable(() => clearInterval(timer)));
 * ```
 */
export function toDisposable(fn: () => void): Disposable {
	let done = false;
	return {
		dispose() {
			if (done) return;
			done = true;
			fn();
		}
	};
}

/**
 * Collects disposables and disposes them together, newest first. Adding to a store that is
 * already disposed disposes the item at once.
 *
 * @example
 * ```ts
 * const store = new DisposableStore();
 * store.add(ctx.events.on("a", onA));
 * store.add(ctx.events.on("b", onB));
 * store.dispose(); // both listeners gone
 * ```
 */
export class DisposableStore implements Disposable {
	private items: Disposable[] = [];
	private disposed = false;

	add<T extends Disposable>(d: T): T {
		if (this.disposed) d.dispose();
		else this.items.push(d);
		return d;
	}

	dispose() {
		this.disposed = true;
		const items = this.items.splice(0).reverse();
		for (const d of items) {
			try {
				d.dispose();
			} catch (e) {
				console.error("dispose failed", e);
			}
		}
	}
}

export type Listener<T> = (value: T) => void;

/** Minimal typed event emitter. */
export class Emitter<T> {
	private listeners = new Set<Listener<T>>();

	on = (fn: Listener<T>): Disposable => {
		this.listeners.add(fn);
		return toDisposable(() => this.listeners.delete(fn));
	};

	once(fn: Listener<T>): Disposable {
		const d = this.on((v) => {
			d.dispose();
			fn(v);
		});
		return d;
	}

	fire(value: T) {
		for (const fn of [...this.listeners]) {
			try {
				fn(value);
			} catch (e) {
				console.error("listener failed", e);
			}
		}
	}

	get size() {
		return this.listeners.size;
	}
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
	let t: ReturnType<typeof setTimeout> | undefined;
	let last: A | undefined;
	const call = (...a: A) => {
		last = a;
		clearTimeout(t);
		t = setTimeout(() => {
			t = undefined;
			fn(...(last as A));
		}, ms);
	};
	call.flush = () => {
		if (t === undefined) return;
		clearTimeout(t);
		t = undefined;
		fn(...(last as A));
	};
	call.cancel = () => clearTimeout(t);
	return call;
}
