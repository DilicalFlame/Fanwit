<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { identity } from "../../gen/identity";

	/**
	 * Update (Figure 17.20 #2). The template ships without an update endpoint; configure the
	 * Tauri updater (pubkey and endpoints) to enable downloads. Restart respects shutdown vetoes.
	 */
	const k = getKernel();
	const channel = $derived(k.sys.settings.get<string>("update.channel"));
</script>

<div class="flex h-full flex-col gap-3 p-6">
	<h1 class="text-lg font-semibold">{identity.name} {identity.version}</h1>
	<p class="text-sm text-muted-foreground">You are on the <b>{channel}</b> channel.</p>
	<div class="rounded-md border border-border bg-muted/40 p-3 text-xs">
		No update server is configured for this build. Add <code>plugins.updater</code> (public key and endpoints) to <code>tauri.conf.json</code> and register <code>tauri-plugin-updater</code> to enable automatic updates. See the manual, Operations.
	</div>
	<div class="mt-auto flex justify-end gap-2">
		<button class="fw-btn" onclick={() => k.commands.run("manual.open", { page: "operations" })}>Read how</button>
		<button class="fw-btn fw-btn-primary" onclick={() => k.commands.run("window.close")}>Close</button>
	</div>
</div>
