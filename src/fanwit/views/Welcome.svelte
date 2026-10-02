<script lang="ts">
	import { getKernel, menu } from "../ui.svelte";
	import Icon from "../icons/Icon.svelte";
	import KeyChip from "../workbench/KeyChip.svelte";
	import { identity } from "../gen/identity";

	/** Welcome view: first actions with their shortcuts, recent vaults and where to learn more. */
	const k = getKernel();
	const { vault, settings } = k.sys;
	const actions: [string, string, string][] = [
		["palette.open", "Show all commands", "square-terminal"],
		["palette.quickOpen", "Quick open", "search"],
		["vault.open", "Open folder as vault", "folder-open"],
		["vault.create", "Create new vault", "folder-plus"],
		["app.settings", "Settings", "settings"],
		["manual.open", "Read the manual", "book-open"]
	];
	const learn: [string, string, string, Record<string, unknown>][] = [
		["Layout Lab", "Edit workspace.toml live and watch the screen follow", "layout-dashboard", { view: "fanwit.layoutLab" }],
		["Window Lab", "Child windows that lock focus, panels, sheets", "app-window", { view: "fanwit.windowLab" }],
		["Menu Lab", "Colour swatches and sliders inside context menus", "list-tree", { view: "fanwit.menuLab" }],
		["Theme Studio", "Generate a theme from one colour", "swatch-book", { view: "fanwit.themeStudio" }]
	];
</script>

<div class="h-full overflow-y-auto">
	<div class="mx-auto flex max-w-4xl flex-col gap-8 px-8 py-10">
		<header class="flex items-center gap-4">
			<img src="/favicon.svg" alt="" class="size-12" />
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Welcome to {identity.name}</h1>
				<p class="text-sm text-muted-foreground">Fast And Natural Window In Tauri: a hackable template for desktop and web apps.</p>
			</div>
		</header>

		<div class="grid gap-8 md:grid-cols-2">
			<section aria-labelledby="start">
				<h2 id="start" class="fw-section-title px-0">Start</h2>
				<ul class="flex flex-col">
					{#each actions as [cmd, label, icon] (cmd)}
						<li>
							<button class="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-accent" onclick={() => k.commands.run(cmd, {}, { source: "toolbar" }).catch((e) => k.sys.notify.error(e))} use:menu={{ location: "workbench/empty" }}>
								<Icon name={icon} size={16} />
								<span class="flex-1">{label}</span>
								<KeyChip keys={k.keys.label(cmd)} />
							</button>
						</li>
					{/each}
				</ul>

				<h2 class="fw-section-title mt-4 px-0">Recent vaults</h2>
				{#if vault.recentList.length}
					<ul class="flex flex-col">
						{#each vault.recentList.slice(0, 6) as r (r.path)}
							<li>
								<button class="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent" onclick={() => vault.open(r.path).catch((e) => k.sys.notify.error(e))}>
									<span class="text-primary">{r.name}</span>
									<span class="truncate text-xs text-muted-foreground">{r.path}</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="px-2 text-sm text-muted-foreground">No vaults yet. Vaults are folders: your notes stay plain files you own.</p>
				{/if}
			</section>

			<section aria-labelledby="learn">
				<h2 id="learn" class="fw-section-title px-0">Explore the Labs</h2>
				<div class="flex flex-col gap-2">
					{#each learn as [title, desc, icon, args] (title)}
						<button class="flex items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent/60" onclick={() => k.commands.run("layout.openView", args).catch((e) => k.sys.notify.error(e))}>
							<Icon name={icon} size={18} class="mt-0.5 text-primary" />
							<span class="flex flex-col"><span class="text-sm font-medium">{title}</span><span class="text-xs text-muted-foreground">{desc}</span></span>
						</button>
					{/each}
				</div>
				<h2 class="fw-section-title mt-4 px-0">Everything is a command</h2>
				<p class="px-0 text-sm text-muted-foreground">
					Menus, shortcuts, the palette, toolbar buttons, the CLI and plugins all invoke the same commands. Right click anything; in developer mode every element offers <i>Edit this menu</i>.
				</p>
			</section>
		</div>

		<label class="flex items-center gap-2 text-xs text-muted-foreground">
			<input type="checkbox" checked={settings.get("general.startup.showWelcome")} onchange={(e) => settings.set("general.startup.showWelcome", (e.currentTarget as HTMLInputElement).checked)} />
			Show welcome page on startup
		</label>
	</div>
</div>
