import { expect, test, vi } from "vitest";
import { createMemoryHost } from "../host/memory";
import { EventBus } from "./events";
import { Lifecycle } from "./lifecycle.svelte";
import { ServiceRegistry } from "./services";

test("window events stay in the window; app events go through the host to every window", async () => {
	const host = createMemoryHost();
	const a = new EventBus(host, "main");
	const b = new EventBus(host, "settings");
	const seen: string[] = [];
	a.on("notes:saved", (p) => seen.push(`a ${JSON.stringify(p)}`));
	b.on("notes:saved", (p) => seen.push(`b ${JSON.stringify(p)}`));
	a.emit("notes:saved", { path: "x" });
	await a.emit("notes:saved", { path: "y" }, { scope: "app" });
	expect(seen).toEqual(['a {"path":"x"}', 'a {"path":"y"}', 'b {"path":"y"}']);
});

test("onAny sees every event with its scope and origin, for the event monitor", () => {
	const bus = new EventBus(null);
	const all: string[] = [];
	bus.onAny.on((r) => all.push(`${r.name} ${r.scope} ${r.origin}`));
	bus.emit("vault:opened", {});
	expect(all).toEqual(["vault:opened window main"]);
});

test("the lifecycle resolves waiters as it reaches a phase, and collects shutdown vetoes", async () => {
	vi.useFakeTimers();
	const life = new Lifecycle();
	let ready = false;
	void life.when("ready").then(() => (ready = true));
	life.set("ready");
	await Promise.resolve();
	expect(ready).toBe(true);
	life.onWillShutdown((e) => e.veto(true, "Unsaved notes"));
	life.onWillShutdown((e) => e.veto(new Promise(() => {}), "Never answers"));
	const vetoes = life.collectVetoes("close", 100);
	await vi.advanceTimersByTimeAsync(100);
	expect(await vetoes).toEqual(["Unsaved notes"]); // the silent one timed out and does not block
	vi.useRealTimers();
});

test("services are lazy singletons, unique by id, and can activate their provider", async () => {
	const s = new ServiceRegistry();
	let made = 0;
	s.provide("notes.index", () => ({ id: ++made }), "notes");
	expect(made).toBe(0);
	expect(await s.get("notes.index")).toEqual({ id: 1 });
	expect(await s.get("notes.index")).toEqual({ id: 1 });
	expect(() => s.provide("notes.index", () => ({}), "other")).toThrow(expect.objectContaining({ code: "SERVICE_DUPLICATE" }));
	s.resolveMissing = async (id) => void s.provide(id, () => "late", "lazy");
	expect(await s.get("lazy.thing")).toBe("late");
});
