<script lang="ts">
	import Diagram from "./Diagram.svelte";

	/** What happens between a key press (or a menu, the CLI, ...) and a command's handler (Section 5.2). */
	const steps = [
		{ title: "One entry point.", text: "Menus, keys, the palette, the CLI, deep links and plugins all end in the same call, commands.run(id, args). That is why a feature written once works from every surface." },
		{ title: "Resolve and activate.", text: "The id is looked up; renamed commands keep working through their aliases. If the owning module has not loaded yet, it is activated now, so modules cost nothing until used." },
		{ title: "Check when.", text: "The command's when clause is evaluated against the context keys. The same rule greys out its menu item, so what you can click and what can run never disagree." },
		{ title: "Arguments.", text: "Arguments are validated against the command's schema, and missing ones are asked for in the palette. One schema gives you validation, prompts and CLI flags. Commands marked as dangerous ask for confirmation here." },
		{ title: "Interceptors.", text: "Code registered with ctx.commands.intercept can inspect, change or cancel the call: logging, macros, guards." },
		{ title: "Handler.", text: "Only now does the handler run: plain code with typed arguments, unaware of where the call came from." },
		{ title: "History.", text: "If the handler returns an undo record, the call joins the undo history. The call is logged and added to recents, which order the palette." }
	];
	const sources = ["Menu", "Key", "Palette", "CLI", "Link", "Plugin"];
	const stages = ["Resolve", "When", "Args", "Intercept", "Handler", "History"];
</script>

<Diagram title="The command pipeline" {steps}>
	<svg viewBox="0 0 760 236" role="img" aria-label="Six input surfaces feed commands.run, which passes through resolve, when, arguments, interceptors, the handler and history">
		<defs>
			<marker id="fw-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker>
		</defs>
		<g data-step="1">
			{#each sources as s, i (s)}
				<rect x="6" y={8 + i * 37} width="86" height="28" rx="14" class="fw-d-box" />
				<text x="49" y={26 + i * 37} text-anchor="middle" class="fw-d-label">{s}</text>
				<path d="M92,{22 + i * 37} C120,{22 + i * 37} 118,118 140,118" class="fw-d-line" marker-end="url(#fw-arrow)" />
			{/each}
		</g>
		<g data-step="1 2">
			<rect x="142" y="96" width="112" height="44" rx="8" class="fw-d-box fw-d-strong" />
			<text x="198" y="115" text-anchor="middle" class="fw-d-code">commands.run</text>
			<text x="198" y="131" text-anchor="middle" class="fw-d-small">(id, args)</text>
		</g>
		{#each stages as s, i (s)}
			<g data-step={String(i + 2)}>
				<path d="M{254 + i * 84},118 L{266 + i * 84},118" class="fw-d-line" marker-end="url(#fw-arrow)" />
				<rect x={268 + i * 84} y="100" width="72" height="36" rx="8" class="fw-d-box" />
				<text x={304 + i * 84} y="123" text-anchor="middle" class="fw-d-label">{s}</text>
			</g>
		{/each}
		<g data-step="2"><text x="304" y="158" text-anchor="middle" class="fw-d-small">aliases,</text><text x="304" y="172" text-anchor="middle" class="fw-d-small">activate module</text></g>
		<g data-step="3"><text x="388" y="158" text-anchor="middle" class="fw-d-small">context keys</text></g>
		<g data-step="4"><text x="472" y="158" text-anchor="middle" class="fw-d-small">schema, prompt,</text><text x="472" y="172" text-anchor="middle" class="fw-d-small">confirm</text></g>
		<g data-step="5"><text x="556" y="158" text-anchor="middle" class="fw-d-small">intercept()</text></g>
		<g data-step="6"><text x="640" y="158" text-anchor="middle" class="fw-d-small">your code</text></g>
		<g data-step="7"><text x="724" y="158" text-anchor="middle" class="fw-d-small">undo, log,</text><text x="724" y="172" text-anchor="middle" class="fw-d-small">recents</text></g>
	</svg>
</Diagram>
