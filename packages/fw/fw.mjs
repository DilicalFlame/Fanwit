#!/usr/bin/env node
/**
 * fw: the Fanwit developer CLI (Section 15.2). Run with `pnpm fw <command>`.
 * Every command supports --dry-run and prints the files it changes. TOML and Cargo edits are
 * line level, so comments and formatting survive (defect D7).
 */
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const args = argv.filter((a) => a !== "--dry-run");
const changed = [];

// ---------- helpers ----------
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");
const abs = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(abs(p), "utf8");
const exists = (p) => fs.existsSync(abs(p));
function write(p, text) {
	const full = abs(p);
	const before = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
	if (before === text) return;
	changed.push(`${before === null ? "create" : "update"} ${p}`);
	if (DRY) return;
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, text);
}
function remove(p) {
	if (!exists(p)) return;
	changed.push(`delete ${p}`);
	if (!DRY) fs.rmSync(abs(p), { recursive: true, force: true });
}
function flag(name, fallback) {
	const i = args.indexOf(`--${name}`);
	if (i >= 0) return args[i + 1];
	const eq = args.find((a) => a.startsWith(`--${name}=`));
	return eq ? eq.slice(name.length + 3) : fallback;
}
const has = (name) => args.includes(`--${name}`);
const die = (msg, code = 1) => {
	console.error(`fw: ${msg}`);
	process.exit(code);
};
function report() {
	if (!changed.length) return console.log("Nothing to change.");
	console.log(`${DRY ? "Would change" : "Changed"}:\n${changed.map((c) => `  ${c}`).join("\n")}`);
}
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
const camel = (s) => s.replace(/[-_ ]+(\w)/g, (_, c) => c.toUpperCase());
const pascal = (s) => camel(s).replace(/^\w/, (c) => c.toUpperCase());
/** Replace `key = "..."` within a TOML [section] (format preserving). */
function setTomlKey(text, section, key, value) {
	const lines = text.split(/\r?\n/);
	let cur = "";
	let done = false;
	const out = lines.map((line) => {
		const m = /^\s*\[([^\]]+)\]/.exec(line);
		if (m) cur = m[1].trim();
		if (!done && cur === section && new RegExp(`^\\s*${key}\\s*=`).test(line)) {
			done = true;
			return line.replace(/=\s*("[^"]*"|\[[^\]]*\]|[^#\s]+)/, `= ${JSON.stringify(value)}`);
		}
		return line;
	});
	if (!done) throw new Error(`[${section}] ${key} not found`);
	return out.join("\n");
}
function identity() {
	return parseToml(read("fanwit.app.toml"));
}

