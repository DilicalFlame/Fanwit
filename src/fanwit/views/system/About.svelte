<script lang="ts">
	import { asset } from "$app/paths";
	import { getKernel } from "../../ui.svelte";
	import type { AppInfo } from "../../host/types";
	import { identity } from "../../gen/identity";

	/** About (Figure 17.20 #1): versions, OS, Copy info, licences. */
	const k = getKernel();
	let info = $state<AppInfo | null>(null);
	let licences = $state(false);
	$effect(() => void k.host.app().then((i) => (info = i)));
	const DEPS = ["Tauri (MIT/Apache-2.0)", "Svelte (MIT)", "SvelteKit (MIT)", "shadcn-svelte (MIT)", "Bits UI (MIT)", "Tailwind CSS (MIT)", "Lucide (ISC)", "Valibot (MIT)", "smol-toml (BSD-3-Clause)", "toml_edit (MIT/Apache-2.0)", "rusqlite and SQLite (MIT, public domain)", "notify (CC0/MIT/Apache-2.0)", "interprocess (MIT/Apache-2.0)"];
</script>

<div class="flex h-full flex-col items-center gap-3 p-6 text-center">
	<img src={asset("/favicon.svg")} alt="" class="size-14" />
	<div class="text-lg font-semibold">{info?.name ?? identity.name} {info?.version ?? identity.version}</div>
	<div class="selectable text-xs text-muted-foreground">
		{#if info?.tauriVersion}Tauri {info.tauriVersion}{#if info.webview} · Webview {info.webview}{/if}<br />{:else}Web build<br />{/if}
		{info?.os} {info?.arch ?? ""}
	</div>
	<div class="mt-auto flex gap-2">
		<button class="fw-btn" onclick={() => (licences = !licences)}>Licences</button>
		<button class="fw-btn fw-btn-primary" onclick={() => k.commands.run("app.copySystemInfo")}>Copy info</button>
	</div>
	{#if licences}<ul class="max-h-40 overflow-auto text-left text-[11px] text-muted-foreground">{#each DEPS as d (d)}<li>{d}</li>{/each}</ul>{/if}
</div>
