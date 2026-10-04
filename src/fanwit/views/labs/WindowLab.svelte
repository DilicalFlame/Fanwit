<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import { DEFAULTS, resolveSpec, windowOptions, type BlockedEffect, type FocusPolicy, type OptionNote, type WebPresentation, type WindowBase, type WindowKindSpec } from "../../windows/windows.svelte";

	/**
	 * Window Lab (Figure 17.18): try every window option and copy the resulting kind spec. Options
	 * that do nothing for this kind on this platform are greyed with the reason.
	 */
	const k = getKernel();
	const native = k.host.caps.nativeWindows;
	const platform = k.host.platform;
	const KINDS: { base: WindowBase; about: string }[] = [
		{ base: "child", about: "A dialog owned by the window that opened it: stays above it, closes with it, and locks it by default." },
		{ base: "sheet", about: "A child dialog with a fixed size: confirmations and short forms." },
		{ base: "panel", about: "A tool window that floats above everything, never takes focus, and remembers its place." },
		{ base: "palette", about: "Quick input that opens at the pointer, takes focus and floats above everything." },
		{ base: "aux", about: "An independent window with its own taskbar button, owned by nobody: settings, manual, pop outs." },
		{ base: "splash", about: "No title bar, centred on the screen: startup and loading screens." },
		{ base: "tray", about: "A popover beside the tray icon (it opens at the pointer), floating above everything." }
	];
	const WEB: { id: WebPresentation; about: string }[] = [
		{ id: "virtual", about: "a card inside the page" },
		{ id: "modal", about: "a dialog over a blocked page" },
		{ id: "popup", about: "a separate browser window" },
		{ id: "tab", about: "a new browser tab" },
		{ id: "pip", about: "Picture-in-Picture, stays on top" }
	];
	const EFFECTS: BlockedEffect[] = ["bell", "shake", "flash", "attention"];
	const WINDOW_OPTS = [
		["alwaysOnTop", "Always on top"],
		["skipTaskbar", "Skip taskbar"],
		["cssShadow", "Shadow drawn in the page (css)"]
	] as const;

	let base = $state<WindowBase>("child");
	let focus = $state<FocusPolicy>("lock");
	let onBlocked = $state<BlockedEffect[]>(["bell", "shake"]);
	let opts = $state({ alwaysOnTop: false, skipTaskbar: true, cssShadow: false });
	let web = $state<WebPresentation>("modal");
	let log = $state<string[]>([]);
	const spec = $derived<WindowKindSpec>({
		kind: "lab.child",
		base,
		view: "fanwit.labExport",
		title: "Export",
		parent: "opener",
		focus,
		onBlocked,
		alwaysOnTop: opts.alwaysOnTop,
		skipTaskbar: opts.skipTaskbar,
		shadow: opts.cssShadow ? "css" : true,
		web,
		instance: "multiple"
	});
	const notes = $derived(windowOptions(resolveSpec(spec), { native, platform, pip: typeof window !== "undefined" && "documentPictureInPicture" in window }));
	const code = $derived(`defineWindowKind(${JSON.stringify({ ...spec, view: undefined }, null, 2).replace(/"(\w+)":/g, "$1:")});`);
	const add = (m: string) => (log = [`${new Date().toLocaleTimeString(undefined, { hour12: false })} ${m}`, ...log].slice(0, 30));

	/** Picking a kind starts from that kind's defaults; the controls then override them. */
	function pickBase(b: WindowBase) {
		base = b;
		const d = DEFAULTS[b];
		focus = d.focus ?? "none";
		onBlocked = d.onBlocked ?? (d.focus === "lock" ? ["bell", "shake"] : []);
		opts = { alwaysOnTop: !!d.alwaysOnTop, skipTaskbar: !!d.skipTaskbar, cssShadow: false };
		web = d.web ?? "virtual";
	}
	const toggle = (e: BlockedEffect) => (onBlocked = onBlocked.includes(e) ? onBlocked.filter((x) => x !== e) : [...onBlocked, e]);

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
</script>

