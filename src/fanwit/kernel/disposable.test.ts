import { expect, test, vi } from "vitest";
import { DisposableStore, Emitter, debounce, toDisposable } from "./disposable";

test("a disposable runs its cleanup once, however often it is disposed", () => {
	const fn = vi.fn();
	const d = toDisposable(fn);
	d.dispose();
	d.dispose();
	expect(fn).toHaveBeenCalledTimes(1);
});

test("a store disposes newest first, and disposes late additions at once", () => {
	const order: string[] = [];
	const store = new DisposableStore();
	store.add(toDisposable(() => order.push("first")));
	store.add(toDisposable(() => order.push("second")));
	store.dispose();
	expect(order).toEqual(["second", "first"]);
	store.add(toDisposable(() => order.push("late")));
	expect(order).toEqual(["second", "first", "late"]);
});

test("an emitter delivers to its listeners until they are disposed", () => {
	const e = new Emitter<number>();
	const seen: number[] = [];
	const d = e.on((n) => seen.push(n));
	e.once((n) => seen.push(n * 10));
	e.fire(1);
	e.fire(2);
	d.dispose();
	e.fire(3);
	expect(seen).toEqual([1, 10, 2]);
	expect(e.size).toBe(0);
});

test("a failing listener does not stop the others", () => {
	const e = new Emitter<void>();
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	const after = vi.fn();
	e.on(() => {
		throw new Error("boom");
	});
	e.on(after);
	e.fire();
	expect(after).toHaveBeenCalled();
	spy.mockRestore();
});

test("debounce runs once with the last arguments, and flush runs it now", () => {
	vi.useFakeTimers();
	const fn = vi.fn();
	const save = debounce(fn, 100);
	save("a");
	save("b");
	vi.advanceTimersByTime(99);
	expect(fn).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1);
	expect(fn).toHaveBeenCalledExactlyOnceWith("b");
	save("c");
	save.flush();
	expect(fn).toHaveBeenLastCalledWith("c");
	vi.useRealTimers();
});
