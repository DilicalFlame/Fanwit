<script lang="ts">
	import { getKernel } from "../../ui.svelte";

	/**
	 * Installer Lab (Section 16.16): edit installer.toml, switch presets, toggle simulated
	 * machines and read the plan, with the generated native glue next to the declaration.
	 * Plans run in the engine against a simulated machine; nothing on this computer changes.
	 */
	const k = getKernel();
	const desktop = k.host.kind === "tauri";

	interface Item { id: string; title: string; phase: string; status: string; detail: string; actions: string[]; elevation: boolean }
	interface Result { plan: { target: string; items: Item[]; blocked: boolean }; summary: string; pages: string[]; preset: string; components: { id: string; title: string; required: boolean; default: boolean }[] }
	interface Loaded { source: string; text: string; scenarios: Record<string, string>; glue: Record<string, string>; os: string }

	const PRESETS: Record<string, { scope: string; artefacts: string[]; pages: string[] }> = {
		classic: { scope: "user", artefacts: ["native"], pages: [] },
		branded: { scope: "ask", artefacts: ["native", "setup", "scripts", "managers"], pages: ["welcome", "license", "scope", "components", "options", "prereqs", "summary", "progress", "finish"] },
		"one-click": { scope: "user", artefacts: ["setup"], pages: ["progress"] },
		"dev-tool": { scope: "user", artefacts: ["native", "scripts", "managers"], pages: [] },
		enterprise: { scope: "machine", artefacts: ["native"], pages: [] },
		portable: { scope: "user", artefacts: ["portable"], pages: [] }
	};

	let loaded = $state<Loaded | null>(null);
	let text = $state("");
	let os = $state("windows");
	let scope = $state("user");
	let phase = $state("");
	let picked = $state<string[]>([]);
	let result = $state<Result | null>(null);
	let error = $state("");
	let tab = $state<"plan" | "pages" | "glue">("plan");
	let glueFile = $state("");

	$effect(() => {
		if (!desktop) return;
		void k.host.invoke<Loaded>("fw_installer_lab_load").then((l) => {
			loaded = l;
			text = l.text;
			os = l.os === "macos" || l.os === "linux" ? l.os : "windows";
			glueFile = Object.keys(l.glue)[0] ?? "";
		});
	});

	// re-plan whenever an input changes (debounced while typing)
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const input = { text, scenarios: picked.map((n) => loaded?.scenarios[n] ?? ""), os, scope, phase: phase || null };
		if (!loaded) return;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				result = await k.host.invoke<Result>("fw_installer_lab_plan", { input });
				error = "";
			} catch (e) {
				error = String(e);
			}
		}, 250);
	});

	/** Rewrite the [installer] preset keys in the text (line level, comments survive). */
	function applyPreset(name: string) {
		const p = PRESETS[name];
		const set = (t: string, key: string, value: unknown) => {
			const re = new RegExp(`^(${key}\\s*=\\s*)(\\[[^\\]]*\\]|"[^"]*"|\\S+)`, "m");
			return re.test(t) ? t.replace(re, `$1${JSON.stringify(value)}`) : t.replace(/^\[installer\]\s*$/m, `[installer]\n${key} = ${JSON.stringify(value)}`);
		};
		let t = set(text, "preset", name);
		t = set(t, "scope", p.scope);
		t = set(t, "artefacts", p.artefacts);
		if (p.pages.length) t = set(t, "pages", p.pages);
		text = t;
	}

	function toggle(name: string) {
		picked = picked.includes(name) ? picked.filter((n) => n !== name) : [...picked, name];
	}

	const pill: Record<string, string> = {
		satisfied: "bg-success-muted text-success",
		missing: "bg-primary/10 text-primary",
		outdated: "bg-primary/10 text-primary",
		deferred: "bg-muted text-muted-foreground",
		blocked: "bg-destructive/15 text-destructive"
	};
</script>

