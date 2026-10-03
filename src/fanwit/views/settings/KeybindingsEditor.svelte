<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel, menu } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import KeyChip from "../../workbench/KeyChip.svelte";
	import type { Keybinding, ResolvedBinding } from "../../keys/keybindings.svelte";

	/**
	 * Keyboard Shortcuts editor (Figure 17.9): search by text, @source:user, @conflict, @unbound
	 * or recorded keys; double click a row to record; conflict banner with Keep both / Replace.
	 */
	const k = getKernel();
	let q = $state("");
	let recordFilter = $state<string | null>(null);
	let recordingFor = $state<string | null>(null);
	let recorded = $state<string[]>([]);
	let pending = $state<{ command: string; key: string; conflicts: ResolvedBinding[] } | null>(null);

	const rows = $derived.by(() => {
		void k.keys.version;
		const eff = k.keys.effective();
		const cmds = k.commands.list().filter((c) => c.def.palette !== false);
		return cmds
			.map((c) => {
				const bindings = eff.filter((b) => b.command === c.def.id);
				return { id: c.def.id, title: c.def.title, category: c.def.category, bindings };
			})
			.filter((r) => {
				if (recordFilter) return r.bindings.some((b) => b.steps.join(" ") === recordFilter);
				for (const tok of q.split(/\s+/).filter(Boolean)) {
					if (tok === "@unbound") {
						if (r.bindings.length) return false;
					} else if (tok === "@conflict") {
						if (!r.bindings.some((b) => k.keys.conflicts(b.steps, b).length)) return false;
					} else if (tok.startsWith("@source:")) {
						if (!r.bindings.some((b) => b.source === tok.slice(8))) return false;
					} else if (!`${r.title} ${r.id} ${r.category ?? ""} ${r.bindings.map((b) => k.keys.format(b.steps).join(" ")).join(" ")}`.toLowerCase().includes(tok.toLowerCase())) return false;
				}
				return true;
			})
			.sort((a, b) => a.title.localeCompare(b.title));
	});

	function writeUser(list: Keybinding[]) {
		const f = k.sys.keysFile!;
		f.set({ ...f.value, bind: list });
		void f.flush().then(() => k.events.emit("fw:user-keys" as never, {} as never));
	}

	function startRecording(command: string | null) {
		recordingFor = command;
		recorded = [];
		k.keys.recorder = (step) => {
			if (step === "escape" && !recorded.length) return stopRecording();
			recorded = [...recorded, step];
			if (recorded.length >= 2 || !/^(ctrl|meta)\+k$/.test(step)) finishSoon();
		};
	}
	let t: ReturnType<typeof setTimeout>;
	function finishSoon() {
		clearTimeout(t);
		t = setTimeout(() => {
			const key = recorded.join(" ");
			const cmd = recordingFor;
			stopRecording();
			if (!cmd) {
				recordFilter = key;
				return;
			}
			const conflicts = k.keys.conflicts(recorded.length ? key.split(" ") : []).filter((b) => b.command !== cmd);
			if (conflicts.length) pending = { command: cmd, key, conflicts };
			else commit(cmd, key, false);
		}, 700);
	}
	function stopRecording() {
		k.keys.recorder = null;
		recordingFor = null;
	}
	onDestroy(stopRecording);

	function commit(command: string, key: string, replace: boolean) {
		const user = k.keys.userBindings().filter((b) => b.command !== command);
		const next: Keybinding[] = [...user, { key, command }];
		// replacing removes the colliding bindings for this key
		if (replace && pending) for (const c of pending.conflicts) next.push({ key, command: `-${c.command}` });
		// a user binding for a command removes its default ones
		for (const b of k.keys.effective().filter((x) => x.command === command && x.source !== "user")) next.push({ key: b.key, command: `-${command}` });
		writeUser(next);
		pending = null;
	}
	function reset(command: string) {
		writeUser(k.keys.userBindings().filter((b) => b.command !== command && b.command !== `-${command}`));
	}
	function remove(command: string) {
		writeUser([...k.keys.userBindings().filter((b) => b.command !== command), { key: "", command: `-${command}` }]);
	}
	function changeWhen(r: { id: string; bindings: ResolvedBinding[] }) {
		const b = r.bindings[0];
		if (!b) return;
		const when = prompt(`When clause for ${r.id}`, b.when ?? "");
		if (when === null) return;
		writeUser([...k.keys.userBindings().filter((x) => x.command !== r.id), { key: b.key, command: r.id, when: when || undefined }, ...(b.source !== "user" ? [{ key: b.key, command: `-${r.id}` }] : [])]);
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-2">
		<h1 class="text-lg font-semibold">Keyboard Shortcuts</h1>
		<span class="flex-1"></span>
		<button class="fw-btn h-7" onclick={() => k.commands.run("layout.openView", { view: "fanwit.tomlEditor", props: { file: "keys" } })}><Icon name="file-code" size={13} />Show keys.toml</button>
	</div>
	<div class="flex items-center gap-2">
		<input class="fw-input" placeholder="Type to search, @source:user @conflict @unbound, or record keys" aria-label="Search keybindings" bind:value={q} oninput={() => (recordFilter = null)} />
		<button class="fw-btn {recordingFor === null && k.keys.recorder ? 'fw-btn-primary' : ''}" onclick={() => (k.keys.recorder ? stopRecording() : startRecording(null))}><Icon name="circle-dot" size={13} />{recordFilter ? k.keys.format(recordFilter.split(" ")).join(" ") : "Record"}</button>
		{#if recordFilter}<button class="fw-icon-btn" aria-label="Clear recorded filter" onclick={() => (recordFilter = null)}><Icon name="x" size={14} /></button>{/if}
	</div>

	{#if pending}
		<div role="alert" class="flex flex-wrap items-center gap-2 rounded-md border border-warning bg-warning-muted p-2 text-xs">
			<Icon name="triangle-alert" size={14} class="text-warning" />
			<span class="flex-1">
				<b>{k.keys.format(pending.key.split(" ")).join(" ")}</b> is also bound to
				{#each pending.conflicts as c, i (i)}{i ? ", " : ""}<b>{k.commands.label(c.command)}</b>{c.when ? ` when ${c.when}` : ""}{/each}.
			</span>
			<button class="fw-btn h-6" onclick={() => commit(pending!.command, pending!.key, false)}>Keep both</button>
			<button class="fw-btn fw-btn-primary h-6" onclick={() => commit(pending!.command, pending!.key, true)}>Replace</button>
			<button class="fw-btn h-6" onclick={() => (pending = null)}>Cancel</button>
		</div>
	{/if}

	<table class="w-full text-xs">
		<thead class="text-left text-muted-foreground">
			<tr><th class="py-1 font-medium">Command</th><th class="font-medium">Keybinding</th><th class="font-medium">When</th><th class="font-medium">Source</th></tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				<tr
					class="border-t border-border/60 hover:bg-accent/40"
					ondblclick={() => startRecording(r.id)}
					use:menu={{ location: "keys/row", target: { command: r.id } }}
				>
					<td class="py-1.5 pr-2"><div>{r.title}</div><div class="font-mono text-[10.5px] text-muted-foreground">{r.id}</div></td>
					<td class="pr-2">
						{#if recordingFor === r.id}
							<span class="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">Press keys: {recorded.length ? k.keys.format(recorded).join(" ") : "…"} (Esc cancels)</span>
						{:else}
							{#each r.bindings as b, i (i)}<div class="flex items-center gap-1"><KeyChip keys={k.keys.format(b.steps)} />{#if b.global}<span class="text-[10px] text-info">global</span>{/if}{#if b.globalError}<span class="text-[10px] text-destructive" title={b.globalError}>failed</span>{/if}</div>{:else}<span class="text-muted-foreground">–</span>{/each}
						{/if}
					</td>
					<td class="pr-2 font-mono text-[10.5px] text-muted-foreground">{r.bindings[0]?.when ?? ""}</td>
					<td class="text-muted-foreground">
						<span>{r.bindings[0]?.source === "module" || r.bindings[0]?.source === "plugin" ? r.bindings[0].owner : (r.bindings[0]?.source ?? "")}</span>
						<span class="ml-1 inline-flex gap-0.5">
							<button class="fw-icon-btn size-5" title="Change keybinding" aria-label="Change keybinding for {r.title}" onclick={() => startRecording(r.id)}><Icon name="pencil" size={12} /></button>
							<button class="fw-icon-btn size-5" title="Change when" aria-label="Change when clause" onclick={() => changeWhen(r)}><Icon name="braces" size={12} /></button>
							<button class="fw-icon-btn size-5" title="Copy as TOML" aria-label="Copy as TOML" onclick={() => navigator.clipboard.writeText(r.bindings.map((b) => `[[bind]]\nkey = ${JSON.stringify(b.key)}\ncommand = ${JSON.stringify(r.id)}${b.when ? `\nwhen = ${JSON.stringify(b.when)}` : ""}`).join("\n\n"))}><Icon name="copy" size={12} /></button>
							<button class="fw-icon-btn size-5" title="Reset to default" aria-label="Reset to default" onclick={() => reset(r.id)}><Icon name="rotate-ccw" size={12} /></button>
							<button class="fw-icon-btn size-5" title="Remove" aria-label="Remove keybinding" onclick={() => remove(r.id)}><Icon name="trash-2" size={12} /></button>
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
