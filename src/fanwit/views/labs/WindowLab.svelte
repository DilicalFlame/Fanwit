<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import type { BlockedEffect, FocusPolicy, WebPresentation, WindowBase, WindowKindSpec } from "../../windows/windows.svelte";

	/** Window Lab (Figure 17.18): try every window option and copy the resulting kind spec. */
	const k = getKernel();
	let base = $state<WindowBase>("child");
	let focus = $state<FocusPolicy>("lock");
	let onBlocked = $state<BlockedEffect[]>(["bell", "shake"]);
	let alwaysOnTop = $state(false);
	let skipTaskbar = $state(true);
	let cssShadow = $state(false);
	let web = $state<WebPresentation>("modal");
	let log = $state<string[]>([]);
	const spec = $derived<WindowKindSpec>({ kind: "lab.child", base, view: "fanwit.labExport", title: "Export", parent: "opener", focus, onBlocked, alwaysOnTop, skipTaskbar, shadow: cssShadow ? "css" : true, web, instance: "multiple" });
	const code = $derived(`defineWindowKind(${JSON.stringify({ ...spec, view: undefined }, null, 2).replace(/"(\w+)":/g, "$1:")});`);
	const wayland = k.host.platform === "linux";
	const add = (m: string) => (log = [`${new Date().toLocaleTimeString(undefined, { hour12: false })} ${m}`, ...log].slice(0, 30));

	async function open() {
		const reg = k.sys.windows.register(spec, "fanwit.labs");
		const t0 = performance.now();
		try {
			const w = await k.sys.windows.open(spec.kind, { format: "png" });
			add(`open ${w.label} (${Math.round(performance.now() - t0)} ms)`);
			const r = await w.result;
			add(`close ${w.label} result=${JSON.stringify(r)}`);
		} catch (e) {
			k.sys.notify.error(e);
		} finally {
			reg.dispose();
		}
	}
	const toggle = (e: BlockedEffect) => (onBlocked = onBlocked.includes(e) ? onBlocked.filter((x) => x !== e) : [...onBlocked, e]);
</script>

<div class="grid h-full min-h-0 grid-cols-[minmax(260px,320px)_1fr] gap-0 text-[13px]">
	<div class="flex flex-col gap-4 overflow-auto border-r border-border p-4">
		<label class="flex flex-col gap-1"><span class="fw-section-title px-0">Kind</span>
			<select class="fw-input" bind:value={base}>{#each ["aux", "child", "panel", "sheet", "palette", "splash", "tray"] as b (b)}<option value={b}>{b}</option>{/each}</select>
		</label>
		<div><div class="fw-section-title px-0">Focus policy</div>
			<div role="radiogroup" class="flex rounded-md border border-border p-0.5 text-xs">{#each ["none", "takeover", "lock"] as f (f)}<button role="radio" aria-checked={focus === f} class="h-7 flex-1 rounded {focus === f ? 'bg-accent' : ''}" onclick={() => (focus = f as FocusPolicy)}>{f}</button>{/each}</div>
		</div>
		<div><div class="fw-section-title px-0">On blocked</div>
			<div class="flex flex-wrap gap-2">
				{#each ["bell", "shake", "flash", "attention"] as e (e)}
					<label class="flex items-center gap-1" title={e === "shake" && wayland ? "Wayland clients cannot move their windows: the shadow shake (css) is used" : ""}><input type="checkbox" checked={onBlocked.includes(e as BlockedEffect)} onchange={() => toggle(e as BlockedEffect)} />{e}</label>
				{/each}
			</div>
		</div>
		<div><div class="fw-section-title px-0">Options</div>
			<label class="flex items-center gap-2"><input type="checkbox" bind:checked={alwaysOnTop} />Always on top</label>
			<label class="flex items-center gap-2"><input type="checkbox" bind:checked={skipTaskbar} />Skip taskbar</label>
			<label class="flex items-center gap-2"><input type="checkbox" bind:checked={cssShadow} />Shadow drawn in page (css)</label>
		</div>
		<label class="flex flex-col gap-1"><span class="fw-section-title px-0">Web presentation</span>
			<select class="fw-input" bind:value={web}>{#each ["virtual", "modal", "popup", "tab", "pip"] as w (w)}<option value={w}>{w}</option>{/each}</select>
		</label>
		<div class="flex gap-2"><button class="fw-btn fw-btn-primary" onclick={open}><Icon name="app-window" size={13} />Open window</button><button class="fw-btn" onclick={() => { void navigator.clipboard.writeText(code); k.sys.notify.toast("Spec copied", "success"); }}>Copy spec</button></div>
		<p class="text-xs text-muted-foreground">With focus = "lock", click this window while the child is open: the parent is disabled and veiled, and the child bells and shakes.</p>
	</div>
	<div class="flex min-h-0 flex-col">
		<div class="fw-section-title">Generated spec</div>
		<pre class="selectable mx-3 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{code}</pre>
		<div class="fw-section-title">Event log</div>
		<div class="mx-3 min-h-0 flex-1 overflow-auto font-mono text-xs">{#each log as l, i (i)}<div>{l}</div>{:else}<span class="text-muted-foreground">Open a window to see its lifecycle.</span>{/each}</div>
	</div>
</div>
