<script lang="ts">
	import { onDestroy } from "svelte";
	import { getKernel, menu } from "$fanwit/ui.svelte";
	import { ctxkeys } from "$fanwit/kernel/context.svelte";
	import { viewNavigation } from "$fanwit/core/palette";
	import { render } from "$fanwit/manual/markdown";
	import ErrorCard from "$fanwit/workbench/ErrorCard.svelte";

	/**
	 * Sample Markdown editor: dirty tracking, Ctrl+S, inline preview toggle (Ctrl+E), headings as
	 * palette symbols (@) and line numbers for go to (:), notes:changed events for plugins.
	 */
	let { paneId, props }: { paneId: string | null; props: { path?: string } } = $props();
	const k = getKernel();
	const { vault, layout, notify, settings } = k.sys;
	let text = $state("");
	let base = $state("");
	let error = $state<unknown>(null);
	let loaded = $state(false);
	let preview = $state(false);
	let ta = $state<HTMLTextAreaElement>();
	const dirty = $derived(loaded && text !== base);
	const fontSize = $derived(settings.get<number>("notes.editor.fontSize") ?? 15);
	const wrap = $derived(settings.get<string>("notes.editor.wrap") ?? "soft");
	const wrapColumn = $derived(settings.get<number>("notes.editor.wrapColumn") ?? 80);

	async function load() {
		try {
			text = base = await vault.fs.readText(props.path!);
			loaded = true;
			error = null;
			k.events.emit("notes:opened" as never, { path: props.path } as never);
			k.events.emit("notes:changed" as never, { path: props.path, text } as never);
		} catch (e) {
			error = e;
		}
	}
	// only a new path or vault reloads: props is a fresh object after every layout change, and
	// reloading then would also throw away unsaved edits
	const path = $derived(props.path);
	const current = $derived(vault.current);
	$effect(() => {
		if (path && current) void load();
	});
	$effect(() => {
		if (paneId) layout.dirty[paneId] = dirty;
	});
	let t: ReturnType<typeof setTimeout>;
	function input() {
		clearTimeout(t);
		t = setTimeout(() => k.events.emit("notes:changed" as never, { path: props.path, text } as never), 300);
	}

	function reveal(line: number) {
		if (!ta) return;
		preview = false;
		const idx = text.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
		queueMicrotask(() => {
			ta!.focus();
			ta!.setSelectionRange(idx, idx);
			ta!.scrollTop = Math.max(0, (line - 4) * fontSize * 1.6);
		});
	}
	const subs = [
		k.events.on("editor:reveal" as never, (m: { path: string; line: number }) => m.path === props.path && reveal(m.line)),
		k.events.on("notes:togglePreview" as never, () => layout.activePane === paneId && (preview = !preview)),
		k.lifecycle.onWillShutdown((e) => dirty && e.veto(true, `${props.path} has unsaved changes`))
	];
	// svelte-ignore state_referenced_locally (a pane keeps its id for life)
	if (paneId) {
		viewNavigation.set(paneId, {
			symbols: (q) =>
				text
					.split("\n")
					.map((l, i) => ({ m: /^(#{1,6})\s+(.*)$/.exec(l), i }))
					.filter((x) => x.m && x.m[2].toLowerCase().includes(q.toLowerCase()))
					.map((x) => ({ id: String(x.i), label: x.m![2], icon: "heading", detail: `line ${x.i + 1}`, run: () => reveal(x.i + 1) })),
			goto: (q) => {
				const n = Number(q);
				return [{ id: "line", label: n ? `Go to line ${n}` : "Type a line number", icon: "corner-down-right", run: () => n && reveal(n) }];
			}
		});
	}
	onDestroy(() => {
		subs.forEach((s) => s.dispose());
		if (paneId) viewNavigation.delete(paneId);
		clearTimeout(t);
	});

	async function save() {
		if (vault.current?.readonly) return notify.toast("This vault is read only", "warning");
		const before = base;
		await vault.fs.write(props.path!, text);
		base = text;
		k.history.push({ label: `Save ${props.path}`, undo: async () => { await vault.fs.write(props.path!, before); text = base = before; } });
		k.events.emit("notes:saved" as never, { path: props.path, bytes: text.length } as never, { scope: "app" });
	}
	function keys(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === "s") {
			e.preventDefault();
			e.stopPropagation();
			void save();
		}
	}
</script>

{#if error}
	<ErrorCard {error} title="Could not open this note" reset={load} />
{:else}
	<div class="flex h-full min-h-0 flex-col" role="presentation" onkeydown={keys} use:ctxkeys={{ focusedView: "notes.editor", "resource.ext": "md", "resource.path": props.path, "editor.dirty": dirty }}>
		<div class="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-muted-foreground">
			<span class="truncate">{props.path}</span>
			{#if dirty}<span aria-label="unsaved">●</span>{/if}
			<span class="flex-1"></span>
			<button class="hover:text-foreground" onclick={() => (preview = !preview)}>{preview ? "Edit" : "Preview"}</button>
			<button class="hover:text-foreground" onclick={() => k.commands.run("notes.openPreview", { path: props.path })}>Preview to the side</button>
			<span>{text.trim().split(/\s+/).filter(Boolean).length} words</span>
		</div>
		{#if preview}
			<article class="fw-prose selectable min-h-0 flex-1 overflow-auto px-10 py-6">{@html render(text).html}</article>
		{:else}
			<textarea
				bind:this={ta}
				bind:value={text}
				oninput={input}
				readonly={vault.current?.readonly}
				aria-label="Note {props.path}"
				spellcheck="true"
				class="min-h-0 flex-1 resize-none bg-background px-10 py-6 font-mono outline-none"
				style:font-size="{fontSize}px"
				style:line-height="1.6"
				style:white-space={wrap === "off" ? "pre" : "pre-wrap"}
				style:max-width={wrap === "bounded" ? `calc(${wrapColumn}ch + 5rem)` : undefined}
				use:menu={{ location: "editor/context", target: { path: props.path } }}
			></textarea>
		{/if}
	</div>
{/if}
