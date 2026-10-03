<script lang="ts">
	import { getKernel } from "../ui.svelte";
	import { useWindow } from "../windows/windows.svelte";
	import Icon from "../icons/Icon.svelte";

	/** First run onboarding (Figure 17.4): Look, Data, Keys, Tour. Choices apply live. */
	const k = getKernel();
	const s = k.sys.settings;
	let self: ReturnType<typeof useWindow> | null = null;
	try {
		self = useWindow();
	} catch {
		self = null;
	}
	const STEPS = ["Look", "Data", "Keys", "Tour"];
	let step = $state(0);
	let done = $state(0);

	async function finish() {
		await k.sys.storage.set("fanwit", "onboarded", true);
		await self?.close(true);
	}
	function next() {
		done = Math.max(done, step + 1);
		if (step === STEPS.length - 1) void finish();
		else step++;
	}
	function keys(e: KeyboardEvent) {
		if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") next();
		if (e.key === "Escape") void finish();
	}
</script>

<div class="flex h-full flex-col p-6" role="presentation" onkeydown={keys}>
	<ol class="mb-6 flex items-center gap-2 text-xs" aria-label="Steps">
		{#each STEPS as label, i (label)}
			<li>
				<button class="flex items-center gap-1.5 rounded-full px-2.5 py-1 {i === step ? 'bg-primary text-primary-foreground' : i <= done ? 'bg-muted' : 'text-muted-foreground'}" disabled={i > done} aria-current={i === step ? "step" : undefined} onclick={() => (step = i)}>
					<span class="tabular-nums">{i + 1}</span>{label}
				</button>
			</li>
			{#if i < STEPS.length - 1}<li aria-hidden="true" class="h-px w-6 bg-border"></li>{/if}
		{/each}
	</ol>

	<div class="min-h-0 flex-1 overflow-auto">
		{#if step === 0}
			<h1 class="text-xl font-semibold">Pick a look</h1>
			<p class="mb-4 text-sm text-muted-foreground">You can change this any time in Settings, Appearance.</p>
			<div class="grid grid-cols-3 gap-3">
				{#each [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "System", "monitor"]] as [m, label, icon] (m)}
					<button class="flex flex-col items-center gap-2 rounded-xl border-2 p-4 {s.get('theme.mode') === m ? 'border-primary' : 'border-border hover:border-muted-foreground'}" aria-pressed={s.get("theme.mode") === m} onclick={() => s.set("theme.mode", m)}>
						<div class="h-16 w-full rounded-md border border-border {m === 'dark' ? 'bg-zinc-900' : m === 'light' ? 'bg-white' : 'bg-gradient-to-r from-white to-zinc-900'}"></div>
						<span class="flex items-center gap-1 text-sm"><Icon name={icon} size={14} />{label}</span>
					</button>
				{/each}
			</div>
			<div class="mt-4 flex flex-wrap gap-4 text-sm">
				<label class="flex items-center gap-2">Theme
					<select class="fw-input w-48 text-xs" value={s.get("theme.dark")} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; void s.set("theme.dark", v); void s.set("theme.light", v); }}>
						{#each k.sys.themes.list() as t (t.def.meta.id)}<option value={t.def.meta.id}>{t.def.meta.name}</option>{/each}
					</select>
				</label>
				<label class="flex items-center gap-2">Density
					<select class="fw-input w-40 text-xs" value={s.get("ui.density")} onchange={(e) => s.set("ui.density", (e.currentTarget as HTMLSelectElement).value)}>
						<option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option>
					</select>
				</label>
			</div>
		{:else if step === 1}
			<h1 class="text-xl font-semibold">Where should your data live?</h1>
			<p class="mb-4 text-sm text-muted-foreground">A vault is a folder you choose. Without one, data stays in the app's own folder.</p>
			<div class="flex flex-col gap-2">
				<button class="flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent" onclick={() => k.commands.run("vault.switch")}><Icon name="library" /><span><b class="text-sm">Use a vault</b><br /><span class="text-xs text-muted-foreground">Open or create a folder now.</span></span></button>
				<button class="flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent" onclick={next}><Icon name="hard-drive" /><span><b class="text-sm">Keep data in the app</b><br /><span class="text-xs text-muted-foreground">{k.host.dirs.data}</span></span></button>
			</div>
		{:else if step === 2}
			<h1 class="text-xl font-semibold">Shortcuts style</h1>
			<p class="mb-4 text-sm text-muted-foreground">Everything is a command; shortcuts are just one way to run them.</p>
			<select class="fw-input w-60" value={s.get("keys.style")} onchange={(e) => s.set("keys.style", (e.currentTarget as HTMLSelectElement).value)}>
				<option value="default">Default</option><option value="vscode">VS Code like</option><option value="sublime">Sublime like</option>
			</select>
			<p class="mt-4 text-sm">Press <kbd class="rounded border px-1">{k.keys.label("palette.open")?.join(" ")}</kbd> to open the command palette, and <kbd class="rounded border px-1">{k.keys.label("keys.showOverlay")?.join(" ")}</kbd> to see every shortcut available where you are.</p>
		{:else}
			<h1 class="text-xl font-semibold">A quick tour</h1>
			<ul class="mt-3 flex flex-col gap-2 text-sm">
				<li class="flex gap-2"><Icon name="mouse-pointer-click" class="mt-0.5" />Right click anything for its context menu. Turn on developer mode to edit any menu.</li>
				<li class="flex gap-2"><Icon name="layout-dashboard" class="mt-0.5" />Drag tabs to split, float or pop them out. The layout lives in workspace.toml, editable by hand.</li>
				<li class="flex gap-2"><Icon name="flask-conical" class="mt-0.5" />The Labs in the activity bar let you try every system and copy the code.</li>
				<li class="flex gap-2"><Icon name="book-open" class="mt-0.5" />Press F1 for the manual page of whatever you are looking at.</li>
			</ul>
		{/if}
	</div>

	<div class="flex items-center justify-between pt-4">
		<button class="fw-btn fw-btn-ghost" onclick={finish}>Skip</button>
		<button class="fw-btn fw-btn-primary" onclick={next}>{step === STEPS.length - 1 ? "Get started" : "Next"}</button>
	</div>
</div>