{#if !desktop}
	<div class="p-6 text-sm text-muted-foreground">The Installer Lab plans with the install engine, which ships with the desktop app. Use <code>pnpm fw installer plan</code> on the web build.</div>
{:else if !loaded}
	<div class="p-6 text-sm text-muted-foreground">Loading installer.toml…</div>
{:else}
	<div class="grid h-full min-h-0 grid-cols-[minmax(320px,42%)_1fr] text-[13px]">
		<section class="flex min-h-0 flex-col border-r border-border">
			<header class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
				<span class="font-medium">installer.toml</span>
				<span class="text-xs text-muted-foreground">{loaded.source === "repo" ? "from the repo (edits stay in the lab)" : "the copy bundled with this build"}</span>
				<select class="fw-input ml-auto w-auto" aria-label="Preset" value={result?.preset ?? ""} onchange={(e) => applyPreset(e.currentTarget.value)}>
					{#each Object.keys(PRESETS) as p (p)}<option value={p}>{p}</option>{/each}
				</select>
			</header>
			<textarea class="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none" spellcheck="false" aria-label="installer.toml" bind:value={text}></textarea>
		</section>

		<section class="flex min-h-0 flex-col">
			<header class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
				<select class="fw-input w-auto" aria-label="Operating system" bind:value={os}>
					<option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option>
				</select>
				<select class="fw-input w-auto" aria-label="Scope" bind:value={scope}>
					<option value="user">Just me</option><option value="machine">Everyone</option>
				</select>
				<select class="fw-input w-auto" aria-label="Phase" bind:value={phase}>
					<option value="">Every phase</option>
					{#each ["bootstrap", "package", "firstRun", "update"] as p (p)}<option value={p}>{p}</option>{/each}
				</select>
				<div class="flex flex-wrap gap-1" role="group" aria-label="Simulated machine">
					{#each Object.keys(loaded.scenarios) as name (name)}
						<button class="rounded-full border px-2 py-0.5 text-xs {picked.includes(name) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}" aria-pressed={picked.includes(name)} onclick={() => toggle(name)}>{name}</button>
					{/each}
				</div>
			</header>
			<div class="flex gap-1 border-b border-border px-3" role="tablist">
				{#each [["plan", "Plan"], ["pages", "Setup pages"], ["glue", "Generated glue"]] as [id, label] (id)}
					<button role="tab" aria-selected={tab === id} class="border-b-2 px-2 py-1.5 {tab === id ? 'border-primary' : 'border-transparent text-muted-foreground'}" onclick={() => (tab = id as typeof tab)}>{label}</button>
				{/each}
			</div>
			<div class="min-h-0 flex-1 overflow-auto p-3">
				{#if error}
					<pre class="rounded-md bg-destructive/10 p-3 text-xs whitespace-pre-wrap text-destructive">{error}</pre>
				{:else if tab === "plan" && result}
					<p class="mb-2 text-xs text-muted-foreground">{result.plan.target} · {result.summary}</p>
					{#if !result.plan.items.length}<p class="text-muted-foreground">No steps for this selection.</p>{/if}
					<ul class="divide-y divide-border rounded-md border border-border">
						{#each result.plan.items as i (i.id)}
							<li class="px-3 py-2">
								<div class="flex items-center gap-2">
									<span class="font-medium">{i.title}</span>
									<span class="text-xs text-muted-foreground">{i.phase}</span>
									{#if i.elevation}<span class="text-xs text-warning">admin</span>{/if}
									<span class="ml-auto rounded-full px-2 py-0.5 text-[11px] {pill[i.status] ?? 'bg-muted'}">{i.status}</span>
								</div>
								{#if i.detail}<div class="text-xs text-muted-foreground">{i.detail}</div>{/if}
								{#each i.actions as a (a)}<div class="mt-0.5 font-mono text-[11px] text-muted-foreground">→ {a}</div>{/each}
							</li>
						{/each}
					</ul>
				{:else if tab === "pages" && result}
					<ol class="list-decimal space-y-1 pl-5">
						{#each result.pages.length ? result.pages : ["welcome", "components", "options", "summary", "progress", "finish"] as p (p)}<li>{p}</li>{/each}
					</ol>
					<p class="mt-3 text-xs text-muted-foreground">See every page in the product theme with <code>pnpm fw installer dev --scenario {picked.join(",") || "no-admin"}</code>.</p>
				{:else if tab === "glue"}
					{#if Object.keys(loaded.glue).length}
						<div class="mb-2 flex flex-wrap gap-1">
							{#each Object.keys(loaded.glue) as f (f)}
								<button class="rounded border px-2 py-0.5 font-mono text-[11px] {glueFile === f ? 'border-primary text-primary' : 'border-border text-muted-foreground'}" onclick={() => (glueFile = f)}>{f}</button>
							{/each}
						</div>
						<pre class="rounded-md bg-muted p-3 font-mono text-[11px] whitespace-pre-wrap select-text">{loaded.glue[glueFile]}</pre>
					{:else}
						<p class="text-muted-foreground">Run <code>pnpm fw installer build --no-bundle</code> to generate the NSIS, WiX, deb, rpm and pkg glue.</p>
					{/if}
				{/if}
			</div>
		</section>
	</div>
{/if}
