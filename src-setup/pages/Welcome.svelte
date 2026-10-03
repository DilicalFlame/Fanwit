<script lang="ts">
	import { useInstaller, size } from "../installer.svelte";
	const inst = useInstaller();
	const info = inst.info!;
	const total = info.components.reduce((n, c) => n + (c.size ? parseFloat(c.size) : 0), 0);
</script>

<div class="flex h-full flex-col justify-center pb-8">
	<p class="text-sm font-medium text-muted-foreground">Welcome</p>
	<h1 class="mt-1 text-3xl font-semibold tracking-tight">Install {info.app.name}</h1>
	<p class="mt-3 max-w-md text-muted-foreground">
		This will set up {info.app.name} {info.app.version} on this computer. You can choose what to install on the next pages; nothing changes until you press Install.
	</p>
	<dl class="mt-8 grid max-w-md grid-cols-2 gap-4 text-sm">
		<div class="rounded-lg border border-border p-3"><dt class="text-muted-foreground">Version</dt><dd class="mt-0.5 font-medium">{info.app.version}</dd></div>
		<div class="rounded-lg border border-border p-3">
			<dt class="text-muted-foreground">Size</dt>
			<dd class="mt-0.5 font-medium">{info.payload ? size(info.payload.size) : total ? `${total} MB` : "Native installer"}</dd>
		</div>
	</dl>
</div>
