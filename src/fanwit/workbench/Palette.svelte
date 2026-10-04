<script lang="ts">
	import { tick } from "svelte";
	import { getKernel, useT } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import KeyChip from "./KeyChip.svelte";
	import { enter, leave } from "../motion/motion";

	/**
	 * Command palette (Figure 17.5): input with mode prefix, ranked rows with matched characters
	 * bold, key chips, disabled rows with their reason, footer hints, and prompt steps generated
	 * from a command's argument schema.
	 */
	const k = getKernel();
	const t = useT();
	const p = k.sys.palette;
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLDivElement>();

	$effect(() => {
		if (p.visible) tick().then(() => input?.focus());
	});
	$effect(() => {
		const i = p.selected;
		list?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: "nearest" });
	});

	function keys(e: KeyboardEvent) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			p.selected = Math.min(p.items.length - 1, p.selected + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			p.selected = Math.max(0, p.selected - 1);
		} else if (e.key === "PageDown") {
			e.preventDefault();
			p.selected = Math.min(p.items.length - 1, p.selected + 10);
		} else if (e.key === "PageUp") {
			e.preventDefault();
			p.selected = Math.max(0, p.selected - 10);
		} else if (e.key === "Enter") {
			e.preventDefault();
			void p.accept(p.selected, e.ctrlKey || e.metaKey);
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			p.close();
		} else if (e.key === "Backspace" && p.prompt && !p.query && p.prompt.index > 0) {
			e.preventDefault();
			p.back();
		} else if (e.key === "Backspace" && !p.prompt && p.query.length === 1 && p.mode?.prefix) {
			// backspace on an empty mode input leaves the mode
			e.preventDefault();
			p.setQuery("");
		}
	}

	function highlight(label: string, positions?: number[]) {
		if (!positions?.length) return [{ t: label, b: false }];
		const set = new Set(positions);
		const out: { t: string; b: boolean }[] = [];
		for (let i = 0; i < label.length; i++) {
			const b = set.has(i);
			if (out.length && out[out.length - 1].b === b) out[out.length - 1].t += label[i];
			else out.push({ t: label[i], b });
		}
		return out;
	}
	const MODES = [
		[">", "commands"],
		["@", "symbols"],
		[":", "go to"],
		["#", "tags"],
		["~", "windows"],
		["?", "help"]
	];
</script>

{#if p.visible}
	<div class="fixed inset-0 z-[90]" role="presentation" out:leave onpointerdown={(e) => e.target === e.currentTarget && p.close()}>
		<div role="dialog" aria-modal="true" aria-label={t("ui.palette.label", "Command palette")} use:enter={{ preset: "drop", origin: "top center" }} out:leave={{ preset: "pop" }} class="mx-auto mt-[8vh] flex max-h-[70vh] w-[min(640px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
			{#if p.prompt}
				<div class="flex items-center gap-2 border-b border-border px-3 pt-2 pb-1 text-xs text-muted-foreground">
					<Icon name="square-terminal" size={13} />
					<span class="font-medium text-foreground">{p.prompt.title}</span>
					<span>· {p.step?.title} ({p.prompt.index + 1} of {p.prompt.steps.length})</span>
				</div>
			{/if}
			<div class="flex items-center gap-2 px-3">
				<Icon name={p.prompt ? "corner-down-right" : "search"} size={15} class="text-muted-foreground" />
				<input
					bind:this={input}
					class="h-11 flex-1 bg-transparent text-sm outline-none"
					placeholder={p.prompt ? (p.step?.spec.description ?? t("ui.palette.valueFor", "Value for {name}", { name: p.step?.title ?? "" })) : p.mode?.placeholder ? t(`ui.palette.placeholder.${p.mode.title}`, p.mode.placeholder) : t("ui.palette.placeholder", "Type a file name, or > for commands, ? for help")}
					value={p.query}
					oninput={(e) => p.setQuery((e.currentTarget as HTMLInputElement).value)}
					onkeydown={keys}
					role="combobox"
					aria-expanded="true"
					aria-controls="fw-palette-list"
					aria-activedescendant={p.items[p.selected] ? `fw-pal-${p.selected}` : undefined}
					aria-autocomplete="list"
					spellcheck="false"
				/>
				{#if p.loading}<Icon name="loader-circle" size={14} class="animate-spin text-muted-foreground" />{/if}
			</div>
			<div bind:this={list} id="fw-palette-list" role="listbox" class="min-h-0 flex-1 overflow-y-auto border-t border-border p-1">
				{#each p.items as it, i (it.id + i)}
					<div
						id="fw-pal-{i}"
						role="option"
						tabindex="-1"
						aria-selected={i === p.selected}
						aria-disabled={!!it.disabled}
						data-index={i}
						class="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] {i === p.selected ? 'bg-accent text-accent-foreground' : ''} {it.disabled ? 'opacity-55' : ''}"
						onpointermove={() => (p.selected = i)}
						onclick={(e) => p.accept(i, e.ctrlKey || e.metaKey)}
						onkeydown={() => {}}
					>
						<Icon name={it.icon ?? "dot"} size={15} class="shrink-0 opacity-70" />
						<div class="flex min-w-0 flex-1 flex-col">
							<div class="truncate">
								{#if it.category}<span class="text-muted-foreground">{it.category}: </span>{/if}
								{#each highlight(it.label, it.positions) as part, j (j)}{#if part.b}<b class="font-semibold text-foreground">{part.t}</b>{:else}{part.t}{/if}{/each}
							</div>
							{#if it.disabled}
								<div class="truncate text-[11px] text-muted-foreground">Unavailable here: {it.disabled} is false</div>
							{:else if it.description}
								<div class="truncate text-[11px] text-muted-foreground">{it.description}</div>
							{/if}
						</div>
						{#if it.detail}<span class="shrink-0 text-[11px] text-muted-foreground">{it.detail}</span>{/if}
						<KeyChip keys={it.keys} />
					</div>
				{:else}
					<div class="px-3 py-6 text-center text-xs text-muted-foreground">{p.loading ? t("ui.palette.searching", "Searching…") : p.prompt ? t("ui.palette.typeValue", "Type a value and press Enter") : t("ui.palette.noResults", "No results")}</div>
				{/each}
			</div>
			<div class="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
				{#if p.prompt}
					<span>{t("ui.palette.promptHelp", "Enter to continue · Backspace on empty input goes back · Esc cancels")}</span>
				{:else}
					<span>{p.mode?.prefix === ">" ? t("ui.palette.recentFirst", "recently used first") : p.mode?.title ? t(`ui.palette.mode.${p.mode.title}`, p.mode.title) : ""}</span>
					<span class="flex-1"></span>
					{#each MODES as [pre, name] (pre)}
						<button class="hover:text-foreground" onclick={() => p.setQuery(pre)}><b>{pre}</b> {t(`ui.palette.prefix.${name}`, name)}</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}
