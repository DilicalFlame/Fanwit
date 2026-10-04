<script lang="ts">
	import { tick, untrack } from "svelte";
	import { getKernel } from "$fanwit/ui.svelte";
	import { parentOf } from "$fanwit/layout/model";

	/**
	 * A very small shell. Built ins (help, ls, cat, echo...), "split" and "vsplit" split this
	 * terminal like tmux, "new" opens a terminal tab, and "run <command> [json]" runs any app
	 * command: everything in the app is a command. Up/Down walk the history, Tab completes.
	 */
	let { paneId, props }: { paneId: string; props: { name?: string } } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
	type Line = { text: string; kind: "cmd" | "out" | "err" };
	const FILES: Record<string, string> = {
		"readme.txt": "This terminal is a layout showcase. Try: split, vsplit, new, run palette.open",
		"todo.txt": "- try every layout preset\n- drag a tab out of the window\n- edit workspace.toml",
		"motd": "Have a nice day."
	};
	let lines = $state<Line[]>([{ text: `${untrack(() => props.name) ?? "Terminal"}: type "help" to see what this shell can do.`, kind: "out" }]);
	let input = $state("");
	let history: string[] = [];
	let at = 0;
	let field = $state<HTMLInputElement>();
	let scroller = $state<HTMLDivElement>();
	const out = (text: string, kind: Line["kind"] = "out") => void lines.push(...text.split("\n").map((t) => ({ text: t, kind })));

	const BUILTINS: Record<string, (args: string[]) => void | Promise<void>> = {
		help: () => out("help  clear  echo <text>  date  whoami  pwd  ls  cat <file>  history\nsplit  vsplit  new  exit  neofetch  commands [filter]  run <command.id> [json args]"),
		clear: () => void (lines = []),
		echo: (a) => out(a.join(" ")),
		date: () => out(new Date().toString()),
		whoami: () => out("you"),
		pwd: () => out("/home/you"),
		ls: () => out(Object.keys(FILES).join("  ")),
		cat: (a) => (a[0] && FILES[a[0]] !== undefined ? out(FILES[a[0]]) : out(`cat: ${a[0] ?? ""}: No such file`, "err")),
		history: () => out(history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n")),
		neofetch: async () => {
			const info = await k.host.app().catch(() => null);
			out(`   ▄▄▄▄   you@${info?.name ?? "fanwit"}\n  █ ▄▄ █  OS: ${info?.os ?? navigator.platform}\n  █ ▀▀ █  Version: ${info?.version ?? "dev"}\n   ▀▀▀▀   Layout: ${layout.doc.preset ?? "custom"}`);
		},
		split: () => void layout.dispatch({ type: "split", node: parentOf(layout.doc, paneId)?.parent, pane: paneId, dir: "column" }),
		vsplit: () => void layout.dispatch({ type: "split", node: parentOf(layout.doc, paneId)?.parent, pane: paneId, dir: "row" }),
		new: () => void k.commands.run("showcase.terminal.new", {}, { source: "cli" }),
		exit: () => void layout.dispatch({ type: "closePane", pane: paneId }),
		commands: (a) => out(k.commands.list().map((c) => c.def.id).filter((id) => !a[0] || id.includes(a[0])).sort().join("\n")),
		run: async (a) => {
			if (!a[0]) return out("usage: run <command.id> [json args]", "err");
			try {
				const r = await k.commands.run(a[0], a[1] ? JSON.parse(a.slice(1).join(" ")) : {}, { source: "cli" });
				out(r === undefined ? "ok" : typeof r === "string" ? r : JSON.stringify(r, null, 2));
			} catch (e) {
				out(String((e as Error).message ?? e), "err");
			}
		}
	};

	async function exec() {
		const cmd = input.trim();
		lines.push({ text: cmd, kind: "cmd" });
		input = "";
		if (cmd) {
			history.push(cmd);
			at = history.length;
			const [name, ...args] = cmd.split(/\s+/);
			const fn = BUILTINS[name];
			if (fn) await fn(args);
			else out(`${name}: command not found`, "err");
		}
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight });
	}

	function keys(e: KeyboardEvent) {
		if (e.key === "Enter") void exec();
		else if (e.key === "ArrowUp" && at > 0) input = history[--at];
		else if (e.key === "ArrowDown") input = at < history.length - 1 ? history[++at] : ((at = history.length), "");
		else if (e.key === "Tab") {
			const hit = Object.keys(BUILTINS).filter((b) => b.startsWith(input));
			if (hit.length === 1) input = `${hit[0]} `;
			else if (hit.length) out(hit.join("  "));
		} else if (e.key === "l" && e.ctrlKey) lines = [];
		else if (e.key === "c" && e.ctrlKey && !getSelection()?.toString()) {
			lines.push({ text: `${input}^C`, kind: "cmd" });
			input = "";
		} else return;
		e.preventDefault();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (a click anywhere focuses the prompt, which takes the keys) -->
<div bind:this={scroller} class="selectable h-full w-full overflow-auto bg-[#0c0c0c] p-3 font-mono text-[13px] leading-5 text-[#cccccc]" onclick={() => !getSelection()?.toString() && field?.focus()}>
	{#each lines as l, i (i)}
		<div class="break-all whitespace-pre-wrap {l.kind === 'err' ? 'text-[#f14c4c]' : ''}">{#if l.kind === "cmd"}<span class="text-[#16c60c]">you@fanwit</span>:<span class="text-[#3b78ff]">~</span>$ {/if}{l.text}</div>
	{/each}
	<div class="flex">
		<span class="shrink-0"><span class="text-[#16c60c]">you@fanwit</span>:<span class="text-[#3b78ff]">~</span>$&nbsp;</span>
		<input bind:this={field} class="min-w-0 flex-1 bg-transparent caret-[#cccccc] outline-none" spellcheck="false" autocomplete="off" bind:value={input} onkeydown={keys} aria-label="Command line" />
	</div>
</div>
