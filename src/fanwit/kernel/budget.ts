/**
 * Performance budgets (Section 20.7). Each timed operation becomes a User Timing measure, so the
 * DevTools Performance panel shows it and e2e/budgets.test.ts can hold the app to the numbers.
 */
import type { ScopedLogger } from "./logger";

/** Milliseconds each operation may take. */
export const BUDGETS = {
	"fw:module.activate": 50,
	"fw:keys.dispatch": 4,
	"fw:menus.resolve": 16
} as const;

export type BudgetName = keyof typeof BUDGETS;

const counts = new Map<string, number>();

/** Record `name` from `start` (a performance.now() time) to now; returns the duration in ms. */
export function measure(name: BudgetName, start: number, log?: ScopedLogger, what = ""): number {
	const ms = performance.now() - start;
	try {
		performance.measure(name, { start, duration: ms, detail: what });
		// ponytail: keeps the newest ~1000 per name; a ring buffer if profiles ever need more
		const n = (counts.get(name) ?? 0) + 1;
		counts.set(name, n > 1000 ? 0 : n);
		if (n > 1000) performance.clearMeasures(name);
	} catch {
		/* no User Timing (old runtimes): the log line below still reports it */
	}
	if (ms > BUDGETS[name]) log?.debug(`${name}${what ? ` ${what}` : ""} took ${ms.toFixed(1)} ms (budget ${BUDGETS[name]} ms)`);
	return ms;
}
