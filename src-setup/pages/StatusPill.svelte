<script lang="ts">
	import type { Status, StepState } from "../installer.svelte";
	let { status }: { status: Status | StepState } = $props();
	const map: Record<string, [string, string]> = {
		satisfied: ["found", "bg-success-muted text-success"],
		ok: ["found", "bg-success-muted text-success"],
		done: ["done", "bg-success-muted text-success"],
		missing: ["will install", "bg-primary/10 text-primary"],
		outdated: ["will update", "bg-primary/10 text-primary"],
		deferred: ["later", "bg-muted text-muted-foreground"],
		blocked: ["blocked", "bg-destructive/15 text-destructive"],
		failed: ["failed", "bg-destructive/15 text-destructive"],
		pending: ["waiting", "bg-muted text-muted-foreground"],
		running: ["running", "bg-primary/10 text-primary"]
	};
	const m = $derived(map[status] ?? [status, "bg-muted"]);
</script>

<span class="rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap {m[1]}">{m[0]}</span>