// ---------- rename ----------
function validIdentifier(id) {
	return /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)+$/.test(id) && !/_/.test(id);
}
async function rename() {
	const id = identity();
	const rl = !has("yes") && process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
	const ask = async (q, def) => (rl ? (await rl.question(`${q} (${def}): `)).trim() || def : def);
	const name = flag("name") ?? (await ask("Display name", id.app.name));
	const slug = flag("slug") ?? (await ask("Slug (crate, package, folders)", kebab(name)));
	const dev = flag("dev") ?? (await ask("Developer", id.developer.name));
	const identifier = flag("id") ?? (await ask("Bundle identifier", `com.${kebab(dev).replace(/-/g, "")}.${slug.replace(/-/g, "")}`));
	const scheme = flag("scheme") ?? (await ask("Deep link scheme", slug.replace(/-/g, "")));
	rl?.close();
	if (!/^[a-z][a-z0-9-]*$/.test(slug)) die(`slug "${slug}" must be lower case letters, digits and dashes`, 2);
	if (!validIdentifier(identifier)) die(`identifier "${identifier}" is invalid for installers (use reverse DNS, no spaces or underscores)`, 2);
	const oldSlug = id.app.slug;
	const crate = slug.replace(/-/g, "_");

	let t = read("fanwit.app.toml");
	t = setTomlKey(t, "app", "name", name);
	t = setTomlKey(t, "app", "slug", slug);
	t = setTomlKey(t, "app", "identifier", identifier);
	t = setTomlKey(t, "app", "scheme", scheme);
	t = setTomlKey(t, "developer", "name", dev);
	write("fanwit.app.toml", t);

	const pkg = JSON.parse(read("package.json"));
	pkg.name = slug;
	write("package.json", JSON.stringify(pkg, null, "\t") + "\n");

	let cargo = read("src-tauri/Cargo.toml");
	cargo = setTomlKey(cargo, "package", "name", slug);
	cargo = setTomlKey(cargo, "package", "authors", [dev]);
	cargo = setTomlKey(cargo, "package", "default-run", slug);
	cargo = setTomlKey(cargo, "lib", "name", `${crate}_lib`);
	write("src-tauri/Cargo.toml", cargo);
	write("src-tauri/src/main.rs", read("src-tauri/src/main.rs").replace(/\w+_lib::run\(\)/, `${crate}_lib::run()`));
	if (exists("src-tauri/Cargo.lock")) write("src-tauri/Cargo.lock", read("src-tauri/Cargo.lock").replace(new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = )"${oldSlug}"`), `$1"${slug}"`));
	const cliOld = `src-tauri/src/bin/${oldSlug}-cli.rs`;
	if (oldSlug !== slug && exists(cliOld)) {
		write(`src-tauri/src/bin/${slug}-cli.rs`, read(cliOld));
		remove(cliOld);
	}

	const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
	conf.productName = name;
	conf.mainBinaryName = slug;
	conf.identifier = identifier;
	conf.plugins ??= {};
	conf.plugins["deep-link"] = { desktop: { schemes: [scheme] } };
	write("src-tauri/tauri.conf.json", JSON.stringify(conf, null, "\t") + "\n");

	writeIdentity({ ...id, app: { ...id.app, name, slug, identifier, scheme }, developer: { ...id.developer, name: dev } });
	if (exists("README.md")) write("README.md", read("README.md").replace(/^# .*$/m, `# ${name}`));
	report();
	if (!DRY) console.log(`\nNext: pnpm install && pnpm tauri dev`);
}
function writeIdentity(id) {
	write(
		"src/fanwit/gen/identity.ts",
		`// GENERATED by \`pnpm fw rename\` from fanwit.app.toml. Do not edit by hand.\nexport const identity = {\n\tname: ${JSON.stringify(id.app.name)},\n\tslug: ${JSON.stringify(id.app.slug)},\n\tidentifier: ${JSON.stringify(id.app.identifier)},\n\tscheme: ${JSON.stringify(id.app.scheme)},\n\tversion: ${JSON.stringify(id.app.version)},\n\tdeveloper: ${JSON.stringify(id.developer.name)},\n\tvaultFolder: ${JSON.stringify("." + id.app.slug)}\n} as const;\n`
	);
	write(
		"src-tauri/src/gen_identity.rs",
		`// GENERATED by \`pnpm fw rename\`. Do not edit by hand.\n#[allow(dead_code)]\npub const NAME: &str = ${JSON.stringify(id.app.name)};\n#[allow(dead_code)]\npub const SLUG: &str = ${JSON.stringify(id.app.slug)};\n#[allow(dead_code)]\npub const VAULT_FOLDER: &str = ${JSON.stringify("." + id.app.slug)};\n`
	);
}

// ---------- version ----------
function parseVersion(v) {
	const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(v);
	if (!m) die(`invalid version "${v}"`, 2);
	return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4], preN: m[5] ? +m[5] : 0 };
}
const fmt = (v) => `${v.major}.${v.minor}.${v.patch}${v.pre ? `-${v.pre}.${v.preN}` : ""}`;
function applyVersion(version) {
	const id = identity();
	write("fanwit.app.toml", setTomlKey(read("fanwit.app.toml"), "app", "version", version));
	const pkg = JSON.parse(read("package.json"));
	pkg.version = version;
	write("package.json", JSON.stringify(pkg, null, "\t") + "\n");
	const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
	conf.version = version;
	write("src-tauri/tauri.conf.json", JSON.stringify(conf, null, "\t") + "\n");
	write("src-tauri/Cargo.toml", setTomlKey(read("src-tauri/Cargo.toml"), "package", "version", version));
	if (exists("src-tauri/Cargo.lock")) write("src-tauri/Cargo.lock", read("src-tauri/Cargo.lock").replace(new RegExp(`(name = "${id.app.slug}"\\r?\\nversion = )"[^"]+"`), `$1"${version}"`));
	writeIdentity({ ...id, app: { ...id.app, version } });
}
function version() {
	const [, kind, extra] = args;
	const historyFile = "constants/.versions";
	const history = exists(historyFile) ? read(historyFile).split(/\r?\n/).filter(Boolean) : [];
	const current = identity().app.version;
	if (kind === "peek" || !kind) return console.log(current + (history.length ? `\nhistory: ${history.join(" -> ")}` : ""));
	let next;
	if (kind === "pop") {
		if (history.length < 2) die("no previous version to return to");
		history.pop();
		next = history[history.length - 1];
		write(historyFile, history.join("\n") + "\n");
		applyVersion(next);
		report();
		return;
	}
	const v = parseVersion(current);
	if (kind === "patch") next = v.pre ? fmt({ ...v, pre: undefined }) : fmt({ ...v, patch: v.patch + 1, pre: undefined });
	else if (kind === "minor") next = fmt({ ...v, minor: v.minor + 1, patch: 0, pre: undefined });
	else if (kind === "major") next = fmt({ major: v.major + 1, minor: 0, patch: 0 });
	else if (kind === "pre") {
		const tag = extra ?? "beta";
		next = v.pre === tag ? fmt({ ...v, preN: v.preN + 1 }) : fmt({ ...v, patch: v.pre ? v.patch : v.patch + 1, pre: tag, preN: 1 });
	} else if (kind === "set") next = fmt(parseVersion(extra ?? die("fw version set <x.y.z>", 2)));
	else die("fw version <patch|minor|major|pre [tag]|set x.y.z|pop|peek> [--tag] [--changelog]", 2);
	if (!history.length) history.push(current);
	history.push(next);
	write(historyFile, history.join("\n") + "\n");
	applyVersion(next);
	if (has("changelog")) changelog(next);
	report();
	if (has("tag") && !DRY) execSync(`git tag v${next}`, { cwd: ROOT, stdio: "inherit" });
}
function changelog(next) {
	let lastTag = "";
	try {
		lastTag = execSync("git describe --tags --abbrev=0", { cwd: ROOT }).toString().trim();
	} catch {
		/* first release */
	}
	const log = execSync(`git log ${lastTag ? lastTag + "..HEAD" : ""} --pretty=format:%s`, { cwd: ROOT }).toString().split("\n").filter(Boolean);
	const groups = { feat: "Features", fix: "Fixes", perf: "Performance", docs: "Documentation" };
	let md = `## ${next} (${new Date().toISOString().slice(0, 10)})\n`;
	for (const [k, title] of Object.entries(groups)) {
		const items = log.filter((l) => l.startsWith(k + ":") || l.startsWith(k + "("));
		if (items.length) md += `\n### ${title}\n${items.map((i) => `- ${i.replace(/^\w+(\([^)]*\))?:\s*/, "")}`).join("\n")}\n`;
	}
	const prev = exists("CHANGELOG.md") ? read("CHANGELOG.md").replace(/^# Changelog\n+/, "") : "";
	write("CHANGELOG.md", `# Changelog\n\n${md}\n${prev}`);
}

