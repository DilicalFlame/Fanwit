<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import { contrast, fixContrast, paletteFromBrand, parseColor, parseShadcnCss, toHex, wcagLevel } from "../themes/color";
	import type { Mode, ThemeDef } from "../themes/themes.svelte";
	import { joinPath } from "../host/types";

	/**
	 * Theme Studio (Figure 17.10): token groups with colour pickers (OKLCH text or hex), generate
	 * both modes from one brand colour, WCAG contrast badges with one click fixes, live preview of
	 * the whole app, import a shadcn CSS block, export as TOML, CSS or an installable theme plugin.
	 */
	const k = getKernel();
	const themes = k.sys.themes;
	let baseId = $state(themes.activeId);
	let mode = $state<Mode>(themes.mode);
	let edits = $state<{ light: Record<string, string>; dark: Record<string, string> }>({ light: {}, dark: {} });
	let name = $state("My theme");
	let brand = $state("#3b82f6");
	let importCss = $state("");
	let showImport = $state(false);

	const GROUPS: [string, string[]][] = [
		["Core", ["background", "foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "border", "input", "ring", "card", "popover"]],
		["Workbench", ["titlebar", "titlebar-foreground", "activity", "activity-foreground", "activity-active", "tab", "tab-active", "tab-foreground", "tab-border", "statusbar", "statusbar-foreground", "sidebar", "panel", "splitter", "splitter-hover", "selection", "drop-target"]],
		["Feedback", ["success", "warning", "info"]]
	];
	/** Foreground token -> background it is read on. */
	const PAIRS: Record<string, string> = {
		foreground: "background",
		"primary-foreground": "primary",
		"secondary-foreground": "secondary",
		"muted-foreground": "background",
		"accent-foreground": "accent",
		"titlebar-foreground": "titlebar",
		"activity-foreground": "activity",
		"activity-active": "activity",
		"tab-foreground": "tab",
		"statusbar-foreground": "statusbar"
	};
	const tokens = $derived({ ...themes.resolve(baseId, mode), ...edits[mode] });

	$effect(() => {
		themes.preview = { mode, tokens: { ...edits[mode] } };
		themes.apply();
	});
	onDestroy(() => {
		themes.preview = null;
		themes.apply();
	});

	function set(token: string, value: string) {
		edits[mode] = { ...edits[mode], [token]: value };
	}
	function generate() {
		const p = paletteFromBrand(brand);
		edits = { light: { ...edits.light, ...p.light }, dark: { ...edits.dark, ...p.dark } };
	}
	function doImport() {
		const p = parseShadcnCss(importCss);
		edits = { light: { ...edits.light, ...p.light }, dark: { ...edits.dark, ...p.dark } };
		showImport = false;
	}
	const id = $derived(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-theme");
	const def = $derived<ThemeDef>({ meta: { id, name, author: "", version: "1.0.0", extends: baseId, modes: ["light", "dark"] }, light: edits.light, dark: edits.dark });

	async function save(apply = true) {
		themes.add(def, "user");
		// user themes live in the config dir and load at startup
		const path = joinPath(k.host.dirs.config, "themes", id, "theme.toml");
		await k.host.fs.writeText(path, themes.toToml(def));
		if (apply) await k.sys.settings.set(mode === "dark" ? "theme.dark" : "theme.light", id);
		k.sys.notify.send({ title: `Saved theme "${name}"`, body: path, kind: "success" });
	}
	async function exportAs(kind: "toml" | "css" | "plugin") {
		themes.add(def, "user");
		const text =
			kind === "css"
				? themes.toCss(id)
				: kind === "toml"
					? themes.toToml(def)
					: `# plugin.toml (data only theme plugin)\nid = "${id}-theme"\nname = "${name}"\nversion = "1.0.0"\nentry = ""\n\n[contributes]\nthemes = ["themes/${id}/theme.toml"]\n\n# themes/${id}/theme.toml\n${themes.toToml(def)}`;
		await navigator.clipboard.writeText(text);
		k.sys.notify.toast(`${kind.toUpperCase()} copied to the clipboard`, "success");
	}
	const hex = (v: string) => {
		const c = parseColor(v);
		return c ? toHex(c) : "#000000";
	};
</script>

<div class="flex h-full min-h-0">
	<aside class="flex w-80 shrink-0 flex-col border-r border-border" aria-label="Tokens">
		<div class="flex flex-col gap-2 border-b border-border p-3">
			<div class="flex gap-2">
				<input class="fw-input h-7 text-xs" aria-label="Theme name" bind:value={name} />
				<select class="fw-input h-7 w-36 text-xs" aria-label="Based on" bind:value={baseId}>
					{#each themes.list() as t (t.def.meta.id)}<option value={t.def.meta.id}>{t.def.meta.name}</option>{/each}
				</select>
			</div>
			<div role="tablist" aria-label="Mode" class="flex rounded-md border border-border p-0.5 text-xs">
				{#each ["light", "dark"] as m (m)}<button role="tab" aria-selected={mode === m} class="h-6 flex-1 rounded capitalize {mode === m ? 'bg-accent' : ''}" onclick={() => (mode = m as Mode)}>{m}</button>{/each}
			</div>
			<div class="flex items-center gap-2 text-xs">
				<span class="flex-1 font-medium">Generate from colour</span>
				<input type="color" aria-label="Brand colour" bind:value={brand} />
				<button class="fw-btn h-6" onclick={generate}>Generate</button>
			</div>
		</div>
		<div class="min-h-0 flex-1 overflow-auto p-2 text-xs">
			{#each GROUPS as [group, list] (group)}
				<div class="fw-section-title px-1">{group}</div>
				{#each list as t (t)}
					{@const value = tokens[t] ?? ""}
					{@const bg = PAIRS[t]}
					{@const ratio = bg ? contrast(value, tokens[bg] ?? "#fff") : null}
					<div class="flex items-center gap-2 px-1 py-0.5">
						<label class="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded border border-border" style:background={value} title="Pick {t}">
							<input type="color" class="absolute inset-0 cursor-pointer opacity-0" value={hex(value)} aria-label="{t} colour" oninput={(e) => set(t, (e.currentTarget as HTMLInputElement).value)} />
						</label>
						<span class="w-28 truncate font-mono text-[11px] {edits[mode][t] ? 'font-semibold' : ''}">{t}</span>
						<input class="fw-input h-6 flex-1 font-mono text-[10.5px]" value={value} aria-label="{t} value" onchange={(e) => set(t, (e.currentTarget as HTMLInputElement).value)} />
						{#if ratio}
							{@const level = wcagLevel(ratio)}
							<button
								class="shrink-0 rounded px-1 text-[10px] {level === 'fail' || level === 'AA large' ? 'bg-destructive/15 text-destructive' : 'bg-success-muted text-success'}"
								title={level === "fail" || level === "AA large" ? `Contrast ${ratio.toFixed(1)} on ${bg}; click to fix` : `Contrast ${ratio.toFixed(1)} on ${bg}`}
								onclick={() => (level === "fail" || level === "AA large") && set(t, fixContrast(value, tokens[bg] ?? "#fff"))}>{level === "fail" ? "fix" : level} {ratio.toFixed(1)}</button
							>
						{/if}
					</div>
				{/each}
			{/each}
		</div>
		<div class="flex flex-wrap gap-1 border-t border-border p-2">
			<button class="fw-btn fw-btn-primary h-7" onclick={() => save()}>Save and use</button>
			<button class="fw-btn h-7" onclick={() => exportAs("toml")}>TOML</button>
			<button class="fw-btn h-7" onclick={() => exportAs("css")}>CSS</button>
			<button class="fw-btn h-7" onclick={() => exportAs("plugin")}>Plugin</button>
			<button class="fw-btn h-7" onclick={() => (showImport = !showImport)}>Import shadcn CSS</button>
			<button class="fw-btn h-7" onclick={() => (edits = { light: {}, dark: {} })}>Reset</button>
		</div>
		{#if showImport}
			<div class="flex flex-col gap-1 border-t border-border p-2">
				<textarea class="fw-input h-24 py-1 font-mono text-[11px]" placeholder=":root {'{'} --background: ...; {'}'} .dark {'{'} ... {'}'}" bind:value={importCss}></textarea>
				<button class="fw-btn h-7" onclick={doImport}>Import</button>
			</div>
		{/if}
	</aside>
	<main class="min-w-0 flex-1 overflow-auto p-6" aria-label="Preview">
		<div class="fw-section-title px-0">Live preview: the whole app is restyled while the studio is open</div>
		<div class="mt-2 overflow-hidden rounded-xl border border-border shadow-md">
			<div class="flex h-8 items-center gap-2 bg-titlebar px-3 text-xs text-titlebar-foreground">File Edit View <span class="mx-auto rounded border border-border bg-background/60 px-6 py-0.5 text-muted-foreground">Search or run a command</span></div>
			<div class="flex h-56">
				<div class="flex w-10 flex-col items-center gap-2 bg-activity py-2 text-activity-foreground"><Icon name="files" /><Icon name="search" /><Icon name="puzzle" /></div>
				<div class="w-40 bg-sidebar p-2 text-xs text-sidebar-foreground">EXPLORER<div class="mt-1 rounded bg-selection px-1">welcome.md</div><div class="px-1">notes.md</div></div>
				<div class="flex flex-1 flex-col">
					<div class="flex h-8 bg-tab text-xs"><span class="border-t-2 border-tab-border bg-tab-active px-3 py-1.5">welcome.md</span><span class="px-3 py-1.5 text-tab-foreground/70">layout.toml</span></div>
					<div class="flex-1 bg-background p-3 text-sm text-foreground">
						<h3 class="font-semibold">Welcome</h3>
						<p class="text-muted-foreground">Muted text on the background.</p>
						<div class="mt-2 flex gap-2"><button class="fw-btn fw-btn-primary">Primary</button><button class="fw-btn">Secondary</button><button class="fw-btn fw-btn-danger">Delete</button></div>
					</div>
				</div>
			</div>
			<div class="flex h-6 items-center bg-statusbar px-2 text-[11px] text-statusbar-foreground">my-vault · main · Saved</div>
		</div>
	</main>
</div>
