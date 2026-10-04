import { expect, test } from "vitest";
import { createMemoryHost } from "../host/memory";
import { NotifyService } from "../notify/notify.svelte";
import { JobService } from "./jobs.svelte";

const jobs = () => new JobService(new NotifyService(createMemoryHost(), async () => {}));

test("jobs report progress and resolve with their result", async () => {
	const j = jobs();
	const seen: (number | null)[] = [];
	const r = await j.run("Index", async (ctx) => {
		ctx.report(0.5, "half");
		seen.push(j.jobs[0].fraction);
		return 42;
	});
	expect(r).toBe(42);
	expect(seen).toEqual([0.5]);
	expect(j.jobs[0]).toMatchObject({ title: "Index", state: "done" });
});

test("at most `concurrency` jobs run at once; the rest wait their turn", async () => {
	const j = jobs();
	j.concurrency = 2;
	let running = 0;
	let peak = 0;
	const work = () =>
		j.run("w", async () => {
			peak = Math.max(peak, ++running);
			await new Promise((r) => setTimeout(r, 5));
			running--;
		}, { silent: true });
	await Promise.all([work(), work(), work(), work(), work()]);
	expect(peak).toBe(2);
	expect(j.jobs.every((x) => x.state === "done")).toBe(true);
});

test("cancelling aborts the job's signal and marks it cancelled", async () => {
	const j = jobs();
	const p = j.run("Long", (ctx) => new Promise((_, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("stopped")))), { silent: true });
	j.jobs[0].cancel();
	await expect(p).rejects.toThrow("stopped");
	expect(j.jobs[0].state).toBe("cancelled");
});
