/**
 * App CLI (Section 15.1). Command ids map to subcommands mechanically: the first segment is the
 * group and the rest becomes kebab case (notes.renameFile -> `appname notes rename-file`).
 * Flags, types, enums and help come from the command's argument schema.
 */
import type { Kernel } from "../kernel/kernel.svelte";
import { exitCodeFor, FanwitError, toFanwitError } from "../kernel/errors";
import { argSpecs, optionValues } from "../commands/args";
import type { CliExposure, CommandDefinition } from "../commands/types";
import { identity } from "../gen/identity";

export const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
export const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function cliName(def: CommandDefinition): [string, string] {
	const exp = typeof def.cli === "object" ? (def.cli as CliExposure) : undefined;
	const [group, ...rest] = def.id.split(".");
	return [group, exp?.name ?? kebab(rest.join("."))];
}

export interface CliResult {
	code: number;
	stdout?: string;
	stderr?: string;
}

function table(rows: Record<string, unknown>[]): string {
	if (!rows.length) return "";
	const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
	const cell = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
	const widths = cols.map((c) => Math.min(60, Math.max(c.length, ...rows.map((r) => cell(r[c]).length))));
	const line = (vals: string[]) => vals.map((v, i) => v.slice(0, 60).padEnd(widths[i])).join("  ").trimEnd();
	return [line(cols.map((c) => c.toUpperCase())), ...rows.map((r) => line(cols.map((c) => cell(r[c]))))].join("\n");
}