// ---------- generators ----------
const GEN = {
	module(idArg) {
		const id = kebab(idArg);
		const dir = `src/app/modules/${id}`;
		write(`${dir}/module.ts`, `import { defineModule } from "$fanwit";\n\nexport default defineModule({\n\tid: "${camel(id)}",\n\ttitle: "${pascal(id)}",\n\tcontributes: {\n\t\tcommands: [{ id: "${camel(id)}.hello", title: "Say hello", category: "${pascal(id)}" }]\n\t},\n\tactivate: () => import("./activate")\n});\n`);
		write(`${dir}/activate.ts`, `import type { ModuleContext } from "$fanwit";\n\nexport default function activate(ctx: ModuleContext) {\n\tctx.commands.handle("${camel(id)}.hello", () => ctx.notify.toast("Hello from ${id}"));\n}\n`);
		write(`${dir}/${id}.test.ts`, `import { expect, test } from "vitest";\nimport { createTestKernel } from "$fanwit/testing";\nimport mod from "./module";\n\ntest("${id} registers its commands", async () => {\n\tconst k = await createTestKernel({ modules: [mod] });\n\texpect(k.commands.get("${camel(id)}.hello")).toBeTruthy();\n});\n`);
		const idx = read("src/app/modules/index.ts");
		if (!idx.includes(`./${id}/module`)) {
			const v = camel(id);
			write("src/app/modules/index.ts", idx.replace(/(import type[^\n]*\n)/, `$1import ${v} from "./${id}/module";\n`).replace(/appModules: ModuleDefinition\[\] = \[([^\]]*)\]/, (_, l) => `appModules: ModuleDefinition[] = [${l ? l + ", " : ""}${v}]`));
		}
		write(`docs/guides/${id}.md`, `---\ntitle: ${pascal(id)}\nsection: Guides\n---\n# ${pascal(id)}\n\nDescribe what the ${id} module does.\n`);
	},
	command(idArg) {
		const [mod, name] = idArg.split(".");
		if (!name) die("fw add command <module>.<verbObject>", 2);
		const file = `src/app/modules/${kebab(mod)}/module.ts`;
		if (!exists(file)) die(`no module ${file}; run fw add module ${mod}`);
		write(file, read(file).replace(/commands: \[/, `commands: [\n\t\t\t{ id: "${idArg}", title: "${pascal(name).replace(/([a-z])([A-Z])/g, "$1 $2")}", category: "${pascal(mod)}", cli: true },`));
		const act = `src/app/modules/${kebab(mod)}/activate.ts`;
		write(act, read(act).replace(/\n}\s*$/, `\n\tctx.commands.handle("${idArg}", () => {\n\t\t// TODO\n\t});\n}\n`));
	},
	view(idArg) {
		const [mod, name] = idArg.split(".");
		const comp = pascal(name ?? idArg) + "View";
		write(`src/app/modules/${kebab(mod)}/views/${comp}.svelte`, `<script lang="ts">\n\timport { getKernel } from "$fanwit/ui.svelte";\n\timport EmptyState from "$fanwit/workbench/EmptyState.svelte";\n\n\tlet { paneId, props }: { paneId: string | null; props: Record<string, unknown> } = $props();\n\tconst k = getKernel();\n</script>\n\n<EmptyState icon="sparkles" title="${comp}" description="Empty state: explain what appears here and offer the first action." />\n`);
		const file = `src/app/modules/${kebab(mod)}/module.ts`;
		if (exists(file)) {
			const t = read(file);
			write(file, t.includes("views: [") ? t.replace("views: [", `views: [\n\t\t\t{ id: "${idArg}", title: "${pascal(name)}", icon: "square", component: () => import("./views/${comp}.svelte") },`) : t.replace("contributes: {", `contributes: {\n\t\tviews: [{ id: "${idArg}", title: "${pascal(name)}", icon: "square", component: () => import("./views/${comp}.svelte") }],`));
		}
	},
	window(kind) {
		const base = flag("base", "child");
		const mod = kind.split(".")[0];
		const file = `src/app/modules/${kebab(mod)}/module.ts`;
		if (exists(file)) write(file, read(file).replace("contributes: {", `contributes: {\n\t\twindows: [{ kind: "${kind}", base: "${base}", view: "${kind}", title: "${pascal(kind.split(".").pop())}" }],`));
		GEN.view(kind);
		const capFile = "src-tauri/capabilities/child-windows.json";
		const cap = JSON.parse(read(capFile));
		if (base !== "aux" && !cap.windows.includes(`${base}-*`)) {
			cap.windows.push(`${base}-*`);
			write(capFile, JSON.stringify(cap, null, 2) + "\n");
		}
	},
	setting(key) {
		const [mod, ...rest] = key.split(".");
		const file = `src/app/modules/${kebab(mod)}/module.ts`;
		if (!exists(file)) die(`no module ${file}`);
		const t = read(file);
		const line = `"${rest.join(".")}": s.string("", { title: "${pascal(rest.join(" "))}" }),`;
		if (t.includes(`defineSettings("${mod}"`)) write(file, t.replace(`defineSettings("${mod}", {`, `defineSettings("${mod}", {\n\t\t\t${line}`));
		else write(file, `import { defineSettings, s } from "$fanwit/settings/define";\n` + t.replace("contributes: {", `contributes: {\n\t\tsettings: defineSettings("${mod}", {\n\t\t\t${line}\n\t\t}),`));
	},
	"menu-location"(loc) {
		const mod = flag("module", "app");
		const file = `src/app/modules/${kebab(mod)}/module.ts`;
		if (!exists(file)) die(`no module ${file}; pass --module <id>`);
		write(file, read(file).replace("contributes: {", `contributes: {\n\t\tmenuLocations: [{ id: "${loc}", description: "Describe where this menu appears" }],\n\t\tmenus: { "${loc}": [{ id: "${loc.replace(/\W/g, ".")}.example", command: "palette.open", group: "navigation" }] },`));
		console.log(`Attach it: <div use:menu={{ location: "${loc}", target: { /* … */ } }}>`);
	},
	"menu-kind"(kind) {
		const comp = pascal(kind);
		write(`src/app/menus/kinds/${comp}.svelte`, `<script lang="ts">\n\timport type { MenuKindProps } from "$fanwit";\n\tlet { item, props, value, emit, close }: MenuKindProps<{ label?: string }> = $props();\n</script>\n\n<div role="group" aria-label={props.label ?? item.label} class="px-2 py-1" data-menu-composite>\n\t<button class="fw-btn" onclick={() => emit({ value: true })}>{props.label ?? item.label}</button>\n</div>\n`);
		write(`src/app/menus/kinds/${camel(kind)}.ts`, `import { defineMenuItemKind } from "$fanwit";\n\nexport default defineMenuItemKind({\n\tkind: "${kind}",\n\ttitle: "${comp}",\n\tprops: { label: { type: "string", required: false } },\n\temits: { value: { type: "boolean" } },\n\tkeyboard: "grid",\n\trole: "group",\n\tnativeFallback: "hidden",\n\tcomponent: () => import("./${comp}.svelte")\n});\n// Register it in a module: contributes: { menuKinds: [kind] }\n`);
	},
	"layout-node"(type) {
		const comp = pascal(type);
		write(`src/app/layouts/nodes/${comp}.svelte`, `<script lang="ts">\n\tlet { node, model }: { node: string; model: { panes?: string[] } } = $props();\n</script>\n\n<div class="flex-1 p-2 text-sm">Custom node {node}: {model.panes?.length ?? 0} panes</div>\n`);
		write(`src/app/layouts/nodes/${camel(type)}.ts`, `import { defineLayoutNode } from "$fanwit";\n\nexport default defineLayoutNode({\n\ttype: "${type}",\n\tchildren: (n) => (n.panes as string[]) ?? [],\n\tcomponent: () => import("./${comp}.svelte"),\n\tdrop: { accepts: ["pane"], zones: ["center"] }\n});\n// Register it in a module: contributes: { layoutNodes: [node] }\n`);
	},
	theme(id) {
		const base = read("src/fanwit/themes/builtin/fanwit-default.toml").replace(/id = "fanwit-default"/, `id = "${id}"`).replace(/name = "Fanwit Default"/, `name = "${pascal(id)}"`);
		write(`src/app/themes/${id}/theme.toml`, base);
		console.log(`Contribute it: contributes: { themes: [themeText] } with import themeText from "./themes/${id}/theme.toml?raw"`);
	},
	migration(mod, name = "change") {
		const dir = `src/app/modules/${kebab(mod)}/migrations`;
		const n = (exists(dir) ? fs.readdirSync(abs(dir)).length : 0) + 1;
		write(`${dir}/${String(n).padStart(3, "0")}_${kebab(name)}.ts`, `import { sql } from "$fanwit";\n\n// tables must be prefixed with the module id: ${camel(mod)}__\nexport default { version: ${n}, up: sql\`CREATE TABLE IF NOT EXISTS ${camel(mod)}__${name.replace(/\W/g, "_")} (id TEXT PRIMARY KEY)\` };\n`);
	},
	"rust-command"(id) {
		const fn = id.replace(/\./g, "_");
		write(`src-tauri/src/app/${fn}.rs`, `//! ${id}: a Rust command callable from TypeScript (\`host.invoke("${fn}")\`).\n\n#[tauri::command]\npub fn ${fn}() -> Result<String, String> {\n    Ok("${id} ran in Rust".into())\n}\n`);
		console.log(`Register it: add \`pub mod ${fn};\` to src-tauri/src/app/mod.rs and \`app::${fn}::${fn}\` to generate_handler! in lib.rs`);
	},
	"status-item"(id) {
		const mod = id.split(".")[0];
		const file = `src/app/modules/${kebab(mod)}/module.ts`;
		if (!exists(file)) die(`no module ${file}`);
		write(file, read(file).replace("contributes: {", `contributes: {\n\t\tstatusItems: [{ id: "${id}", align: "right", priority: 10, text: "${pascal(id.split(".").pop())}" }],`));
	}
};

