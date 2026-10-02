/** Background jobs (Section 21.1): progress, cancellation and a concurrency limit. */
import type { NotifyService } from "../notify/notify.svelte";

export interface Job {
	id: string;
	title: string;
	owner: string;
	fraction: number | null;
	message?: string;
	state: "queued" | "running" | "done" | "failed" | "cancelled";
	started?: number;
	ended?: number;
	error?: string;
	cancel(): void;
}

export interface JobContext {
	signal: AbortSignal;
	report(fraction: number | null, message?: string): void;
}

export class JobService {
	jobs = $state<Job[]>([]);
	concurrency = 4;
	private running = 0;
	private queue: (() => void)[] = [];

	constructor(private notify: NotifyService) {}

	/** Run work in the background with a progress toast mirrored to the taskbar. */
	run<T>(title: string, fn: (j: JobContext) => Promise<T>, o: { owner?: string; cancellable?: boolean; silent?: boolean } = {}): Promise<T> {
		const ac = new AbortController();
		const job: Job = { id: crypto.randomUUID(), title, owner: o.owner ?? "app", fraction: null, state: "queued", cancel: () => ac.abort() };
		this.jobs = [job, ...this.jobs].slice(0, 100);
		const live = () => this.jobs.find((j) => j.id === job.id)!;
		return new Promise<T>((resolve, reject) => {
			const start = async () => {
				this.running++;
				const j = live();
				j.state = "running";
				j.started = Date.now();
				const p = o.silent ? null : this.notify.progress({ title, cancellable: o.cancellable, source: job.owner });
				p?.signal.addEventListener("abort", () => ac.abort());
				try {
					const r = await fn({
						signal: ac.signal,
						report: (f, m) => {
							const jj = live();
							jj.fraction = f;
							jj.message = m;
							p?.report(f, m);
						}
					});
					live().state = ac.signal.aborted ? "cancelled" : "done";
					p?.done(`${title}: done`);
					resolve(r);
				} catch (e) {
					const jj = live();
					jj.state = ac.signal.aborted ? "cancelled" : "failed";
					jj.error = String((e as Error)?.message ?? e);
					p?.fail(e);
					reject(e);
				} finally {
					live().ended = Date.now();
					this.running--;
					this.queue.shift()?.();
				}
			};
			if (this.running < this.concurrency) void start();
			else this.queue.push(() => void start());
		});
	}
}