export function formatHuman(v: unknown): string {
	if (v === undefined || v === null) return "";
	if (typeof v === "string") return v;
	if (Array.isArray(v)) return v.every((x) => x && typeof x === "object" && !Array.isArray(x)) ? table(v as Record<string, unknown>[]) : v.map(String).join("\n");
	if (typeof v === "object") return Object.entries(v as object).map(([kk, x]) => `${kk}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join("\n");
	return String(v);
}

export function helpFor(k: Kernel, def: CommandDefinition): string {
	const [g, n] = cliName(def);
	const specs = argSpecs(def.args);
	const exp = typeof def.cli === "object" ? (def.cli as CliExposure) : undefined;
	const lines = [`${def.title}${def.description ? `\n${def.description}` : ""}`, "", `Usage: ${identity.slug} ${g} ${n}${Object.keys(specs).length ? " [options]" : ""}`];
	if (Object.keys(specs).length) {
		lines.push("", "Options:");
		for (const [name, s] of Object.entries(specs)) {
			const opts = s.type === "enum" ? ` (${optionValues(s).map((o) => o.value).join("|")})` : "";
			const flag = s.type === "boolean" ? `--${kebab(name)}, --no-${kebab(name)}` : `--${kebab(name)} <${s.type}>`;
			lines.push(`  ${flag.padEnd(30)} ${s.description ?? s.title ?? ""}${opts}${s.default !== undefined ? ` [default: ${JSON.stringify(s.default)}]` : ""}${s.required === false || s.default !== undefined || s.type === "boolean" ? "" : " (required)"}`);
		}
	}
	if (exp?.examples?.length) lines.push("", "Examples:", ...exp.examples.map((e) => `  ${e}`));
	lines.push("", "Global: --json  print the result as JSON   --no-input  never prompt   --vault <path>  run against a vault");
	void k;
	return lines.join("\n");
}

function completions(k: Kernel, shell: string): string {
	const cmds = k.commands.list().filter((c) => c.def.cli);
	const groups = [...new Set(cmds.map((c) => cliName(c.def)[0]))];
	const byGroup = Object.fromEntries(groups.map((g) => [g, cmds.filter((c) => cliName(c.def)[0] === g).map((c) => cliName(c.def)[1])]));
	const app = identity.slug;
	if (shell === "powershell") {
		return `Register-ArgumentCompleter -Native -CommandName ${app}-cli -ScriptBlock {\n  param($word, $ast)\n  $map = @{${groups.map((g) => `'${g}'='${byGroup[g].join(" ")}'`).join(";")}}\n  $parts = $ast.CommandElements | ForEach-Object { $_.ToString() }\n  if ($parts.Count -le 2) { $map.Keys | Where-Object { $_ -like "$word*" } }\n  else { ($map[$parts[1]] -split ' ') | Where-Object { $_ -like "$word*" } }\n}\n`;
	}
	if (shell === "fish") return groups.map((g) => `complete -c ${app}-cli -n '__fish_use_subcommand' -a ${g}\n` + byGroup[g].map((n) => `complete -c ${app}-cli -n '__fish_seen_subcommand_from ${g}' -a ${n}`).join("\n")).join("\n") + "\n";
	// bash and zsh (bashcompinit)
	return `_${app}_cli() {\n  local cur=\${COMP_WORDS[COMP_CWORD]}\n  case \${COMP_CWORD} in\n    1) COMPREPLY=( $(compgen -W "${groups.join(" ")} commands help completions" -- "$cur") ) ;;\n    2) case \${COMP_WORDS[1]} in\n${groups.map((g) => `      ${g}) COMPREPLY=( $(compgen -W "${byGroup[g].join(" ")}" -- "$cur") ) ;;`).join("\n")}\n    esac ;;\n  esac\n}\ncomplete -F _${app}_cli ${app}-cli\n`;
}

/** Run one CLI invocation inside the app. `send` streams progress to the client. */
export async function runCli(k: Kernel, argv: string[], send: (msg: Record<string, unknown>) => void): Promise<CliResult> {
	const args = [...argv];
	const flag = (name: string) => {
		const i = args.indexOf(name);
		if (i < 0) return false;
		args.splice(i, 1);
		return true;
	};
	const json = flag("--json");
	flag("--no-input");
	const vi = args.indexOf("--vault");
	if (vi >= 0) {
		const path = args.splice(vi, 2)[1];
		if (path) await k.sys.vault.open(path);
	}
	const out = (v: unknown): CliResult => ({ code: 0, stdout: json ? JSON.stringify(v ?? null, null, 2) : formatHuman(v) });
	try {
		const [first, second, ...rest] = args;
		if (!first || first === "--help" || first === "help" && !second) {
			const cmds = k.commands.list().filter((c) => c.def.cli);
			const lines = cmds.map((c) => `  ${cliName(c.def).join(" ").padEnd(32)} ${c.def.title}`);
			return { code: 0, stdout: `Usage: ${identity.slug} <group> <command> [options]\n\nCommands:\n${lines.join("\n")}\n\nRun "${identity.slug} help <group>.<command>" for details.` };
		}
		if (first === "commands" && second === "list") {
			const list = k.commands.list().filter((c) => c.def.cli).map((c) => ({ command: cliName(c.def).join(" "), id: c.def.id, title: c.def.title }));
			return out(list);
		}
		if (first === "help") {
			const def = k.commands.get(second)?.def ?? k.commands.list().find((c) => cliName(c.def).join(".") === second || cliName(c.def).join(" ") === `${second} ${rest[0] ?? ""}`.trim())?.def;
			if (!def) throw new FanwitError("CMD_UNKNOWN", { message: `Unknown command "${second}".` });
			return { code: 0, stdout: helpFor(k, def) };
		}
		if (first === "completions") return { code: 0, stdout: completions(k, second ?? "bash") };

		// resolve: "group name", a full id, or "group.name"
		let def: CommandDefinition | undefined;
		let tail: string[];
		const byName = k.commands.list().find((c) => c.def.cli && cliName(c.def)[0] === first && (cliName(c.def)[1] === second || (typeof c.def.cli === "object" && c.def.cli.aliases?.includes(second))));
		if (byName) {
			def = byName.def;
			tail = rest;
		} else {
			def = k.commands.get(first)?.def;
			tail = [second, ...rest].filter((x) => x !== undefined);
		}
		if (!def) throw new FanwitError("CMD_UNKNOWN", { message: `Unknown command "${[first, second].filter(Boolean).join(" ")}".`, hint: `Run "${identity.slug} commands list".` });
		if (!def.cli) throw new FanwitError("PERMISSION_DENIED", { message: `"${def.id}" is not exposed to the CLI.`, hint: "Set cli: true on the command definition." });
		if (tail.includes("--help")) return { code: 0, stdout: helpFor(k, def) };

		const specs = argSpecs(def.args);
		const exp = typeof def.cli === "object" ? def.cli : undefined;
		const positional = exp?.positional ?? Object.entries(specs).filter(([, s]) => s.positional || s.type === "path").map(([n]) => n);
		const parsed: Record<string, unknown> = {};
		const pos: string[] = [];
		for (let i = 0; i < tail.length; i++) {
			const a = tail[i];
			if (a === "--data") {
				Object.assign(parsed, JSON.parse(tail[++i] ?? "{}"));
			} else if (a.startsWith("--no-")) parsed[camel(a.slice(5))] = false;
			else if (a.startsWith("--")) {
				const [rawName, inline] = a.slice(2).split(/=(.*)/s);
				const name = camel(rawName);
				if (specs[name]?.type === "boolean" && inline === undefined) parsed[name] = true;
				else parsed[name] = inline ?? tail[++i];
			} else pos.push(a);
		}
		pos.forEach((v, i) => {
			const name = positional[i];
			if (name && parsed[name] === undefined) parsed[name] = v;
		});
		const ac = new AbortController();
		const result = await k.commands.run(def.id, parsed, {
			source: "cli",
			interactive: false,
			signal: ac.signal,
			progress: { report: (fraction, message) => send({ type: "progress", fraction, message }) }
		});
		return out(result);
	} catch (e) {
		const err = toFanwitError(e);
		return { code: exitCodeFor(err), stderr: `error[${err.code}]: ${err.message}${err.hint ? `\nhint: ${err.hint}` : ""}` };
	}
}

/** Listen for CLI requests forwarded by Rust over the local socket (main window only). */
export function attachCliBridge(k: Kernel) {
	k.host.events.on<{ id: number; argv: string[] }>("fw://cli", async (req) => {
		const send = (message: Record<string, unknown>) => void k.host.invoke("fw_cli_send", { id: req.id, message }).catch(() => {});
		const r = await runCli(k, req.argv, send);
		send({ type: "done", ...r });
	});
	void k.host.invoke("fw_cli_ready").catch(() => {});
}