// ---------- doctor ----------
function doctor() {
	const rows = [];
	const ok = (label, good, detail = "") => rows.push(`${good ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
	const ver = (cmd) => {
		try {
			return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n")[0];
		} catch {
			return null;
		}
	};
	ok("node", !!ver("node -v"), ver("node -v") ?? "missing");
	ok("pnpm", !!ver("pnpm -v"), ver("pnpm -v") ?? "missing");
	ok("rustc", !!ver("rustc -V"), ver("rustc -V") ?? "missing (https://rustup.rs)");
	ok("cargo", !!ver("cargo -V"), ver("cargo -V") ?? "missing");
	if (process.platform === "win32") {
		const wv = ver('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv');
		ok("WebView2", !!wv, wv ? wv.split(/\s+/).pop() : "not detected (installer bootstraps it)");
	}
	const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
	ok("CSP configured (D10)", !!conf.app?.security?.csp && conf.app.security.csp !== null);
	ok("isolation pattern", conf.app?.security?.pattern?.use === "isolation");
	ok("withGlobalTauri off", conf.app?.withGlobalTauri === false);
	const id = identity();
	ok("bundle identifier", validIdentifier(conf.identifier), conf.identifier);
	ok("identity in sync", conf.identifier === id.app.identifier && conf.version === id.app.version, "fanwit.app.toml vs tauri.conf.json");
	// capabilities cover every window base kind (D9)
	const caps = fs.readdirSync(abs("src-tauri/capabilities")).map((f) => JSON.parse(read(`src-tauri/capabilities/${f}`)));
	const patterns = caps.flatMap((c) => c.windows ?? []);
	for (const base of ["main", "aux", "child", "panel", "sheet", "palette", "splash", "tray"]) ok(`capability for ${base} windows`, patterns.some((p) => p === base || p === `${base}-*`));
	// Tauri imports only inside the host (Section 3.3)
	const offenders = [];
	const walk = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) walk(p);
			else if (/\.(ts|svelte)$/.test(e.name) && !p.startsWith("src/fanwit/host") && !p.startsWith("src/lib/") && /from "@tauri-apps\//.test(read(p)) && !/startup\.svelte\.ts$/.test(p)) offenders.push(p);
		}
	};
	walk("src");
	ok("@tauri-apps imports only in src/fanwit/host", !offenders.length, offenders.join(", "));
	// layouts reference registered views
	const views = new Set();
	const scanViews = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) scanViews(p);
			else if (/\.ts$/.test(e.name)) for (const m of read(p).matchAll(/(?:id:|v\()\s*"([\w.]+)"/g)) views.add(m[1]);
		}
	};
	scanViews("src");
	for (const f of fs.readdirSync(abs("src/fanwit/layout/presets"))) {
		const doc = parseToml(read(`src/fanwit/layout/presets/${f}`));
		const missing = Object.values(doc.pane ?? {}).map((p) => p.view).filter((v) => !views.has(v));
		ok(`preset ${f} views`, !missing.length, missing.join(", "));
	}
	console.log(rows.join("\n"));
	if (rows.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
}

// ---------- schema ----------
function schema() {
	const node = { type: "object", required: ["type"], properties: { type: { enum: ["split", "tabs", "stack", "grid"], description: "Node type, or a custom type registered with defineLayoutNode" }, dir: { enum: ["row", "column"] }, children: { type: "array", items: { type: "string" } }, sizes: { type: "array", items: { type: ["number", "string"] } }, panes: { type: "array", items: { type: "string" } }, active: { type: "string" }, strip: { enum: ["top", "bottom", "left", "right", "hidden"] }, title: { type: "string" }, icon: { type: "string" }, locked: { type: "boolean" }, columns: { type: "string" }, rows: { type: "string" }, gap: { type: ["number", "string"] } } };
	const region = { type: "object", properties: { node: { type: "string" }, containers: { type: "array", items: { type: "string" } }, size: { type: ["string", "number"] }, visible: { type: "boolean" }, collapsible: { type: "boolean" }, side: { type: "string" } } };
	const views = [];
	const walk = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) walk(p);
			else if (/\.ts$/.test(e.name)) for (const m of read(p).matchAll(/(?:\bid:|\bv\()\s*"((?:fanwit|[a-z]+)\.[\w]+)"/g)) views.push(m[1]);
		}
	};
	walk("src");
	const layout = {
		$schema: "http://json-schema.org/draft-07/schema#",
		title: "Fanwit workspace.toml",
		type: "object",
		properties: {
			version: { const: 1 },
			preset: { type: "string" },
			window: { type: "object", additionalProperties: { type: "object", required: ["kind"], properties: { kind: { type: "string" }, frame: { enum: ["workbench", "plain"] }, title: { type: "string" }, regions: { type: "object", additionalProperties: region }, responsive: { type: "object" }, parent: { type: "string" }, focus: { enum: ["none", "takeover", "lock"] }, on_blocked: { type: "array", items: { enum: ["bell", "shake", "flash", "attention"] } }, size: { type: "array" }, root: { type: "string" }, zen: { type: "boolean" } } } },
			node: { type: "object", additionalProperties: node },
			pane: { type: "object", additionalProperties: { type: "object", required: ["view"], properties: { view: { type: "string", examples: [...new Set(views)].sort() }, props: { type: "object" }, title: { type: "string" }, icon: { type: "string" }, pinned: { type: "boolean" }, preview: { type: "boolean" }, collapsed: { type: "boolean" }, area: { type: "string" } } } },
			float: { type: "object", additionalProperties: { type: "object", required: ["window", "pane", "rect"], properties: { window: { type: "string" }, pane: { type: "string" }, rect: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 }, anchor: { type: "string" }, snap: { type: "boolean" } } } },
			drawer: { type: "object" },
			overlay: { type: "object" }
		}
	};
	const keys = { $schema: "http://json-schema.org/draft-07/schema#", title: "Fanwit keys.toml", type: "object", properties: { bind: { type: "array", items: { type: "object", required: ["command"], properties: { key: { type: "string" }, command: { type: "string" }, when: { type: "string" }, args: { type: "object" }, global: { type: "boolean" }, mac: { type: "string" }, win: { type: "string" }, linux: { type: "string" }, web: { type: "string" } } } } } };
	const menus = { $schema: "http://json-schema.org/draft-07/schema#", title: "Fanwit menus.toml", type: "object", properties: { patch: { type: "array", items: { type: "object", required: ["location", "op", "item"], properties: { location: { type: "string" }, op: { enum: ["hide", "show", "move", "rename", "icon", "regroup", "insert", "props", "pin", "when"] }, item: { type: ["string", "object"] }, before: { type: "string" }, after: { type: "string" }, group: { type: "string" }, label: { type: "string" }, icon: { type: "string" }, props: { type: "object" } } } }, location: { type: "array" } } };
	const settingsKeys = {};
	const walkSettings = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) walkSettings(p);
			else if (/\.ts$/.test(e.name)) {
				const t = read(p);
				for (const block of t.matchAll(/defineSettings\("([\w.]*)",\s*\{([\s\S]*?)\n\t?\}\)/g)) for (const m of block[2].matchAll(/"?([\w.]+)"?:\s*s\.(\w+)\(/g)) settingsKeys[(block[1] ? block[1] + "." : "") + m[1]] = m[2];
			}
		}
	};
	walkSettings("src");
	const settings = { $schema: "http://json-schema.org/draft-07/schema#", title: "Fanwit settings.toml", description: `Known keys: ${Object.keys(settingsKeys).sort().join(", ")}`, type: "object" };
	write("schemas/workspace.schema.json", JSON.stringify(layout, null, 2) + "\n");
	write("schemas/keys.schema.json", JSON.stringify(keys, null, 2) + "\n");
	write("schemas/menus.schema.json", JSON.stringify(menus, null, 2) + "\n");
	write("schemas/settings.schema.json", JSON.stringify(settings, null, 2) + "\n");
	write(".taplo.toml", `# Schema associations for Even Better TOML (Taplo)\n[[rule]]\ninclude = ["**/workspace.toml", "src/fanwit/layout/presets/*.toml"]\n[rule.schema]\npath = "./schemas/workspace.schema.json"\n\n[[rule]]\ninclude = ["**/keys.toml"]\n[rule.schema]\npath = "./schemas/keys.schema.json"\n\n[[rule]]\ninclude = ["**/menus.toml"]\n[rule.schema]\npath = "./schemas/menus.schema.json"\n`);
	report();
}

// ---------- layout ----------
function layout() {
	const [, sub, file] = args;
	if (sub === "validate") {
		const text = fs.readFileSync(file ?? die("fw layout validate <file>", 2), "utf8");
		let doc;
		try {
			doc = parseToml(text);
		} catch (e) {
			die(`${file}: ${e.message.split("\n")[0]}`);
		}
		const errors = [];
		const nodes = doc.node ?? {};
		const panes = doc.pane ?? {};
		if (!doc.window?.main) errors.push("missing [window.main]");
		for (const [wid, w] of Object.entries(doc.window ?? {})) for (const [r, st] of Object.entries(w.regions ?? {})) if (st?.node && !nodes[st.node]) errors.push(`window.${wid}.regions.${r}: missing node "${st.node}"`);
		const seen = {};
		for (const [id, n] of Object.entries(nodes)) {
			for (const c of n.children ?? []) if (!nodes[c]) errors.push(`node.${id}: missing child "${c}"`);
			for (const p of n.panes ?? []) {
				if (!panes[p]) errors.push(`node.${id}: missing pane "${p}"`);
				if (seen[p]) errors.push(`pane "${p}" listed in node.${seen[p]} and node.${id}`);
				seen[p] = id;
			}
		}
		if (errors.length) {
			console.error(errors.join("\n"));
			process.exit(1);
		}
		console.log(`${file}: valid (${Object.keys(nodes).length} nodes, ${Object.keys(panes).length} panes)`);
	} else if (sub === "preset") {
		const [, , , name, from] = args;
		if (!name || !from) die("fw layout preset <name> <workspace.toml>", 2);
		write(`src/fanwit/layout/presets/${kebab(name)}.toml`, fs.readFileSync(from, "utf8").replace(/^preset = .*$/m, `preset = "${kebab(name)}"`));
		report();
		console.log("Register it in core/index.ts layoutPresets, or contribute it from your module.");
	} else die("fw layout <validate <file>|preset <name> <workspace.toml>>", 2);
}

// ---------- plugins ----------
async function plugin() {
	const [, sub, id] = args;
	if (sub === "new") {
		if (!id || !/^[a-z0-9-]+$/.test(id)) die("fw plugin new <id> (lower case, dashes)", 2);
		const dir = `plugins/${id}`;
		write(`${dir}/plugin.toml`, `id = "${id}"\nname = "${pascal(id)}"\nversion = "0.1.0"\nauthor = ""\ndescription = ""\napp = ">=${identity().app.version}"\nentry = "main.js"\nisolation = "worker"\nactivation = ["onCommand:${camel(id)}.hello"]\npermissions = []\n\n[[contributes.commands]]\nid = "${camel(id)}.hello"\ntitle = "Hello from ${pascal(id)}"\n`);
		write(`${dir}/main.js`, `import { definePlugin } from "@fanwit/plugin-sdk";\n\nexport default definePlugin((ctx) => {\n\tctx.commands.handle("${camel(id)}.hello", () => ctx.notify.toast("Hello from ${id}"));\n});\n`);
		write(`${dir}/README.md`, `# ${pascal(id)}\n\nWhat this plugin does, and why it needs each permission.\n`);
		report();
		console.log(`Install it from the Plugin Manager (Install from folder) or copy it into the app data plugins folder.`);
	} else if (sub === "pack") {
		const dir = abs(`plugins/${id}`);
		if (!fs.existsSync(dir)) die(`no plugins/${id}`);
		const manifest = parseToml(fs.readFileSync(path.join(dir, "plugin.toml"), "utf8"));
		const files = [];
		const walk = (d) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) walk(p);
				else {
					const data = fs.readFileSync(p);
					const r = path.relative(dir, p).replace(/\\/g, "/");
					files.push({ path: r, url: `${id}/${manifest.version}/${r}`, sha256: createHash("sha256").update(data).digest("hex") });
					write(`dist/plugins/${id}/${manifest.version}/${r}`, data.toString("utf8"));
				}
			}
		};
		walk(dir);
		const entry = { id, name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author, isolation: manifest.isolation ?? "worker", files };
		write(`dist/plugins/${id}/${manifest.version}/entry.json`, JSON.stringify(entry, null, 2) + "\n");
		const regFile = "dist/plugins/registry.json";
		const reg = exists(regFile) ? JSON.parse(read(regFile)) : { plugins: [] };
		reg.plugins = [...reg.plugins.filter((p) => !(p.id === id && p.version === manifest.version)), entry];
		write(regFile, JSON.stringify(reg, null, 2) + "\n");
		report();
		console.log("Sign the entry (minisign) and host dist/plugins/ on any static host; list registry.json in app.config.ts plugins.registries.");
	} else die("fw plugin <new <id>|pack <id>>", 2);
}