{#snippet why(n: OptionNote)}
	{#if !n.ok}<p class="mt-1 text-[11px] leading-snug text-muted-foreground">{n.why}</p>{/if}
{/snippet}

<div class="grid h-full min-h-0 grid-cols-[minmax(280px,340px)_1fr] text-[13px] max-md:grid-cols-1">
	<div class="flex min-h-0 flex-col gap-5 overflow-auto border-r border-border p-4 max-md:border-r-0 max-md:border-b">
		<div class="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs">
			<Icon name={native ? "monitor" : "globe"} size={13} />
			<span>Testing on <b>{native ? `desktop (${platform})` : "the web"}</b>. Greyed options do nothing here.</span>
		</div>

		<section>
			<label class="flex flex-col gap-1"><span class="fw-section-title px-0">Kind</span>
				<select class="fw-input" value={base} onchange={(e) => pickBase(e.currentTarget.value as WindowBase)}>
					{#each KINDS as kd (kd.base)}<option value={kd.base}>{kd.base}</option>{/each}
				</select>
			</label>
			<p class="mt-1 text-xs text-muted-foreground">{KINDS.find((kd) => kd.base === base)?.about} Picking a kind loads its defaults.</p>
		</section>

		<section class:opacity-50={!notes.focus.ok}>
			<div class="fw-section-title px-0">Focus when it opens</div>
			<div role="radiogroup" aria-label="Focus policy" class="flex rounded-md border border-border p-0.5 text-xs">
				{#each [["none", "Keep focus"], ["takeover", "Take focus"], ["lock", "Lock parent"]] as [f, label] (f)}
					{@const off = !notes.focus.ok || (f === "lock" && !notes.lock.ok)}
					<button role="radio" aria-checked={focus === f} disabled={off} class="h-7 flex-1 rounded disabled:cursor-not-allowed disabled:opacity-50 {focus === f ? 'bg-accent' : ''}" onclick={() => (focus = f as FocusPolicy)}>{label}</button>
				{/each}
			</div>
			{@render why(notes.focus.ok ? notes.lock : notes.focus)}
		</section>

		<section class:opacity-50={!notes.onBlocked.ok}>
			<div class="fw-section-title px-0">When the locked parent is clicked</div>
			<div class="flex flex-wrap gap-x-3 gap-y-1">
				{#each EFFECTS as e (e)}
					<label class="flex items-center gap-1" title={e === "shake" && platform === "linux" ? "Wayland clients cannot move their windows: the page content shakes instead" : undefined}>
						<input type="checkbox" disabled={!notes.onBlocked.ok} checked={onBlocked.includes(e)} onchange={() => toggle(e)} />{e}
					</label>
				{/each}
			</div>
			{@render why(notes.onBlocked)}
		</section>

		<section>
			<div class="fw-section-title px-0">Window</div>
			<div class="flex flex-col gap-2">
				{#each WINDOW_OPTS as [key, label] (key)}
					<div class:opacity-50={!notes[key].ok}>
						<label class="flex items-center gap-2"><input type="checkbox" disabled={!notes[key].ok} bind:checked={opts[key]} />{label}</label>
						{@render why(notes[key])}
					</div>
				{/each}
			</div>
		</section>

		<section class:opacity-50={!notes.web.ok && native}>
			<label class="flex flex-col gap-1"><span class="fw-section-title px-0">Web presentation</span>
				<select class="fw-input" disabled={native} bind:value={web}>{#each WEB as w (w.id)}<option value={w.id}>{w.id}: {w.about}</option>{/each}</select>
			</label>
			{@render why(notes.web)}
		</section>

		<div class="flex gap-2">
			<button class="fw-btn fw-btn-primary" onclick={open}><Icon name="app-window" size={13} />Open window</button>
			<button class="fw-btn" onclick={() => { void navigator.clipboard.writeText(code); k.sys.notify.toast("Spec copied", "success"); }}>Copy spec</button>
		</div>
		{#if notes.onBlocked.ok}
			<p class="text-xs text-muted-foreground">Click this window while the child is open: it stays blocked and the child plays the effects above.</p>
		{/if}
	</div>
	<div class="flex min-h-0 flex-col">
		<div class="fw-section-title">Generated spec</div>
		<pre class="selectable mx-3 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{code}</pre>
		<div class="fw-section-title">Event log</div>
		<div class="mx-3 min-h-0 flex-1 overflow-auto font-mono text-xs">{#each log as l, i (i)}<div>{l}</div>{:else}<span class="text-muted-foreground">Open a window to see its lifecycle.</span>{/each}</div>
	</div>
</div>
