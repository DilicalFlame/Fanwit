<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { joinPath } from "../../host/types";

	/**
	 * `<LiveToml file="settings" />`: the app's own TOML file as it is right now, refreshed while
	 * you read, with changed lines flashing. Change a setting or a key and watch the file follow:
	 * state is data.
	 */
	let { file }: { file: "settings" | "keys" | "menus" | "workspace" } = $props();
	const k = getKernel();
	const path = $derived(joinPath(file === "workspace" ? k.host.dirs.data : k.host.dirs.config, `${file}.toml`));
	let text = $state<string | null>(null);
	let changed = $state(new Set<number>());

	$effect(() => {
		const p = path;
		let stop = false;
		let prev: string[] = [];
		const read = async () => {
			if (document.visibilityState !== "visible") return;
			const t = await k.host.fs.readText(p).catch(() => null);
			if (stop || t === text) return;
			const next = (t ?? "").split("\n");
			if (text !== null) changed = new Set(next.flatMap((l, i) => (l !== prev[i] ? [i] : [])));
			prev = next;
			text = t;
		};
		void read();
		// ponytail: a 1.5 s poll while the page is open; a file watch would need the host's watcher
		const iv = setInterval(read, 1500);
		return () => {
			stop = true;
			clearInterval(iv);
		};
	});
</script>

<figure class="fw-live-toml fw-widget">
	<figcaption><span class="fw-live-dot" aria-hidden="true"></span>{path}</figcaption>
	{#if text === null}
		<p class="fw-live-empty">Not created yet. Change something (a setting, a key) and it appears here.</p>
	{:else}
		<pre><code>{#each text.split("\n") as l, i (i)}<span class:flash={changed.has(i)}>{l}{"\n"}</span>{/each}</code></pre>
	{/if}
</figure>
