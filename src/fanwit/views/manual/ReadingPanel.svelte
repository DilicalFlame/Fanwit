<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { manualSettings } from "../../core/manual";

	/**
	 * Reading settings (the Aa button). Each control is a `manual.*` setting, so choices live in
	 * settings.toml, can differ per vault, and show in the Settings window too.
	 */
	const k = getKernel();
	const S = k.sys.settings;
	const defs = Object.fromEntries(manualSettings.settings.map((d) => [d.key.slice(7), d]));
	const get = <T,>(key: string) => S.get<T>(`manual.${key}`);
	const set = (key: string, v: unknown) => void Promise.resolve(S.set(`manual.${key}`, v)).catch((e: unknown) => k.sys.notify.error(e));
	const SWATCH: Record<string, [string, string]> = {
		app: ["var(--background)", "var(--foreground)"],
		light: ["#ffffff", "#1f2328"],
		paper: ["#f8f1e3", "#3b3024"],
		solarized: ["#fdf6e3", "#475b62"],
		dark: ["#0d1117", "#e6edf3"],
		coal: ["#141414", "#dddddd"],
		navy: ["#161923", "#c3c4d6"],
		ayu: ["#0f1419", "#c5c5c5"],
		contrast: ["#000000", "#ffffff"]
	};
	const sliders = ["fontSize", "lineHeight", "measure", "paragraphSpacing", "letterSpacing", "wordSpacing", "codeSize", "speechRate"];
	const toggles = ["bionic", "focus", "ruler", "justify", "hyphenate", "codeWrap", "ligatures"];
	function reset() {
		for (const d of manualSettings.settings) set(d.key.slice(7), d.default);
	}
	const fmt = (v: number, unit?: string) => `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, "")}${unit && unit !== "×" ? unit : unit ?? ""}`;
</script>

<div class="flex max-h-[min(80vh,640px)] w-[340px] flex-col gap-3 overflow-auto p-3 text-xs" role="group" aria-label="Reading settings">
	<p class="rounded-md border border-border p-2 leading-relaxed" style:font-family="var(--doc-font)" style:font-size="var(--doc-size)" style:line-height="var(--doc-leading)" style:letter-spacing="var(--doc-letter)" style:word-spacing="var(--doc-word)">
		The quick brown fox reads the manual and finally understands <em>why</em> it works.
	</p>

	<fieldset>
		<legend class="mb-1.5 font-medium">Theme</legend>
		<div class="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Reading theme">
			{#each defs.theme.options ?? [] as t (t)}
				<button
					class="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px] {get('theme') === t ? 'border-primary ring-2 ring-primary/30' : 'border-border'}"
					style:background={SWATCH[t][0]}
					style:color={SWATCH[t][1]}
					role="radio"
					aria-checked={get("theme") === t}
					title={defs.theme.labels?.[t]}
					onclick={() => set("theme", t)}
				>
					<span class="text-sm leading-none font-semibold">Aa</span><span class="max-w-full truncate px-0.5">{t === "app" ? "App" : defs.theme.labels?.[t]}</span>
				</button>
			{/each}
		</div>
	</fieldset>

	<label class="flex flex-col gap-1">
		<span class="font-medium">Font</span>
		<select class="fw-input text-xs" value={get("font")} onchange={(e) => set("font", e.currentTarget.value)}>
			{#each defs.font.options ?? [] as f (f)}<option value={f}>{defs.font.labels?.[f]}</option>{/each}
		</select>
	</label>

	<fieldset class="flex flex-col gap-1">
		<legend class="font-medium">{defs.explain.title}</legend>
		<div class="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label={defs.explain.title}>
			{#each defs.explain.options ?? [] as o (o)}
				<button class="flex-1 rounded px-2 py-1 {get('explain') === o ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}" role="radio" aria-checked={get("explain") === o} onclick={() => set("explain", o)}>{defs.explain.labels?.[o]}</button>
			{/each}
		</div>
		<span class="text-muted-foreground">Guided opens the "why" and "under the hood" notes; Expert folds them.</span>
	</fieldset>

	{#each sliders as key (key)}
		{@const d = defs[key]}
		<label class="flex flex-col gap-0.5">
			<span class="flex justify-between"><span>{d.title}</span><span class="text-muted-foreground tabular-nums">{fmt(get<number>(key), d.unit)}</span></span>
			<input type="range" min={d.min} max={d.max} step={d.step} value={get<number>(key)} oninput={(e) => set(key, Number(e.currentTarget.value))} class="accent-primary" />
		</label>
	{/each}

	<div class="flex flex-col gap-1.5">
		{#each toggles as key (key)}
			{@const d = defs[key]}
			<label class="flex items-start gap-2" title={d.description}>
				<input type="checkbox" class="mt-0.5 accent-primary" checked={get<boolean>(key)} onchange={(e) => set(key, e.currentTarget.checked)} />
				<span>{d.title}{#if d.description}<span class="block text-muted-foreground">{d.description}</span>{/if}</span>
			</label>
		{/each}
	</div>

	<div class="flex gap-2 border-t border-border pt-2">
		<button class="fw-btn" onclick={reset}>Reset</button>
		{#if k.commands.get("app.settings")}
			<button class="fw-btn fw-btn-ghost ml-auto" onclick={() => k.commands.run("app.settings", { page: "@manual." })}>All settings</button>
		{/if}
	</div>
</div>
