<script lang="ts">
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import User from "@lucide/svelte/icons/user";
	import Users from "@lucide/svelte/icons/users";
	import { useInstaller } from "../installer.svelte";
	const inst = useInstaller();
	const info = inst.info!;
	const prompt = info.os === "windows" ? "Windows asks for administrator rights once" : info.os === "macos" ? "macOS asks for an administrator password once" : "You are asked for an administrator password once";
	const choices = [
		{ id: "user", icon: User, title: "Just me", text: "Installs into your user folder. No administrator rights needed." },
		{ id: "machine", icon: Users, title: "Everyone on this computer", text: info.admin ? "Installs for all users." : `Installs for all users. ${prompt}.` }
	];
</script>

<h1 class="text-xl font-semibold">Who is this for?</h1>
<p class="mt-1 text-sm text-muted-foreground">You can install {info.app.name} for yourself or for every account on this computer.</p>
<div class="mt-6 grid gap-3" role="radiogroup">
	{#each choices as c (c.id)}
		<button
			role="radio"
			aria-checked={inst.scope === c.id}
			class="flex items-start gap-4 rounded-lg border p-4 text-left transition-colors {inst.scope === c.id ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'}"
			onclick={() => inst.setScope(c.id)}
		>
			<c.icon class="mt-0.5 size-5 text-muted-foreground" />
			<span>
				<span class="block font-medium">{c.title}</span>
				<span class="block text-sm text-muted-foreground">{c.text}</span>
				<span class="mt-1 block font-mono text-xs text-muted-foreground">{info.installDirs[c.id]}</span>
			</span>
		</button>
	{/each}
</div>
{#if inst.scope === "machine" && !info.admin}
	<p class="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck class="size-4" /> Only the install itself runs with administrator rights; this window does not.</p>
{/if}
