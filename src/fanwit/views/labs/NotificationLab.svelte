<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import type { NotificationSpec } from "../../notify/notify.svelte";

	/** Notification Lab: send every kind through every route and copy the call. */
	const k = getKernel();
	let spec = $state<NotificationSpec>({ title: "Export finished", body: "**report.pdf** saved", kind: "success", priority: "normal", route: "auto", channel: "default" });
	let withAction = $state(true);
	const final = $derived<NotificationSpec>({ ...spec, actions: withAction ? [{ label: "Open", command: "palette.open" }] : undefined });
	const code = $derived(`ctx.notify.send(${JSON.stringify(final, null, 2)});`);
	async function progress() {
		const p = k.sys.notify.progress({ title: "Indexing vault", cancellable: true });
		for (let i = 1; i <= 40; i++) {
			if (p.signal.aborted) return p.fail(new Error("Cancelled"));
			await new Promise((r) => setTimeout(r, 100));
			p.report(i / 40, `${i * 30} of 1,200 notes`);
		}
		p.done("Indexed 1,200 notes");
	}
</script>

<div class="grid h-full min-h-0 grid-cols-[320px_1fr] text-[13px]">
	<form class="flex flex-col gap-3 overflow-auto border-r border-border p-4" onsubmit={(e) => { e.preventDefault(); k.sys.notify.send(final); }}>
		<label class="flex flex-col gap-1">Title<input class="fw-input" bind:value={spec.title} /></label>
		<label class="flex flex-col gap-1">Body (Markdown subset)<input class="fw-input" bind:value={spec.body} /></label>
		{#each [["kind", ["info", "success", "warning", "error"]], ["priority", ["low", "normal", "high", "urgent"]], ["route", ["auto", "toast", "os", "center", "toast+os"]]] as [field, opts] (field)}
			<label class="flex flex-col gap-1 capitalize">{field}
				<select class="fw-input" value={(spec as unknown as Record<string, unknown>)[field as string]} onchange={(e) => ((spec as unknown as Record<string, unknown>)[field as string] = (e.currentTarget as HTMLSelectElement).value)}>
					{#each opts as o (o)}<option value={o}>{o}</option>{/each}
				</select>
			</label>
		{/each}
		<label class="flex items-center gap-2"><input type="checkbox" bind:checked={withAction} />Action button (runs a command)</label>
		<div class="flex flex-wrap gap-2">
			<button class="fw-btn fw-btn-primary" type="submit">Send</button>
			<button class="fw-btn" type="button" onclick={() => { for (let i = 0; i < 3; i++) k.sys.notify.send({ title: "Duplicate", body: "Collapses with a counter" }); }}>Send duplicates</button>
			<button class="fw-btn" type="button" onclick={progress}>Progress</button>
			<button class="fw-btn" type="button" onclick={() => k.sys.notify.error(new Error("Could not save note. The disk is full."))}>Error</button>
			<button class="fw-btn" type="button" onclick={() => setTimeout(() => k.sys.notify.send({ ...final, title: "Sent while unfocused" }), 3000)}>Send in 3 s (switch away)</button>
			<button class="fw-btn" type="button" onclick={async () => k.sys.notify.toast((await k.host.notify.requestPermission()) ? "OS notifications allowed" : "OS notifications denied")}>Allow OS notifications</button>
		</div>
	</form>
	<div class="p-4">
		<div class="fw-section-title px-0">Code</div>
		<pre class="selectable overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{code}</pre>
		<p class="mt-3 text-xs text-muted-foreground">Auto routing: Do not disturb sends to the centre (urgent still reaches the OS); a focused window shows a toast; otherwise an OS notification plus the centre, with attention for high priority.</p>
	</div>
</div>
