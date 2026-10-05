<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { useWindow } from "../../windows/windows.svelte";

	/** Crash report (Figure 17.20 #3): shown on the next launch; reporting is opt in. */
	let { props }: { props: { message?: string; time?: string; source?: string } } = $props();
	const k = getKernel();
	let self: ReturnType<typeof useWindow> | null = null;
	try {
		self = useWindow();
	} catch {
		self = null;
	}
	/** Restart with code plugins off for one session: the plugins module reads and clears the marker. */
	async function startSafe() {
		await k.sys.storage.set("fanwit", "safeModeOnce", true);
		await k.sys.storage.flush();
		await k.host.relaunch();
	}
	const details = $derived(`${props.time ?? new Date().toISOString()} ${props.source ?? "app"}\n${props.message ?? "Unknown error"}`);
</script>

<div class="flex h-full flex-col gap-3 p-6">
	<h1 class="text-lg font-semibold">Sorry about that</h1>
	<p class="text-sm text-muted-foreground">The app closed unexpectedly. Your layout was restored. The log and crash details stay on this computer unless you send them.</p>
	<pre class="selectable max-h-32 overflow-auto rounded bg-muted p-2 text-[11px]">{details}</pre>
	<div class="mt-auto flex flex-wrap justify-end gap-2">
		<button class="fw-btn" onclick={startSafe}>Start in safe mode</button>
		<button class="fw-btn" onclick={() => navigator.clipboard.writeText(details)}>Copy details</button>
		<button class="fw-btn" disabled={!k.sys.settings.get("update.crashReports")} title="Enable crash report sharing in Settings, Privacy">Send report</button>
		<button class="fw-btn fw-btn-primary" onclick={() => self?.close()}>Continue</button>
	</div>
</div>
