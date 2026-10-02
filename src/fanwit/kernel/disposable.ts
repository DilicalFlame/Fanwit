export interface Disposable {
	dispose(): void;
}

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

/** Collects disposables and disposes them together, newest first. */
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
