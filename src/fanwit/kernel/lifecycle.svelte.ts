/**
 * Lifecycle phases (Section 4.4): boot -> ready (first paint) -> restored -> idle -> willShutdown.
 * `onWillShutdown(e => e.veto(promise, "Unsaved notes"))` lets modules ask before a window closes.
 */
import { Emitter, type Disposable } from "./disposable";

export type Phase = "boot" | "ready" | "restored" | "idle" | "willShutdown" | "shutdown";

export interface WillShutdownEvent {
	reason: "close" | "quit" | "reload" | "update";
	/** `true` (or a promise resolving true) vetoes the shutdown; `reason` is shown to the user. */
	veto(v: boolean | Promise<boolean>, reason: string): void;
}

export class Lifecycle {
	phase = $state<Phase>("boot");
	readonly onPhase = new Emitter<Phase>();
	private willShutdown = new Emitter<WillShutdownEvent>();
	readonly marks: Record<string, number> = {};

	set(p: Phase) {
		this.phase = p;
		this.mark(p);
		this.onPhase.fire(p);
	}

	mark(name: string) {
		this.marks[name] = typeof performance !== "undefined" ? performance.now() : Date.now();
		try {
			performance.mark?.(`fanwit:${name}`);
		} catch {
			/* ignore */
		}
	}

	/** Resolves once the given phase (or a later one) is reached. */
	when(p: Phase): Promise<void> {
		const order: Phase[] = ["boot", "ready", "restored", "idle", "willShutdown", "shutdown"];
		if (order.indexOf(this.phase) >= order.indexOf(p)) return Promise.resolve();
		return new Promise((resolve) => {
			const d = this.onPhase.on((now) => {
				if (order.indexOf(now) >= order.indexOf(p)) {
					d.dispose();
					resolve();
				}
			});
		});
	}

	onWillShutdown(fn: (e: WillShutdownEvent) => void): Disposable {
		return this.willShutdown.on(fn);
	}

	/** Collects vetoes (each limited to `timeout` ms). Returns the reasons of vetoes that held. */
	async collectVetoes(reason: WillShutdownEvent["reason"], timeout = 5000): Promise<string[]> {
		const pending: { v: Promise<boolean>; reason: string }[] = [];
		this.willShutdown.fire({ reason, veto: (v, r) => pending.push({ v: Promise.resolve(v), reason: r }) });
		const results = await Promise.all(
			pending.map(async (p) => {
				const t = new Promise<boolean>((r) => setTimeout(() => r(false), timeout));
				return (await Promise.race([p.v, t]).catch(() => false)) ? p.reason : null;
			})
		);
		return results.filter((r): r is string => !!r);
	}
}
