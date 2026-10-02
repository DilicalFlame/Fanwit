/**
 * Icon registry (Section 19.5): icons are referenced by name ("file-text"). Lucide by default,
 * loaded per icon on first use; modules can register SVG icons and icon themes can remap names.
 */
import type { Component } from "svelte";
import { toDisposable } from "../kernel/disposable";

type Loader = () => Promise<unknown>;

class IconRegistry {
	version = $state(0);
	private cache = new Map<string, Component>();
	private svgs = new Map<string, string>();
	private remap = new Map<string, string>();
	private all: Record<string, Loader> | null = null;

	register(name: string, svg: string) {
		// icons come from modules and plugins: drop scripts, handlers and external references
		const clean = svg
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
			.replace(/(href|xlink:href)\s*=\s*(["'])(?!#)[^"']*\2/gi, "");
		this.svgs.set(name, clean);
		this.version++;
		return toDisposable(() => {
			this.svgs.delete(name);
			this.version++;
		});
	}

	/** Icon themes: map names to other names or registered SVGs. */
	setTheme(map: Record<string, string>) {
		this.remap = new Map(Object.entries(map));
		this.version++;
	}

	svg(name: string) {
		return this.svgs.get(this.remap.get(name) ?? name);
	}

	cached(name: string) {
		return this.cache.get(this.remap.get(name) ?? name);
	}

	async load(name: string): Promise<Component | null> {
		const real = this.remap.get(name) ?? name;
		const hit = this.cache.get(real);
		if (hit) return hit;
		if (!this.all) this.all = (await import("./all")).lucide as Record<string, Loader>;
		const loader = this.all[`/node_modules/@lucide/svelte/dist/icons/${real}.svelte`];
		if (!loader) return null;
		const mod = (await loader()) as { default: Component };
		this.cache.set(real, mod.default);
		return mod.default;
	}

	async names(): Promise<string[]> {
		if (!this.all) this.all = (await import("./all")).lucide as Record<string, Loader>;
		return [...Object.keys(this.all).map((k) => k.slice(k.lastIndexOf("/") + 1, -7)), ...this.svgs.keys()].sort();
	}
}

export const icons = new IconRegistry();