// ---------- sdk ----------
function sdk() {
	const ids = new Set();
	const walk = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) walk(p);
			else if (/\.ts$/.test(e.name)) for (const m of read(p).matchAll(/\bid:\s*"([a-z][\w]*\.[\w.]+)"/g)) ids.add(m[1]);
		}
	};
	walk("src");
	const slug = identity().app.slug;
	write("packages/plugin-sdk/package.json", JSON.stringify({ name: `@${slug}/plugin-sdk`, version: identity().app.version, types: "index.d.ts", main: "index.js", type: "module" }, null, 2) + "\n");
	write("packages/plugin-sdk/index.js", "export const definePlugin = (fn) => fn;\n");
	write(
		"packages/plugin-sdk/index.d.ts",
		`// GENERATED by \`pnpm fw sdk build\`. Types for plugins of ${identity().app.name}.\nexport type CommandId =\n${[...ids].sort().map((i) => `\t| "${i}"`).join("\n")}\n\t| (string & {});\n\nexport interface PluginContext {\n\tid: string;\n\tcommands: { handle(id: CommandId, fn: (args: any) => unknown): { dispose(): void }; run<R = unknown>(id: CommandId, args?: Record<string, unknown>): Promise<R> };\n\tnotify: { toast(text: string, kind?: "info" | "success" | "warning" | "error"): Promise<void>; send(spec: { title: string; body?: string; kind?: string; route?: string }): Promise<string> };\n\tsettings: { get<T = unknown>(key: string): T; set(key: string, value: unknown): Promise<void> };\n\tstorage: { get<T = unknown>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> };\n\tvault: { readText(path: string): Promise<string>; write(path: string, text: string): Promise<void>; list(dir?: string, o?: { recursive?: boolean; glob?: string }): Promise<{ name: string; path: string; dir: boolean }[]>; current(): Promise<{ name: string; readonly: boolean } | null> };\n\tstatusbar: { item(id: string): { text: string; tooltip: string } };\n\tevents: { on(name: string, fn: (payload: any) => void): { dispose(): void }; emit(name: string, payload?: unknown): Promise<void> };\n\tlog: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };\n}\n\nexport declare function definePlugin(fn: (ctx: PluginContext) => void | Promise<void>): typeof fn;\n`
	);
	report();
}

// ---------- strip ----------
function strip() {
	let cfg = read("app.config.ts");
	cfg = cfg.replace(/labs: true/, "labs: false").replace(/samples: true/, "samples: false");
	write("app.config.ts", cfg);
	write("src/app/modules/index.ts", `import type { ModuleDefinition } from "$fanwit";\n\n/** Your compile time modules. \`pnpm fw add module <id>\` appends here. */\nexport const appModules: ModuleDefinition[] = [];\n`);
	remove("src/app/modules/hello");
	remove("src/app/modules/notes");
	remove("plugins/word-count");
	remove("plugins/nord-ish");
	report();
	console.log("Labs and samples removed; every system stays. Developer tools and the manual remain (features in app.config.ts).");
}

// ---------- eject / upgrade ----------
function hashFile(p) {
	return createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);
}
function coreFiles(base = ROOT) {
	const out = [];
	const walk = (d) => {
		for (const e of fs.readdirSync(path.join(base, d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) walk(p);
			else out.push(p);
		}
	};
	for (const d of ["src/fanwit", "src-tauri/src/fanwit"]) if (fs.existsSync(path.join(base, d))) walk(d);
	return out;
}
function lock() {
	const lines = [`# Template version and core file hashes; used by \`fw upgrade\`.`, `template = ${JSON.stringify(identity().app.version)}`, "", "[files]"];
	for (const f of coreFiles()) lines.push(`${JSON.stringify(f)} = "${hashFile(abs(f))}"`);
	write(".fanwit/lock.toml", lines.join("\n") + "\n");
	report();
}
function eject() {
	const [, file] = args;
	if (!file || !exists(file) || !file.startsWith("src/fanwit/")) die("fw eject <src/fanwit/...file>", 2);
	const target = file.replace("src/fanwit/", "src/app/overrides/");
	write(target, read(file));
	const ej = exists(".fanwit/ejected.txt") ? read(".fanwit/ejected.txt") : "";
	if (!ej.includes(file)) write(".fanwit/ejected.txt", ej + file + "\n");
	report();
	console.log(`Import ${target} instead of the core file; fw upgrade will never overwrite it.`);
}
function upgrade() {
	const from = flag("from");
	if (!from || !fs.existsSync(from)) die("fw upgrade --from <path to a newer template checkout>", 2);
	if (!exists(".fanwit/lock.toml")) die("no .fanwit/lock.toml; run fw lock on the original template first");
	const base = parseToml(read(".fanwit/lock.toml")).files ?? {};
	const ejected = exists(".fanwit/ejected.txt") ? read(".fanwit/ejected.txt").split("\n").filter(Boolean) : [];
	const conflicts = [];
	for (const f of coreFiles(from)) {
		if (ejected.includes(f)) continue;
		const theirs = path.join(from, f);
		const ours = abs(f);
		const theirsHash = hashFile(theirs);
		if (!fs.existsSync(ours)) {
			write(f, fs.readFileSync(theirs, "utf8"));
			continue;
		}
		const oursHash = hashFile(ours);
		if (oursHash === theirsHash) continue;
		if (base[f] === oursHash) write(f, fs.readFileSync(theirs, "utf8")); // unchanged locally: take theirs
		else if (base[f] === theirsHash) continue; // only we changed it
		else {
			conflicts.push(f);
			write(f + ".theirs", fs.readFileSync(theirs, "utf8"));
		}
	}
	report();
	if (conflicts.length) console.log(`\nConflicts (both changed; theirs written next to yours as .theirs):\n${conflicts.map((c) => `  ${c}`).join("\n")}`);
}

// ---------- docs ----------
function docs() {
	const [, sub] = args;
	if (sub === "check") {
		const pages = new Set();
		const walk = (d) => {
			for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
				const p = `${d}/${e.name}`;
				if (e.isDirectory()) walk(p);
				else if (e.name.endsWith(".md")) pages.add(p.replace(/^docs\//, "").replace(/\.md$/, ""));
			}
		};
		walk("docs");
		for (const g of ["reference/commands", "reference/settings", "reference/menu-locations", "reference/views", "reference/window-kinds", "reference/context-keys", "reference/keybindings"]) pages.add(g);
		const problems = [];
		const scan = (d) => {
			for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
				const p = `${d}/${e.name}`;
				if (e.isDirectory()) scan(p);
				else if (/\.(ts|svelte|md)$/.test(e.name)) {
					const t = read(p);
					for (const m of t.matchAll(/manual:\/\/([\w/-]+)/g)) if (!pages.has(m[1]) && !pages.has(`guides/${m[1]}`)) problems.push(`${p}: broken link manual://${m[1]}`);
					for (const m of t.matchAll(/help:\s*"([\w/-]+)/g)) if (!pages.has(m[1]) && !pages.has(`guides/${m[1]}`)) problems.push(`${p}: help page "${m[1]}" missing`);
				}
			}
		};
		scan("src");
		scan("docs");
		if (problems.length) {
			console.error(problems.join("\n"));
			process.exit(1);
		}
		console.log(`docs ok (${pages.size} pages)`);
	} else if (sub === "build") run("pnpm", ["build"]);
	else if (sub === "serve") run("pnpm", ["dev", "--", "--open", "/?link=fanwit://run/manual.open"]);
	else die("fw docs <check|build|serve>", 2);
}

// ---------- create ----------
function create() {
	const [, dir] = args;
	if (!dir) die("fw create <dir>", 2);
	const target = path.resolve(dir);
	if (fs.existsSync(target) && fs.readdirSync(target).length) die(`${dir} is not empty`);
	const files = execSync("git ls-files", { cwd: ROOT }).toString().split("\n").filter(Boolean);
	for (const f of files) {
		const out = path.join(target, f);
		fs.mkdirSync(path.dirname(out), { recursive: true });
		fs.copyFileSync(path.join(ROOT, f), out);
	}
	console.log(`Copied ${files.length} files to ${dir} (without .git). Next:\n  cd ${dir}\n  pnpm install\n  pnpm fw rename\n  pnpm tauri dev`);
}

function run(cmd, a) {
	const r = spawnSync(cmd, a, { cwd: ROOT, stdio: "inherit", shell: true });
	process.exitCode = r.status ?? 1;
}

// ---------- dispatch ----------
const HELP = `fw: Fanwit developer CLI

  fw create <dir>                     copy the template (no .git) and print next steps
  fw rename [--name --slug --dev --id --scheme --yes]
  fw version <patch|minor|major|pre [tag]|set x.y.z|pop|peek> [--tag] [--changelog]
  fw add <module|command|view|window|setting|menu-location|menu-kind|layout-node|theme|migration|rust-command|status-item> <id>
  fw icons <logo.png|svg>             tauri icon + favicon
  fw dev [--web]                      desktop dev, or the web build with the BrowserHost
  fw build [--desktop|--web|--all]
  fw doctor                           toolchains, capabilities, CSP, presets, host boundary
  fw schema                           JSON schemas for TOML files (+ .taplo.toml)
  fw layout validate <file> | preset <name> <workspace.toml>
  fw plugin new <id> | pack <id>
  fw sdk build                        typed plugin SDK for this app
  fw strip                            remove Labs and samples, keep the systems
  fw lock | eject <file> | upgrade --from <dir>
  fw docs <check|build|serve>
  fw test [unit|e2e|native]
  fw release <patch|minor|major>      bump, changelog, tag

Every command accepts --dry-run.`;

const [cmd, sub, third] = args;
switch (cmd) {
	case "create":
		create();
		break;
	case "rename":
		await rename();
		break;
	case "version":
		version();
		break;
	case "add":
		if (!GEN[sub] || !third) die(`fw add <${Object.keys(GEN).join("|")}> <id>`, 2);
		GEN[sub](third, args[3]);
		report();
		break;
	case "icons":
		if (!sub) die("fw icons <logo>", 2);
		run("pnpm", ["tauri", "icon", sub]);
		if (sub.endsWith(".svg")) write("static/favicon.svg", fs.readFileSync(sub, "utf8"));
		report();
		break;
	case "dev":
		run("pnpm", has("web") ? ["dev", "--", "--open"] : ["tauri", "dev"]);
		break;
	case "build":
		if (has("web") || has("all")) run("pnpm", ["build"]);
		if (!has("web") || has("all")) run("pnpm", ["tauri", "build"]);
		break;
	case "doctor":
		doctor();
		break;
	case "schema":
		schema();
		break;
	case "layout":
		layout();
		break;
	case "plugin":
		await plugin();
		break;
	case "sdk":
		sdk();
		break;
	case "strip":
		strip();
		break;
	case "lock":
		lock();
		break;
	case "eject":
		eject();
		break;
	case "upgrade":
		upgrade();
		break;
	case "docs":
		docs();
		break;
	case "test":
		if (!sub || sub === "unit") run("pnpm", ["test"]);
		if (sub === "e2e") run("pnpm", ["test:e2e"]);
		if (sub === "native") run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
		break;
	case "release": {
		args.splice(0, 1, "version");
		args.push("--changelog", "--tag");
		version();
		if (!DRY) console.log("Push the tag to run the release workflow: git push --follow-tags");
		break;
	}
	default:
		console.log(HELP);
		if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 2;
}
