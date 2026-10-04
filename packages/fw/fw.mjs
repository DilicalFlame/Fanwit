#!/usr/bin/env node
/**
 * fw: the Fanwit developer CLI (Section 15.2). Run with `pnpm fw <command>`.
 * Every command supports --dry-run and prints the files it changes. TOML and Cargo edits are
 * line level, so comments and formatting survive (defect D7).
 */
import { execSync, spawnSync } from "node:child_process";
import { createHash, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseToml } from "smol-toml";

// FW_ROOT points the CLI at another checkout (fw.test.mjs uses a temp copy)
const ROOT = process.env.FW_ROOT ? path.resolve(process.env.FW_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
		// src/app/modules/index.ts finds every */module.ts by glob: nothing to register
		write(`docs/app/guides/${id}.md`, `---\ntitle: ${pascal(id)}\nsection: Guides\n---\n# ${pascal(id)}\n\nDescribe what the ${id} module does.\n\n<Callout kind="why">\n\nWhy it exists and why it works this way: the problem it solves for your users.\n\n</Callout>\n\n## Using it\n\nStep by step.\n`);
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
	// the plugin and CSS sandboxes rely on these: no remote origins, no eval or inline script
	const cspRaw = conf.app?.security?.csp;
	const csp = typeof cspRaw === "string" ? Object.fromEntries(cspRaw.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v.join(" ")])) : (cspRaw ?? {});
	const remote = Object.entries(csp).flatMap(([d, v]) => String(v).split(/\s+/).filter((t) => /^(\*|https?:$|wss?:|https?:\/\/(?![\w*-]+\.localhost$))/.test(t)).map((t) => `${d} ${t}`));
	const unsafeScript = String(csp["script-src"] ?? "").match(/'unsafe-(eval|inline)'/g) ?? [];
	ok("CSP configured (D10)", !!cspRaw && !remote.length && !unsafeScript.length, [...remote, ...unsafeScript.map((t) => `script-src ${t}`)].join(", "));
	const webCsp = /http-equiv="Content-Security-Policy"[^>]*img-src[^>]*font-src/.test(read("src/app.html"));
	ok("web CSP closes remote images and fonts", webCsp, webCsp ? "" : "src/app.html needs its CSP <meta>");
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
			else if (/\.(ts|svelte)$/.test(e.name) && !p.startsWith("src/fanwit/host") && /from "@tauri-apps\//.test(read(p)) && !/startup\.svelte\.ts$/.test(p)) offenders.push(p);
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
	// every presets/ folder: the core's and those modules ship (src/app/showcase/<part>/presets)
	const presetDirs = [];
	const findPresets = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) if (e.isDirectory()) (e.name === "presets" ? presetDirs.push(`${d}/${e.name}`) : findPresets(`${d}/${e.name}`));
	};
	findPresets("src");
	for (const d of presetDirs)
		for (const f of fs.readdirSync(abs(d)).filter((x) => x.endsWith(".toml"))) {
			const doc = parseToml(read(`${d}/${f}`));
			const missing = Object.values(doc.pane ?? {}).map((p) => p.view).filter((v) => !views.has(v));
			ok(`preset ${f} views`, !missing.length, missing.join(", "));
		}
	// bundled plugins: manifests parse, files exist, Rust halves are built
	for (const id of pluginIds()) {
		let m;
		try {
			m = pluginManifest(id);
		} catch (e) {
			ok(`plugin ${id} manifest`, false, e.message.split("\n")[0]);
			continue;
		}
		const missing = [...(m.contributes?.styles ?? []), ...(m.contributes?.themes ?? []), ...(m.contributes?.views ?? []).map((v) => v.entry ?? (v.ui === "iframe" ? "<no entry>" : null)).filter(Boolean)].filter((f) => !exists(`plugins/${id}/${f}`));
		if (m.runtime === "wasm" && !exists(`plugins/${id}/${m.entry ?? "plugin.wasm"}`)) missing.push(`${m.entry ?? "plugin.wasm"} (pnpm fw plugin build ${id})`);
		if (m.runtime === "sidecar" && !exists(`plugins/${id}/native/Cargo.toml`)) missing.push("native/Cargo.toml");
		if (m.runtime === "sidecar" && exists(`plugins/${id}/native/Cargo.toml`) && !read(`plugins/${id}/native/Cargo.toml`).includes(`name = "fanwit-plugin-${id}"`)) missing.push(`binary named fanwit-plugin-${id}`);
		ok(`plugin ${id}`, m.id === id && !missing.length, m.id !== id ? `id "${m.id}" differs from its folder` : missing.join(", "));
	}
	// Installer Kit (Section 16.15): pinned downloads; unsigned installers trip SmartScreen and Gatekeeper
	if (exists("installer.toml")) {
		const steps = parseToml(read("installer.toml")).step ?? [];
		const unpinned = steps.flatMap((s) => Object.entries(s.download ?? {}).filter(([, f]) => !/^[0-9a-f]{64}$/i.test(f.sha256 ?? "")).map(([t]) => `${s.id}[${t}]`));
		ok("installer downloads pinned by SHA-256", !unpinned.length, unpinned.join(", "));
		const w = conf.bundle?.windows ?? {};
		const unsigned = process.platform === "win32" ? !w.certificateThumbprint && !w.signCommand : process.platform === "darwin" ? !process.env.APPLE_SIGNING_IDENTITY && !conf.bundle?.macOS?.signingIdentity : false;
		if (unsigned) rows.push(`warn installer signing: no ${process.platform === "win32" ? "bundle.windows.certificateThumbprint or signCommand" : "APPLE_SIGNING_IDENTITY"}; release installers will be unsigned`);
	}
	console.log(rows.join("\n"));
	if (rows.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
}

// ---------- schema ----------
function schema() {
	const node = { type: "object", required: ["type"], properties: { type: { enum: ["split", "tabs", "stack", "grid"], description: "Node type, or a custom type registered with defineLayoutNode" }, dir: { enum: ["row", "column"] }, children: { type: "array", items: { type: "string" } }, sizes: { type: "array", items: { type: ["number", "string"] } }, panes: { type: "array", items: { type: "string" } }, active: { type: "string" }, strip: { enum: ["top", "bottom", "left", "right", "hidden"] }, title: { type: "string" }, icon: { type: "string" }, locked: { type: "boolean" }, closable: { type: "boolean", description: "false: its tabs cannot be closed" }, columns: { type: "string" }, rows: { type: "string" }, gap: { type: ["number", "string"] } } };
	const region = { type: "object", additionalProperties: false, properties: { node: { type: "string" }, containers: { type: "array", items: { type: "string" } }, size: { type: ["string", "number"] }, visible: { type: "boolean" }, collapsible: { type: "boolean" }, side: { type: "string" }, maximized: { type: "boolean" } } };
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
			pane: { type: "object", additionalProperties: { type: "object", required: ["view"], additionalProperties: false, properties: { view: { type: "string", examples: [...new Set(views)].sort() }, props: { type: "object" }, title: { type: "string" }, icon: { type: "string" }, pinned: { type: "boolean" }, preview: { type: "boolean" }, collapsed: { type: "boolean" }, area: { type: "string" }, group: { type: "string", description: "Tab group colour" } } } },
			float: { type: "object", additionalProperties: { type: "object", required: ["window", "pane", "rect"], additionalProperties: false, properties: { window: { type: "string" }, pane: { type: "string" }, rect: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 }, anchor: { type: "string" }, snap: { type: "boolean" }, collapsed: { type: "boolean" }, opacity: { type: "number", minimum: 0, maximum: 1 }, origin: { type: "string" } } } },
			drawer: { type: "object" },
			overlay: { type: "object" }
		}
	};
	const keyStr = { type: "string", description: 'Keys, e.g. "mod+shift+p" or a chord "mod+k mod+s"' };
	const keys = { $schema: "http://json-schema.org/draft-07/schema#", title: "Fanwit keys.toml", type: "object", additionalProperties: false, properties: { bind: { type: "array", items: { type: "object", required: ["command"], additionalProperties: false, properties: { key: keyStr, command: { type: "string", pattern: "^-?[\\w.-]+$", description: 'Command id; "-id" removes a lower binding', examples: commandIds() }, when: { type: "string", description: "Context key expression" }, args: { type: "object" }, global: { type: "boolean", description: "OS wide shortcut (desktop)" }, mac: keyStr, win: keyStr, linux: keyStr, web: keyStr } } } } };
	// op mirrors PatchOp in src/fanwit/menus/menus.svelte.ts
	const ops = /type PatchOp = ([^;]+);/.exec(read("src/fanwit/menus/menus.svelte.ts"))[1].match(/"[\w]+"/g).map((x) => JSON.parse(x));
	const menus = { $schema: "http://json-schema.org/draft-07/schema#", title: "Fanwit menus.toml", type: "object", additionalProperties: false, properties: { patch: { type: "array", items: { type: "object", required: ["location", "op", "item"], additionalProperties: false, properties: { location: { type: "string" }, op: { enum: ops }, item: { type: ["string", "object"] }, before: { type: "string" }, after: { type: "string" }, group: { type: "string" }, label: { type: "string" }, icon: { type: "string" }, props: { type: "object" }, when: { type: "string", description: "Context key expression" } } } }, location: { type: "array", items: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string" }, description: { type: "string" }, target: { type: "string" }, samples: { type: "array", items: { type: "object" } } } } } } };
	write("schemas/workspace.schema.json", JSON.stringify(layout, null, 2) + "\n");
	write("schemas/keys.schema.json", JSON.stringify(keys, null, 2) + "\n");
	write("schemas/menus.schema.json", JSON.stringify(menus, null, 2) + "\n");
	// settings come from the real definitions (types, ranges, enums), which only the app can load
	if (!DRY) execSync("pnpm exec vitest run src/fanwit/settings/schema.test.ts", { cwd: ROOT, stdio: "inherit", env: { ...process.env, FW_WRITE_SCHEMAS: "1" } });
	changed.push("update schemas/settings.schema.json");
	write(".taplo.toml", `# Schema associations for Even Better TOML (Taplo)\n[[rule]]\ninclude = ["**/workspace.toml", "src/fanwit/layout/presets/*.toml"]\n[rule.schema]\npath = "./schemas/workspace.schema.json"\n\n[[rule]]\ninclude = ["**/keys.toml"]\n[rule.schema]\npath = "./schemas/keys.schema.json"\n\n[[rule]]\ninclude = ["**/menus.toml"]\n[rule.schema]\npath = "./schemas/menus.schema.json"\n\n[[rule]]\ninclude = ["**/settings.toml"]\n[rule.schema]\npath = "./schemas/settings.schema.json"\n`);
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
// Templates for `fw plugin new`. One plugin.toml grammar for every kind; the runtime decides
// where code runs (worker JS, WASM in a worker, or a native sidecar process).
const PLUGIN_TPL = {
	manifest({ id, kind, runtime, ui }) {
		const c = camel(id);
		const head = `id = "${id}"\nname = "${pascal(id).replace(/([a-z])([A-Z])/g, "$1 $2")}"\nversion = "0.1.0"\nauthor = ""\ndescription = ""\napp = ">=${identity().app.version}"\n`;
		if (kind === "appearance") return `# Appearance plugin: data only, no code, no permissions.\n${head}category = "appearance"\nicon = "palette"\n\n[contributes]\nstyles = ["styles.css"]\n`;
		const rt = runtime === "wasm" ? `runtime = "wasm"\nentry = "plugin.wasm"\n` : runtime === "sidecar" ? `runtime = "sidecar"\nentry = "native"\n` : `entry = "main.js"\n`;
		const perms = runtime === "sidecar" ? `permissions = ["sidecar:${id}"]\n` : `permissions = []\n`;
		const view =
			ui === "widgets"
				? `\n[[contributes.views]]\nid = "${c}.panel"\ntitle = "${pascal(id)}"\nicon = "puzzle"\nui = "widgets"\nregions = ["sidebar"]\n`
				: ui === "iframe"
					? `\n[[contributes.views]]\nid = "${c}.page"\ntitle = "${pascal(id)}"\nicon = "puzzle"\nui = "iframe"\nentry = "ui.html"\n`
					: "";
		return `${head}category = "feature"\n${rt}# starts on its first command or view; add "onStartupFinished" or "onEvent:<name>" if it must react earlier\nactivation = []\n${perms}${view}\n[[contributes.commands]]\nid = "${c}.hello"\ntitle = "Hello from ${pascal(id)}"\ncategory = "${pascal(id)}"\n`;
	},
	js({ id, ui }) {
		const c = camel(id);
		const widgets = [
			"",
			"\tlet clicks = 0;",
			"\tconst draw = () =>",
			`\t\tctx.ui.render("${c}.panel", {`,
			'\t\t\ttype: "stack",',
			"\t\t\tchildren: [",
			'\t\t\t\t{ type: "text", text: `Clicked ${clicks} times`, size: "lg" },',
			'\t\t\t\t{ type: "button", label: "Click", action: "click", variant: "primary" }',
			"\t\t\t]",
			"\t\t});",
			`\tctx.ui.on("${c}.panel", (action) => {`,
			'\t\tif (action === "click") clicks++;',
			"\t\tdraw();",
			"\t});",
			"\tdraw();",
			""
		].join("\n");
		return `// Runs in a Web Worker: no DOM, no IPC. ctx is a permission checked proxy to the app.\nimport { definePlugin } from "@fanwit/plugin-sdk";\n\nexport default definePlugin((ctx) => {\n\tctx.commands.handle("${c}.hello", () => ctx.notify.toast("Hello from ${id}"));\n${ui === "widgets" ? widgets : ""}});\n`;
	},
	rust({ id, ui }, sidecar) {
		const c = camel(id);
		const T = pascal(id);
		const draw =
			ui === "widgets"
				? `\n        host.render("${c}.panel", json!({ "type": "stack", "children": [\n            { "type": "text", "text": "Hello from Rust", "size": "lg" },\n            { "type": "button", "label": "Say hello", "action": "hello", "variant": "primary" }\n        ]}));`
				: "";
		const uiFn = ui === "widgets" ? `\n\n    fn ui(&mut self, host: &mut Host, _view: &str, action: &str, _value: &Value) {\n        if action == "hello" {\n            host.toast("Hello from ${id}");\n        }\n    }` : "";
		const tail = sidecar ? `fn main() {\n    fanwit_plugin::run_stdio::<${T}>();\n}` : `fanwit_plugin::export_wasm!(${T});`;
		return `use fanwit_plugin::{json, Host, Plugin, Value};\n\n#[derive(Default)]\nstruct ${T};\n\nimpl Plugin for ${T} {\n    fn activate(&mut self, host: &mut Host, _settings: &Value) {\n        host.handle("${c}.hello");${draw}\n    }\n\n    fn invoke(&mut self, host: &mut Host, command: &str, _args: &Value) -> Result<Value, String> {\n        match command {\n            "${c}.hello" => {\n                host.toast("Hello from ${id}");\n                Ok(json!(null))\n            }\n            _ => Err(format!("unknown command {command}")),\n        }\n    }${uiFn}\n}\n\n${tail}\n`;
	},
	cargo(id, sidecar) {
		const name = sidecar ? `fanwit-plugin-${id}` : id;
		if (sidecar) return `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n# a member of the app's cargo workspace, so the binary lands next to the app executable\nworkspace = "../../../src-tauri"\n\n[[bin]]\n# the app runs exactly fanwit-plugin-<plugin id>\nname = "${name}"\npath = "src/main.rs"\n\n[dependencies]\nfanwit-plugin = { path = "../../../packages/fanwit-plugin-rs" }\n`;
		return `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n\n# built on its own for wasm32: pnpm fw plugin build ${id} writes ../plugin.wasm\n[workspace]\n\n[lib]\ncrate-type = ["cdylib", "rlib"]\n\n[dependencies]\nfanwit-plugin = { path = "../../../packages/fanwit-plugin-rs" }\n\n[profile.release]\nopt-level = "z"\nlto = true\nstrip = true\npanic = "abort"\n`;
	},
	html(id) {
		return `<!doctype html>\n<html>\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<!-- window.fanwit is the plugin ctx; the app theme arrives as CSS variables -->\n\t\t<script src="_fw/ui.js"></script>\n\t\t<style>\n\t\t\tbody { margin: 0; padding: 16px; background: var(--background); color: var(--foreground); font: 13px var(--font-sans, system-ui); }\n\t\t\tbutton { background: var(--primary); color: var(--primary-foreground); border: 0; border-radius: 6px; padding: 6px 12px; }\n\t\t</style>\n\t</head>\n\t<body>\n\t\t<h1>${pascal(id)}</h1>\n\t\t<button id="hi">Say hello</button>\n\t\t<script src="ui.js"></script>\n\t</body>\n</html>\n`;
	}
};

const pluginIds = () => (exists("plugins") ? fs.readdirSync(abs("plugins"), { withFileTypes: true }).filter((e) => e.isDirectory() && exists(`plugins/${e.name}/plugin.toml`)).map((e) => e.name) : []);
const pluginManifest = (id) => parseToml(read(`plugins/${id}/plugin.toml`));
const sidecarIds = () => pluginIds().filter((id) => pluginManifest(id).runtime === "sidecar");

/** Build a bundled plugin's Rust half: WASM into plugin.wasm, or the sidecar binary. */
function buildPlugin(id, release = false) {
	const m = pluginManifest(id);
	if (m.runtime === "wasm") {
		const toml = `plugins/${id}/wasm/Cargo.toml`;
		if (!exists(toml)) die(`plugins/${id}: runtime = "wasm" but no wasm/Cargo.toml`);
		const crate = parseToml(read(toml)).package.name.replace(/-/g, "_");
		run("cargo", ["build", "--manifest-path", toml, "--release", "--target", "wasm32-unknown-unknown"]);
		if (process.exitCode) die("cargo failed (missing target? rustup target add wasm32-unknown-unknown)");
		const entry = m.entry ?? "plugin.wasm";
		changed.push(`update plugins/${id}/${entry}`);
		if (!DRY) fs.copyFileSync(abs(`plugins/${id}/wasm/target/wasm32-unknown-unknown/release/${crate}.wasm`), abs(`plugins/${id}/${entry}`));
	} else if (m.runtime === "sidecar") {
		run("cargo", ["build", "--manifest-path", "src-tauri/Cargo.toml", "-p", `fanwit-plugin-${id}`, ...(release ? ["--release"] : [])]);
		if (process.exitCode) die("cargo failed");
	}
}

/** Release builds ship every sidecar next to the app executable (Tauri externalBin wants target triple names). */
function sidecarBundleConfig() {
	const ids = sidecarIds();
	if (!ids.length) return null;
	const triple = /host: (\S+)/.exec(execSync("rustc -vV").toString())[1];
	const ext = process.platform === "win32" ? ".exe" : "";
	const dir = "src-tauri/target/plugin-bin";
	fs.mkdirSync(abs(dir), { recursive: true });
	for (const id of ids) {
		buildPlugin(id, true);
		fs.copyFileSync(abs(`src-tauri/target/release/fanwit-plugin-${id}${ext}`), abs(`${dir}/fanwit-plugin-${id}-${triple}${ext}`));
	}
	const conf = `${dir}/tauri.plugins.conf.json`;
	fs.writeFileSync(abs(conf), JSON.stringify({ bundle: { externalBin: ids.map((id) => `target/plugin-bin/fanwit-plugin-${id}`) } }, null, "\t"));
	return conf;
}

async function plugin() {
	const [, sub, id] = args;
	if (sub === "new") {
		if (!id || !/^[a-z0-9-]+$/.test(id)) die("fw plugin new <id> [--kind feature|appearance] [--runtime js|wasm|sidecar] [--ui none|widgets|iframe]", 2);
		const o = { id, kind: flag("kind", "feature"), runtime: flag("runtime", "js"), ui: flag("ui", "none") };
		if (!["feature", "appearance"].includes(o.kind) || !["js", "wasm", "sidecar"].includes(o.runtime) || !["none", "widgets", "iframe"].includes(o.ui)) die("unknown --kind, --runtime or --ui", 2);
		const dir = `plugins/${id}`;
		if (exists(dir)) die(`${dir} already exists`);
		write(`${dir}/plugin.toml`, PLUGIN_TPL.manifest(o));
		if (o.kind === "appearance") {
			write(`${dir}/styles.css`, `/* Any CSS; it is sanitized (no remote @import or url()). Scope it to a layout preset or a view:\n   html[data-preset="vscode"] ...   [data-fw-view="notes.editor"] ...\n   Theme tokens are CSS variables: --background, --foreground, --primary, --border... */\nhtml[data-preset="vscode"] [data-fw-region="sidebar"] {\n\tbackground: color-mix(in oklch, var(--primary) 6%, var(--sidebar));\n}\n`);
		} else if (o.runtime === "js") {
			write(`${dir}/main.js`, PLUGIN_TPL.js(o));
		} else {
			const sidecar = o.runtime === "sidecar";
			const crate = sidecar ? "native" : "wasm";
			write(`${dir}/${crate}/Cargo.toml`, PLUGIN_TPL.cargo(id, sidecar));
			write(`${dir}/${crate}/src/${sidecar ? "main" : "lib"}.rs`, PLUGIN_TPL.rust(o, sidecar));
		}
		if (o.kind === "feature" && o.ui === "iframe") {
			write(`${dir}/ui.html`, PLUGIN_TPL.html(id));
			write(`${dir}/ui.js`, `// Runs in a sandboxed frame (no app access, no network). Use any framework; ship plain files.\ndocument.getElementById("hi").addEventListener("click", () => fanwit.commands.run("${camel(id)}.hello"));\n`);
		}
		write(`${dir}/README.md`, `# ${pascal(id)}\n\nWhat this plugin does, and why it needs each permission.\n`);
		report();
		const rust = o.kind === "feature" && o.runtime !== "js";
		console.log(`plugins/${id} ships with the app as a built-in plugin (off until turned on under Plugins > Built-in).${rust ? `\nBuild its Rust half with \`pnpm fw plugin build ${id}\`.` : ""}\nTo publish it for other apps: \`pnpm fw plugin pack ${id}\`.`);
	} else if (sub === "build") {
		const ids = id ? [id] : pluginIds().filter((x) => ["wasm", "sidecar"].includes(pluginManifest(x).runtime));
		for (const x of ids) {
			if (!exists(`plugins/${x}/plugin.toml`)) die(`no plugins/${x}`);
			buildPlugin(x, has("release"));
		}
		report();
	} else if (sub === "pack") {
		const dir = abs(`plugins/${id}`);
		if (!fs.existsSync(dir)) die(`no plugins/${id}`);
		const manifest = parseToml(fs.readFileSync(path.join(dir, "plugin.toml"), "utf8"));
		if (manifest.runtime === "sidecar") die("sidecar plugins run only when they ship with the app; they cannot be packed for a registry");
		const files = [];
		const walk = (d) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				const r = path.relative(dir, p).replace(/\\/g, "/");
				// the Rust sources and build output stay home; plugin.wasm is the artefact
				if (e.isDirectory()) {
					if (!["wasm", "native", "node_modules"].includes(r)) walk(p);
				} else if (r !== "part.toml" && !r.endsWith(".e2e.ts")) {
					const data = fs.readFileSync(p);
					const out = `dist/plugins/${id}/${manifest.version}/${r}`;
					files.push({ path: r, url: `${id}/${manifest.version}/${r}`, sha256: createHash("sha256").update(data).digest("hex") });
					changed.push(`create ${out}`);
					if (!DRY) (fs.mkdirSync(path.dirname(abs(out)), { recursive: true }), fs.writeFileSync(abs(out), data));
				}
			}
		};
		walk(dir);
		const entry = { id, name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author, category: manifest.category, runtime: manifest.runtime ?? "js", isolation: manifest.isolation ?? "worker", files };
		// same string as signedMessage() in src/fanwit/plugins/plugins.svelte.ts
		const keyFile = process.env.FW_PLUGIN_KEY;
		if (keyFile) entry.signature = cryptoSign(null, Buffer.from(JSON.stringify({ id, version: manifest.version, files: files.map((f) => ({ path: f.path, sha256: f.sha256 })) })), createPrivateKey(fs.readFileSync(path.resolve(keyFile)))).toString("base64");
		write(`dist/plugins/${id}/${manifest.version}/entry.json`, JSON.stringify(entry, null, 2) + "\n");
		const regFile = "dist/plugins/registry.json";
		const reg = exists(regFile) ? JSON.parse(read(regFile)) : { plugins: [] };
		reg.plugins = [...reg.plugins.filter((p) => !(p.id === id && p.version === manifest.version)), entry];
		write(regFile, JSON.stringify(reg, null, 2) + "\n");
		report();
		console.log(`${keyFile ? "Signed with FW_PLUGIN_KEY." : "UNSIGNED: set FW_PLUGIN_KEY to a key from `pnpm fw plugin keygen`."} Host dist/plugins/ on any static host; list registry.json in app.config.ts plugins.registries.`);
	} else if (sub === "keygen") {
		const out = path.resolve(id ?? "plugin-signing.key");
		if (fs.existsSync(out)) die(`${out} already exists`);
		const { publicKey, privateKey } = generateKeyPairSync("ed25519");
		fs.writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
		const pub = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64");
		console.log(`private key: ${out} (keep it secret, out of git; sign with FW_PLUGIN_KEY=${out})
public key:  ${pub}
Add the public key to app.config.ts plugins.trustedKeys.`);
	} else die("fw plugin <new <id> [--kind --runtime --ui] | build [id] [--release] | pack <id> | keygen [file]>", 2);
}

// ---------- sdk ----------
/** The widget tree types, copied from the app so the SDK never drifts. */
const widgetTypes = () => read("src/fanwit/plugins/widgets.ts").split("export const WIDGET_LIMITS")[0].replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
/** Every command-like id ("module.verbObject") declared in src, sorted. */
function commandIds() {
	const ids = new Set();
	const walk = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			const p = `${d}/${e.name}`;
			if (e.isDirectory()) walk(p);
			else if (/\.ts$/.test(e.name)) for (const m of read(p).matchAll(/\bid:\s*"([a-z][\w]*\.[\w.]+)"/g)) ids.add(m[1]);
		}
	};
	walk("src");
	return [...ids].sort();
}
function sdk() {
	const ids = commandIds();
	const slug = identity().app.slug;
	write("packages/plugin-sdk/package.json", JSON.stringify({ name: `@${slug}/plugin-sdk`, version: identity().app.version, types: "index.d.ts", main: "index.js", type: "module" }, null, 2) + "\n");
	write("packages/plugin-sdk/index.js", "export const definePlugin = (fn) => fn;\n");
	write(
		"packages/plugin-sdk/index.d.ts",
		`// GENERATED by \`pnpm fw sdk build\`. Types for plugins of ${identity().app.name}.\nexport type CommandId =\n${ids.map((i) => `\t| "${i}"`).join("\n")}\n\t| (string & {});\n\nexport interface PluginContext {\n\tid: string;\n\tcommands: { handle(id: CommandId, fn: (args: any) => unknown): { dispose(): void }; run<R = unknown>(id: CommandId, args?: Record<string, unknown>): Promise<R> };\n\tnotify: { toast(text: string, kind?: "info" | "success" | "warning" | "error"): Promise<void>; send(spec: { title: string; body?: string; kind?: string; route?: string }): Promise<string> };\n\tsettings: { get<T = unknown>(key: string): T; set(key: string, value: unknown): Promise<void> };\n\tstorage: { get<T = unknown>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> };\n\tvault: { readText(path: string): Promise<string>; write(path: string, text: string): Promise<void>; list(dir?: string, o?: { recursive?: boolean; glob?: string }): Promise<{ name: string; path: string; dir: boolean }[]>; current(): Promise<{ name: string; readonly: boolean } | null> };\n\tstatusbar: { item(id: string): { text: string; tooltip: string; command: string } };\n\t/** Widget views (ui = \"widgets\"): send a tree, hear what the user did. */\n\tui: { render(view: string, tree: Widget | null): Promise<void>; on(view: string, fn: (action: string, value: unknown) => void): { dispose(): void } };\n\tevents: { on(name: string, fn: (payload: any) => void): { dispose(): void }; emit(name: string, payload?: unknown): Promise<void> };\n\tlog: { info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };\n}\n\nexport declare function definePlugin(fn: (ctx: PluginContext) => void | Promise<void>): typeof fn;\n\n/** In a plugin iframe page (ui = \"iframe\") after <script src=\"_fw/ui.js\">. */\ndeclare global {\n\tinterface Window {\n\t\tfanwit: PluginContext & { onReady(fn: (ctx: PluginContext) => void): void };\n\t}\n}\n\n${widgetTypes()}`
	);
	report();
}

// ---------- strip ----------
// A part is a folder with a part.toml (or any plugins/<id>/ folder). Stripping moves it, plus the
// extra `paths` it lists, to .trash/<id>/ under the same repo relative paths; .trash/journal.json
// records every strip and restore so --undo can reverse the last one.
const TRASH = ".trash";
const SKIP_DIRS = new Set(["node_modules", ".git", TRASH, "target", ".svelte-kit", "build", "dist", "test-results", "gen"]);

function presentParts() {
	const out = new Map();
	const walk = (d) => {
		for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) {
			if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
			const dir = d ? `${d}/${e.name}` : e.name;
			if (fs.existsSync(abs(`${dir}/part.toml`))) {
				const t = parseToml(read(`${dir}/part.toml`));
				out.set(t.id, { id: t.id, title: t.title ?? t.id, kind: t.kind ?? "part", requires: t.requires ?? [], paths: [dir, ...(t.paths ?? [])] });
			} else walk(dir);
		}
	};
	walk("");
	// a bundled plugin is a part even without part.toml
	if (exists("plugins"))
		for (const e of fs.readdirSync(abs("plugins"), { withFileTypes: true })) {
			const dir = `plugins/${e.name}`;
			if (e.isDirectory() && ![...out.values()].some((p) => p.paths[0] === dir)) out.set(`plugin-${e.name}`, { id: `plugin-${e.name}`, title: e.name, kind: "plugin", requires: [], paths: [dir] });
		}
	return out;
}
function trashedParts() {
	const out = new Map();
	if (!exists(TRASH)) return out;
	for (const e of fs.readdirSync(abs(TRASH), { withFileTypes: true })) {
		const f = `${TRASH}/${e.name}/part.json`;
		if (e.isDirectory() && exists(f)) out.set(e.name, JSON.parse(read(f)));
	}
	return out;
}
const journal = () => (exists(`${TRASH}/journal.json`) ? JSON.parse(read(`${TRASH}/journal.json`)) : { ops: [] });
function saveJournal(j) {
	if (!DRY) write(`${TRASH}/journal.json`, JSON.stringify(j, null, 1) + "\n");
}
function move(from, to) {
	if (!exists(from)) return false;
	if (exists(to)) die(`${to} already exists; move it away first`);
	changed.push(`move ${from} -> ${to}`);
	if (DRY) return true;
	fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
	fs.renameSync(abs(from), abs(to));
	// drop folders the move left empty (src/app/showcase once its last part goes)
	for (let d = path.dirname(abs(from)); d.startsWith(ROOT) && d !== ROOT && !fs.readdirSync(d).length; d = path.dirname(d)) fs.rmdirSync(d);
	return true;
}
/** Move parts to the trash. Returns the moves made. */
function trashParts(list) {
	const moves = [];
	for (const p of list) {
		for (const from of p.paths) if (move(from, `${TRASH}/${p.id}/${from}`)) moves.push([from, `${TRASH}/${p.id}/${from}`]);
		if (!DRY) fs.mkdirSync(abs(`${TRASH}/${p.id}`), { recursive: true });
		if (!DRY) fs.writeFileSync(abs(`${TRASH}/${p.id}/part.json`), JSON.stringify(p, null, 1) + "\n");
	}
	return moves;
}
function untrashParts(list) {
	const moves = [];
	for (const p of list) {
		for (const to of p.paths) if (move(`${TRASH}/${p.id}/${to}`, to)) moves.push([`${TRASH}/${p.id}/${to}`, to]);
		if (!DRY) fs.rmSync(abs(`${TRASH}/${p.id}`), { recursive: true, force: true });
	}
	return moves;
}
function record(action, list, moves, edits = []) {
	const j = journal();
	j.ops.push({ n: (j.ops.at(-1)?.n ?? 0) + 1, at: new Date().toISOString(), action, parts: list, moves, edits });
	saveJournal(j);
}

function parts() {
	const here = presentParts();
	const gone = trashedParts();
	const rows = [...[...here.values()].map((p) => ({ ...p, state: "present" })), ...[...gone.values()].map((p) => ({ ...p, state: "trashed" }))].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
	if (!rows.length) return console.log("No parts.");
	const w = Math.max(...rows.map((r) => r.id.length));
	for (const r of rows) {
		const missing = r.state === "present" ? r.requires.filter((q) => !here.has(q)) : [];
		console.log(`  ${r.state === "present" ? "●" : "○"} ${r.id.padEnd(w)}  ${r.kind.padEnd(8)} ${r.title}${missing.length ? `  (needs ${missing.join(", ")})` : ""}`);
	}
	console.log(`\n● present  ○ in ${TRASH}/   strip with \`pnpm fw strip <id>\`, bring back with \`pnpm fw restore <id>\``);
}

function strip() {
	if (has("undo")) return undo();
	const here = presentParts();
	const ids = args.slice(1).filter((a) => !a.startsWith("--") && a !== flag("kind"));
	const bare = !ids.length && !has("showcase") && !has("kind") && !has("all");
	let want = bare || has("all") ? [...here.keys()] : has("showcase") ? [...here.values()].filter((p) => p.kind === "showcase").map((p) => p.id) : has("kind") ? [...here.values()].filter((p) => p.kind === flag("kind")).map((p) => p.id) : ids;
	for (const id of want) if (!here.has(id)) die(`no part "${id}" (see \`pnpm fw parts\`)`, 2);
	// parts that stay must not need a part that goes
	for (;;) {
		const set = new Set(want);
		const dependents = [...here.values()].filter((p) => !set.has(p.id) && p.requires.some((r) => set.has(r)));
		if (!dependents.length) break;
		// a group (--showcase, --kind, --all) takes what depends on it along; named parts ask first
		if (ids.length && !has("with-dependents")) die(`${dependents.map((d) => `${d.id} requires ${d.requires.filter((r) => set.has(r)).join(", ")}`).join("; ")}. Strip those too or pass --with-dependents.`);
		want = [...want, ...dependents.map((d) => d.id)];
	}
	if (!want.length) return console.log("Nothing to strip.");
	const list = want.map((id) => here.get(id));
	const edits = [];
	if (bare && exists("app.config.ts")) {
		const before = read("app.config.ts");
		const after = before.replace(/labs: true/, "labs: false");
		if (after !== before) (edits.push({ file: "app.config.ts", before }), write("app.config.ts", after));
	}
	const moves = trashParts(list);
	record("strip", list, moves, edits);
	report();
	if (!DRY) console.log(`Stripped ${list.map((p) => p.id).join(", ")}. \`pnpm fw strip --undo\` or \`pnpm fw restore <id>\` brings them back.`);
}

function restore() {
	const gone = trashedParts();
	const ids = has("all") ? [...gone.keys()] : args.slice(1).filter((a) => !a.startsWith("--"));
	if (!ids.length) die("fw restore <part...> | --all", 2);
	const want = new Set();
	const add = (id) => {
		if (want.has(id) || presentParts().has(id)) return;
		if (!gone.has(id)) die(`no part "${id}" in ${TRASH}/ (see \`pnpm fw parts\`)`, 2);
		want.add(id);
		for (const r of gone.get(id).requires) add(r);
	};
	ids.forEach(add);
	const list = [...want].map((id) => gone.get(id));
	const moves = untrashParts(list);
	record("restore", list, moves);
	report();
}

function undo() {
	const j = journal();
	const op = j.ops.pop();
	if (!op) return console.log("Nothing to undo.");
	if (op.action === "strip") {
		untrashParts(op.parts);
		for (const e of op.edits ?? []) write(e.file, e.before);
	} else trashParts(op.parts);
	saveJournal(j);
	report();
	if (!DRY) console.log(`Undid ${op.action} of ${op.parts.map((p) => p.id).join(", ")}.`);
}

async function trash() {
	const gone = trashedParts();
	if (sub === "empty") {
		if (!gone.size) return console.log("The trash is empty.");
		if (!has("yes")) {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			const ok = (await rl.question(`Delete ${[...gone.keys()].join(", ")} for good? [y/N] `)).trim().toLowerCase() === "y";
			rl.close();
			if (!ok) return;
		}
		remove(TRASH);
		return report();
	}
	if (!gone.size) return console.log("The trash is empty.");
	for (const p of gone.values()) console.log(`  ${p.id}  (${p.kind}) ${p.paths.join(", ")}`);
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
// Discovery is shared with the Vite plugin (src/fanwit/manual/discover.mjs), so the CLI, the app
// and the docs site agree on which pages and anchors exist.
async function docs() {
	const [, sub, name] = args;
	if (sub === "check") {
		const d = await import(pathToFileURL(abs("src/fanwit/manual/discover.mjs")).href);
		const sets = d.docsets(ROOT);
		const pages = sets.flatMap((s) => d.pagesOf(ROOT, s));
		const keys = new Set([...pages.map((p) => p.meta.key), ...sets.flatMap((s) => d.generatedIds(ROOT, s).map((id) => `${s.id}/${id}`))]);
		const anchors = new Map(pages.map((p) => [p.meta.key, new Set(p.meta.headings.map((h) => h.id))]));
		const problems = [];
		const check = (file, target, from, what) => {
			const r = d.resolveLink(target, keys, from);
			if (!r) problems.push(`${file}: ${what} "${target}" does not resolve`);
			else if (r.anchor && anchors.has(r.key) && !anchors.get(r.key).has(r.anchor)) problems.push(`${file}: ${what} "${target}": ${r.key} has no heading #${r.anchor}`);
		};
		const scan = (dir, from) => {
			for (const e of fs.readdirSync(abs(dir), { withFileTypes: true })) {
				const p = `${dir}/${e.name}`;
				// the manual's own source talks about link syntax in comments
				if (e.isDirectory()) p !== "src/fanwit/manual" && scan(p, from ?? (dir === "docs" ? e.name : undefined));
				else if (/\.(ts|svelte|md)$/.test(e.name)) {
					// in Markdown, links inside code are examples, not links
					const text = p.endsWith(".md") ? read(p).replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "") : read(p);
					for (const m of text.matchAll(/manual:\/\/([\w/-]+(?:#[\w-]+)?)/g)) check(p, m[1], from, "link");
					for (const m of text.matchAll(/help:\s*"([\w/#-]+)"/g)) check(p, m[1], from, "help page");
				}
			}
		};
		scan("src");
		scan("docs");
		for (const s of sets) for (const p of d.pathsOf(ROOT, s)) for (const key of p.pages) if (!keys.has(key)) problems.push(`${s.dir}/paths.toml: path "${p.id}" lists "${key.slice(s.id.length + 1)}", which is not a page`);
		// guides explain why before how: a <Callout kind="why"> or a "Why ..." heading
		for (const p of pages) if (p.meta.section === "Guides" && p.meta.kind === "manual" && !/<Callout kind="why"|^#{2,4}\s+Why\b/m.test(p.body)) problems.push(`${p.meta.file.slice(1)}: a guide needs a <Callout kind="why"> (or a "Why ..." heading) explaining why the feature works this way`);
		// docs must not outlive the code: repo paths they name exist, `pnpm fw <cmd>` is a real command
		const cliCommands = new Set([...read("packages/fw/fw.mjs").matchAll(/^\tcase "([\w-]+)":/gm)].map((m) => m[1]));
		for (const p of pages) {
			const file = p.meta.file.slice(1);
			for (const m of p.body.matchAll(/`((?:src|src-tauri|src-setup|packages|plugins|e2e|schemas|installer)\/[^`\s]+)`/g)) {
				const ref = m[1].replace(/[#:].*$/, "").replace(/\/$/, "");
				if (/[*<>{}$]/.test(ref)) continue; // patterns and placeholders
				// build output and generated files (git ignored) appear only after a build
				if (!exists(ref) && spawnSync("git", ["check-ignore", "-q", ref], { cwd: ROOT }).status !== 0) problems.push(`${file}: names \`${m[1]}\`, which does not exist`);
			}
			for (const m of p.body.matchAll(/pnpm fw ([a-z][\w-]*)/g)) if (!cliCommands.has(m[1])) problems.push(`${file}: \`pnpm fw ${m[1]}\` is not a fw command`);
		}
		// M10: every public symbol has a doc comment and an @example (Section 21.6.1)
		for (const s of sets.filter((x) => x.api)) {
			const { extractApi } = await import(pathToFileURL(abs("src/fanwit/manual/api.mjs")).href);
			const { symbols, undocumented } = await extractApi(ROOT, s.api);
			for (const name of undocumented) problems.push(`${s.api}: public symbol ${name} needs a doc comment with an @example`);
			if (!undocumented.length) console.log(`api ok (${symbols.length} public symbols in ${s.api}, all documented with examples)`);
		}
		if (problems.length) {
			console.error(problems.join("\n"));
			process.exit(1);
		}
		console.log(`docs ok (${sets.length} docsets, ${keys.size} pages)`);
	} else if (sub === "build") {
		// the docs site: this app on the web host with only the manual (vite --mode docs).
		// --version names its version folder (picker, banner); --base is the URL path it is served from
		process.env.FW_DOCS = "1";
		if (flag("version")) process.env.FW_DOCS_VERSION = flag("version");
		if (flag("base")) process.env.FW_DOCS_BASE = flag("base").replace(/\/$/, "");
		run("pnpm", ["exec", "vite", "build", "--mode", "docs"]);
		if (!process.exitCode) console.log("docs site written to build-docs (serve it from any static host)");
	} else if (sub === "publish") {
		// add build-docs to a multi version site: <site>/v/<version>/, versions.json, and a root
		// index that redirects to the latest release
		const site = name;
		const version = flag("version");
		if (!site || !version) die("fw docs publish <site dir> --version <x.y.z|next> [--from build-docs]", 2);
		const from = flag("from") ?? "build-docs";
		if (!exists(from)) die(`${from} does not exist: run fw docs build --version ${version} first`);
		const dest = `${site}/v/${version}`;
		remove(dest);
		if (!DRY) fs.cpSync(abs(from), abs(dest), { recursive: true });
		changed.push(`copy ${from} -> ${dest}`);
		const file = `${site}/versions.json`;
		const list = exists(file) ? JSON.parse(read(file)).versions ?? [] : [];
		const versions = sortVersions([...new Set([...list, version])]);
		const latest = versions.find((v) => v !== "next") ?? "next";
		write(file, JSON.stringify({ latest, versions }, null, "\t") + "\n");
		write(`${site}/index.html`, `<!doctype html><meta charset="utf-8"><title>Documentation</title><meta http-equiv="refresh" content="0; url=v/${latest}/"><script>location.replace("v/${latest}/" + location.search + location.hash)</script><a href="v/${latest}/">Documentation</a>\n`);
		if (exists(`${site}/v/${latest}/llms.txt`)) write(`${site}/llms.txt`, read(`${site}/v/${latest}/llms.txt`).replaceAll("](./", `](./v/${latest}/`));
		report();
	} else if (sub === "serve") run("pnpm", ["exec", "vite", "dev", "--mode", "docs", "--port", "3001", "--open"]);
	else if (sub === "new") {
		if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) die("fw docs new <id>   (lower case, e.g. user-guide)", 2);
		if (exists(`docs/${name}/docset.toml`)) die(`docs/${name} already exists`);
		write(`docs/${name}/docset.toml`, `title = "${pascal(name).replace(/([a-z])([A-Z])/g, "$1 $2")}"
icon = "book-open"
version = "app"               # the version in fanwit.app.toml
ship = "prod"                 # "dev": development builds only
web = false                   # true: part of the docs site (fw docs build)
sections = ["Getting started", "Guides", "Reference"]
reference = []                # generated pages: commands, settings, keybindings, views, ...
`);
		write(`docs/${name}/index.md`, `---
title: Introduction
section: Getting started
order: 1
---
# Introduction

What this manual covers, who it is for, and where to start.
`);
		report();
	} else die("fw docs <check|build|serve|new <id>|publish <site> --version <v>>", 2);
}

/** "next" first, then releases newest first (pre-releases after their release). */
function sortVersions(list) {
	const parts = (v) => v.split("-")[0].split(".").map((n) => Number(n) || 0);
	return [...list].sort((a, b) => {
		if (a === "next" || b === "next") return a === "next" ? -1 : 1;
		const [x, y] = [parts(a), parts(b)];
		for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
		return (a.includes("-") ? 1 : 0) - (b.includes("-") ? 1 : 0) || b.localeCompare(a);
	});
}

// ---------- installer (Chapter 16) ----------
const INST = "src-tauri/gen/installer";
const ENGINE = "fanwit-install";
const PRESETS = {
	classic: { artefacts: ["native"], scope: "user", pages: [] },
	branded: { artefacts: ["native", "setup", "scripts", "managers"], scope: "ask", pages: ["welcome", "license", "scope", "components", "options", "prereqs", "summary", "progress", "finish"] },
	"one-click": { artefacts: ["setup"], scope: "user", pages: ["progress"] },
	"dev-tool": { artefacts: ["native", "scripts", "managers"], scope: "user", pages: [] },
	enterprise: { artefacts: ["native"], scope: "machine", pages: [] },
	portable: { artefacts: ["portable"], scope: "user", pages: [] }
};
const STEP_TEMPLATES = {
	prereq: (id) => `[[step]]\nid = "${id}"\ntype = "prereq"\ntitle = "${id}"\nphases = ["bootstrap", "package", "firstRun"]   # earliest available wins\ndetect = { command = "${id} --version", parse = '(\\d+\\.\\d+\\.\\d+)', require = ">=1.0" }\nstrategies = ["existing", "sidecar", "download"]  # tried in order\nsidecar = "binaries/${id}"                       # fetched in the build phase from the download below\ninstall_to = "{tools}/${id}"\nexpose = "${id.toUpperCase()}_BIN"                          # later steps use {env.${id.toUpperCase()}_BIN}; never rely on PATH\nuninstall = "only-if-installed-by-us"\n\n[step.download.windows-x86_64]\nurl = "https://example.com/${id}-x86_64-pc-windows-msvc.zip"\nsha256 = ""                                     # required: the build fails without a pinned hash\nsize = "10 MB"\n`,
	download: (id) => `[[step]]\nid = "${id}"\ntype = "download"\ntitle = "Download ${id}"\nphases = ["bootstrap", "firstRun"]\ninstall_to = "{appData}/${id}.bin"\n\n[step.download.any]\nurl = "https://example.com/${id}.bin"\nsha256 = ""\nsize = "1 MB"\n`,
	sidecar: (id) => `[[step]]\nid = "${id}"\ntype = "sidecar"\ntitle = "Install ${id}"\nphases = ["package", "firstRun"]\nsidecar = "binaries/${id}"\ninstall_to = "{tools}"\nexpose = "${id.toUpperCase()}_BIN"\n`,
	run: (id) => `[[step]]\nid = "${id}"\ntype = "run"\ntitle = "${id}"\nphases = ["bootstrap", "firstRun"]\ncheck = { command = "${id} --check", success = 0 }\napply = { command = "${id} --apply" }\nuninstall = { command = "${id} --remove" }\n`,
	path: (id) => `[[step]]\nid = "${id}"\ntype = "path"\ntitle = "Add ${id} to PATH"\nphases = ["package", "firstRun"]\ntarget = "{installDir}/${id}"\n`,
	shortcut: (id) => `[[step]]\nid = "${id}"\ntype = "shortcut"\nphases = ["package", "firstRun"]\ntarget = "{installDir}/{slug}"\nlocation = ["startMenu", "desktop"]\n`,
	fileAssociation: (id) => `[[step]]\nid = "${id}"\ntype = "fileAssociation"\nphases = ["package", "firstRun"]\next = ".${id.toLowerCase()}"\ntarget = "{installDir}/{slug}"\ndescription = "${id} file"\n`,
	urlScheme: (id) => `[[step]]\nid = "${id}"\ntype = "urlScheme"\nphases = ["package", "firstRun"]\nscheme = "${id.toLowerCase()}"\ntarget = "{installDir}/{slug}"\n`,
	autostart: (id) => `[[step]]\nid = "${id}"\ntype = "autostart"\nphases = ["package", "firstRun"]\ntarget = "{installDir}/{slug}"\nargs = ["--headless"]\n`,
	service: (id) => `[[step]]\nid = "${id}"\ntype = "service"\nphases = ["package"]\nname = "${id}"\ntarget = "{installDir}/{slug}"\nargs = ["--service"]\nuser = true                                     # false: a system service (asks for administrator rights)\n`,
	env: (id) => `[[step]]\nid = "${id}"\ntype = "env"\nphases = ["package", "firstRun"]\nname = "${id.toUpperCase()}"\nvalue = "{installDir}"\n`,
	firewallRule: (id) => `[[step]]\nid = "${id}"\ntype = "firewallRule"\nphases = ["package"]\nname = "${id}"\nprogram = "{installDir}/{slug}.exe"\nport = 8443\n`,
	custom: (id) => `[[step]]\nid = "${id}"\ntype = "custom"\nruntime = "rust"                                 # or "ts": a defineInstallStep in src-setup/steps/\nhandler = "example.defaultConfig"\nphases = ["package", "firstRun"]\n`
};
const hostTriple = () => /host: (\S+)/.exec(execSync("rustc -vV").toString())[1];
const exeExt = (triple) => (triple.includes("windows") ? ".exe" : "");

/** installer.toml with the app identity injected, so the source never repeats fanwit.app.toml. */
function installerManifest() {
	if (!exists("installer.toml")) die("no installer.toml; run `fw installer init`");
	// --with uv merges installer/examples/uv.toml, to try an example without editing installer.toml
	const extra = (flag("with") ?? "").split(",").filter(Boolean).map((n) => read(exists(n) ? n : `installer/examples/${n}.toml`));
	const text = [read("installer.toml"), ...extra].join("\n");
	const doc = parseToml(text);
	const { app } = identity();
	const head = `# Generated by fw installer from installer.toml and fanwit.app.toml. Do not edit.\n[app]\nid = ${JSON.stringify(app.identifier)}\nname = ${JSON.stringify(app.name)}\nslug = ${JSON.stringify(app.slug)}\nversion = ${JSON.stringify(app.version)}\n\n`;
	return { doc, app, text: head + text.replace(/^\[app\][\s\S]*?(?=^\[)/m, "") };
}

function engine(a) {
	const r = spawnSync("cargo", ["run", "-q", "--manifest-path", "src-tauri/Cargo.toml", "-p", ENGINE, "--", ...a], { cwd: ROOT, stdio: "inherit" });
	return r.status ?? 1;
}

function scenarioFiles(list) {
	return list
		.split(",")
		.filter(Boolean)
		.map((n) => (fs.existsSync(n) ? n : `installer/scenarios/${n}.toml`))
		.map((f) => (fs.existsSync(abs(f)) || fs.existsSync(f) ? f : die(`no scenario ${f} (see installer/scenarios)`)))
		.join(",");
}

/** Release asset names Tauri produces, by artefact kind. */
function assetNames(app) {
	const v = app.version;
	return { nsis: `${app.name}_${v}_x64-setup.exe`, msi: `${app.name}_${v}_x64_en-US.msi`, deb: `${app.name}_${v}_amd64.deb`, rpm: `${app.name}-${v}-1.x86_64.rpm`, appimage: `${app.name}_${v}_amd64.AppImage`, dmg: `${app.name}_${v}_aarch64.dmg` };
}

/** SHA-256 of every asset found under dir (bundle output, or release assets downloaded with --assets). */
function assetHashes(dir, names) {
	const found = {};
	const walk = (d) => {
		if (!fs.existsSync(d)) return;
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else for (const [k, n] of Object.entries(names)) if (e.name === n) found[k] = createHash("sha256").update(fs.readFileSync(p)).digest("hex");
		}
	};
	walk(dir);
	return found;
}

function glue(doc, app, hashes) {
	const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
	const mode = nsisInstallMode(doc, conf);
	const nsisScope = mode === "perMachine" ? "machine" : "user";
	const opts = doc.option ?? [];
	const env = app.slug.toUpperCase().replace(/-/g, "_");
	const base = (doc.installer?.downloads ?? "").replace("{version}", app.version);
	const names = assetNames(app);
	const sha = (k) => hashes[k] ?? "";
	const linuxDir = `/usr/lib/${app.name}`;
	// the Setup app copies itself here to serve as the uninstaller and the Modify entry
	const setupExe = `${app.slug}-setup.exe`;
	const files = {};
	const header = (c) => `${c} Generated by fw installer build from installer.toml. Edit that file, not this one.\n`;

	files["hooks.nsh"] = `${header(";")}; Tauri includes this through bundle.windows.nsis.installerHooks.
!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Running install steps"
  ; installMode "both": the scope is the one the user (or /AllUsers, /CurrentUser) chose
  !ifdef MULTIUSER_INSTALLMODE_COMMANDLINE
    \${If} $MultiUser.InstallMode == "AllUsers"
      StrCpy $R9 "machine"
    \${Else}
      StrCpy $R9 "user"
    \${EndIf}
  !else
    StrCpy $R9 "${nsisScope}"
  !endif
  nsExec::ExecToLog '"$INSTDIR\\${ENGINE}.exe" run --phase package --scope $R9 --no-elevate --install-dir "$INSTDIR" --manifest "$INSTDIR\\installer.toml" --log "$INSTDIR\\.install\\install.log"'
  Pop $0
  \${If} $0 == "3010"
    SetRebootFlag true
  \${ElseIf} $0 != "0"
    DetailPrint "Install steps failed ($0); ${app.name} retries them on first launch"
  \${EndIf}
  ; Installed through the Setup app: Apps and features opens its uninstall and modify pages
  ; instead of the plain NSIS dialog. Rewritten on every install, so updates keep it.
  \${If} \${FileExists} "$INSTDIR\\${setupExe}"
    WriteRegStr SHCTX "\${UNINSTKEY}" "UninstallString" '"$INSTDIR\\${setupExe}" --uninstall'
    WriteRegStr SHCTX "\${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\\uninstall.exe" /S'
    WriteRegStr SHCTX "\${UNINSTKEY}" "ModifyPath" '"$INSTDIR\\${setupExe}"'
    WriteRegDWORD SHCTX "\${UNINSTKEY}" "NoModify" 0
    WriteRegDWORD SHCTX "\${UNINSTKEY}" "NoRepair" 0
  \${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  \${If} $DeleteAppDataCheckboxState = 1
    nsExec::ExecToLog '"$INSTDIR\\${ENGINE}.exe" uninstall --purge --no-elevate --install-dir "$INSTDIR" --manifest "$INSTDIR\\installer.toml"'
  \${Else}
    nsExec::ExecToLog '"$INSTDIR\\${ENGINE}.exe" uninstall --no-elevate --install-dir "$INSTDIR" --manifest "$INSTDIR\\installer.toml"'
  \${EndIf}
  Pop $0
  ; the Setup app's maintenance copy is not part of the package, so remove it here
  Delete "$INSTDIR\\${setupExe}"
!macroend
`;
	const props = opts.map((o) => o.id.toUpperCase());
	const sets = opts.map((o) => ` --set &quot;${o.id}=[${o.id.toUpperCase()}]&quot;`).join("");
	const cmd = (c) => `&quot;[INSTALLDIR]${ENGINE}.exe&quot; ${c} --scope machine --install-dir &quot;[INSTALLDIR]&quot; --manifest &quot;[INSTALLDIR]installer.toml&quot;`;
	files["fanwit-install.wxs"] = `<?xml version="1.0" encoding="utf-8"?>
<!--${header("").trim()} -->
<!-- msiexec /i app.msi /qn COMPONENTS=core,cli ${props.map((p) => `${p}=1`).join(" ")} -->
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Fragment>
    <Property Id="COMPONENTS" Secure="yes" />
${props.map((p) => `    <Property Id="${p}" Secure="yes" />`).join("\n")}
    <CustomAction Id="FanwitInstallSteps" Directory="INSTALLDIR" Execute="deferred" Impersonate="no" Return="ignore"
      ExeCommand="${cmd("run --phase package")} --components &quot;[COMPONENTS]&quot;${sets}" />
    <CustomAction Id="FanwitUninstallSteps" Directory="INSTALLDIR" Execute="deferred" Impersonate="no" Return="ignore"
      ExeCommand="${cmd("uninstall")}" />
    <InstallExecuteSequence>
      <Custom Action="FanwitInstallSteps" Before="InstallFinalize">NOT REMOVE</Custom>
      <Custom Action="FanwitUninstallSteps" Before="RemoveFiles">REMOVE~="ALL"</Custom>
    </InstallExecuteSequence>
    <ComponentGroup Id="FanwitInstallKit" />
  </Fragment>
</Wix>
`;
	const linuxRun = `/usr/bin/${ENGINE} run --phase package --scope machine --install-dir "${linuxDir}" --manifest "${linuxDir}/installer.toml"`;
	const linuxUn = `/usr/bin/${ENGINE} uninstall --install-dir "${linuxDir}" --manifest "${linuxDir}/installer.toml" || true`;
	files["deb-postinst.sh"] = `#!/bin/sh\n${header("#")}# Choices: sudo ${env}_COMPONENTS=core,cli apt install ./${names.deb}\nset -e\n[ "$1" = "configure" ] || exit 0\n${linuxRun} || echo "${app.name}: install steps failed; they run again on first launch" >&2\n`;
	files["deb-prerm.sh"] = `#!/bin/sh\n${header("#")}[ "$1" = "remove" ] || [ "$1" = "purge" ] || exit 0\n${linuxUn}\n`;
	files["rpm-post.sh"] = `#!/bin/sh\n${header("#")}${linuxRun} || echo "${app.name}: install steps failed; they run again on first launch" >&2\n`;
	files["rpm-preun.sh"] = `#!/bin/sh\n${header("#")}# $1 is the number of versions left after this one; 0 means removal, not upgrade\n[ "$1" = "0" ] || exit 0\n${linuxUn}\n`;

	const hashCheck = (k) => (sha(k) ? sha(k) : "PENDING");
	files["install.ps1"] = `${header("#")}# Read before you run: irm ${base}/install.ps1 | iex
# Choices pass through the environment: $env:${env}_COMPONENTS = "core,cli"
$ErrorActionPreference = "Stop"
$file = "${names.nsis}"
$sha = "${hashCheck("nsis")}"
if ($sha -eq "PENDING") { throw "This script was generated before the release was built; download it from the release page." }
if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") { throw "${app.name} is available for x64 Windows only." }
$tmp = Join-Path $env:TEMP $file
Write-Host "Downloading ${app.name} ${app.version}"
Invoke-WebRequest "${base}/$file" -OutFile $tmp -UseBasicParsing
if ((Get-FileHash $tmp -Algorithm SHA256).Hash -ne $sha.ToUpper()) { Remove-Item $tmp; throw "SHA-256 mismatch for $file" }
Write-Host "Installing (install steps run through ${ENGINE})"
$p = Start-Process $tmp -ArgumentList "/S" -Wait -PassThru
Remove-Item $tmp
if ($p.ExitCode -ne 0) { throw "Installer exited with $($p.ExitCode)" }
Write-Host "Done. Open a new terminal to use the ${app.slug} command."
`;
	files["install.sh"] = `#!/bin/sh
${header("#")}# Read before you pipe: curl -fsSL ${base}/install.sh | sh
set -eu
base="${base}"
os=$(uname -s); arch=$(uname -m)
case "$os-$arch" in
  Linux-x86_64) file="${names.appimage}"; sha="${hashCheck("appimage")}" ;;
  Darwin-arm64) file="${names.dmg}"; sha="${hashCheck("dmg")}" ;;
  *) echo "${app.name} has no build for $os $arch" >&2; exit 1 ;;
esac
[ "$sha" != "PENDING" ] || { echo "This script was generated before the release was built" >&2; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'downloading %s ... ' "$file"
curl -fsSL "$base/$file" -o "$tmp/$file"
got=$( (sha256sum "$tmp/$file" 2>/dev/null || shasum -a 256 "$tmp/$file") | cut -d' ' -f1)
[ "$got" = "$sha" ] || { echo "SHA-256 mismatch" >&2; exit 1; }
echo "verified"
if [ "$os" = "Linux" ]; then
  dir="\${XDG_DATA_HOME:-$HOME/.local/share}/${app.slug}"
  install -Dm755 "$tmp/$file" "$dir/${app.name}.AppImage"
  mkdir -p "$HOME/.local/bin"; ln -sf "$dir/${app.name}.AppImage" "$HOME/.local/bin/${app.slug}"
  echo "installed to $dir; install steps run on first launch"
else
  hdiutil attach -nobrowse -quiet -mountpoint "$tmp/mnt" "$tmp/$file"
  mkdir -p "$HOME/Applications"; rm -rf "$HOME/Applications/${app.name}.app"
  cp -R "$tmp/mnt/${app.name}.app" "$HOME/Applications/"
  hdiutil detach -quiet "$tmp/mnt"
  app="$HOME/Applications/${app.name}.app/Contents"
  "$app/MacOS/${ENGINE}" run --phase package --install-dir "$HOME/Applications" --manifest "$app/Resources/installer.toml"
  echo "installed ${app.name} ${app.version}"
fi
`;
	const id = app.identifier;
	const pub = identity().developer?.name || app.name;
	files["managers/winget/" + id + ".yaml"] = `${header("#")}PackageIdentifier: ${pub}.${app.name}\nPackageVersion: ${app.version}\nDefaultLocale: en-US\nManifestType: version\nManifestVersion: 1.6.0\n`;
	files["managers/winget/" + id + ".installer.yaml"] = `${header("#")}PackageIdentifier: ${pub}.${app.name}\nPackageVersion: ${app.version}\nInstallerType: nullsoft\nScope: user\nInstallers:\n  - Architecture: x64\n    InstallerUrl: ${base}/${names.nsis}\n    InstallerSha256: ${sha("nsis").toUpperCase() || "PENDING"}\nManifestType: installer\nManifestVersion: 1.6.0\n`;
	files["managers/winget/" + id + ".locale.en-US.yaml"] = `${header("#")}PackageIdentifier: ${pub}.${app.name}\nPackageVersion: ${app.version}\nPackageLocale: en-US\nPublisher: ${pub}\nPackageName: ${app.name}\nLicense: see repository\nShortDescription: ${app.name}\nManifestType: defaultLocale\nManifestVersion: 1.6.0\n`;
	files[`managers/scoop/${app.slug}.json`] = JSON.stringify({ version: app.version, description: app.name, homepage: base.replace(/\/releases\/.*/, ""), architecture: { "64bit": { url: `${base}/${names.nsis}#/setup.exe`, hash: sha("nsis") || "PENDING" } }, installer: { script: ['Start-Process "$dir\\setup.exe" -ArgumentList "/S" -Wait'] }, uninstaller: { script: [`& "$env:LOCALAPPDATA\\${app.name}\\uninstall.exe" /S`] } }, null, "\t") + "\n";
	files[`managers/homebrew/${app.slug}.rb`] = `${header("#")}cask "${app.slug}" do\n  version "${app.version}"\n  sha256 "${sha("dmg") || "PENDING"}"\n  url "${base.replace(app.version, "#{version}")}/${names.dmg.replace(app.version, "#{version}")}"\n  name "${app.name}"\n  desc "${app.name}"\n  depends_on arch: :arm64\n  app "${app.name}.app"\n  postflight do\n    system_command "#{appdir}/${app.name}.app/Contents/MacOS/${ENGINE}", args: ["run", "--phase", "package", "--install-dir", appdir.to_s, "--manifest", "#{appdir}/${app.name}.app/Contents/Resources/installer.toml"]\n  end\n  uninstall_preflight do\n    system_command "#{appdir}/${app.name}.app/Contents/MacOS/${ENGINE}", args: ["uninstall", "--install-dir", appdir.to_s, "--manifest", "#{appdir}/${app.name}.app/Contents/Resources/installer.toml"]\n  end\nend\n`;
	files[`managers/aur/PKGBUILD`] = `${header("#")}pkgname=${app.slug}-bin\npkgver=${app.version}\npkgrel=1\npkgdesc="${app.name}"\narch=('x86_64')\nlicense=('custom')\ndepends=('webkit2gtk-4.1' 'gtk3')\nsource=("${base.replace(app.version, "$pkgver")}/${names.deb.replace(app.version, "$pkgver")}")\nsha256sums=('${sha("deb") || "SKIP"}')\ninstall=${app.slug}.install\n\npackage() {\n  bsdtar -xf data.tar.* -C "$pkgdir"\n}\n`;
	files[`managers/aur/${app.slug}.install`] = `${header("#")}post_install() {\n  ${linuxRun} || true\n}\npre_remove() {\n  ${linuxUn}\n}\n`;
	// macOS pkg (pkgbuild): installs the .app into /Applications, then runs the package phase as root
	const macApp = `/Applications/${app.name}.app/Contents`;
	files["pkg/postinstall"] = `#!/bin/sh\n${header("#")}"${macApp}/MacOS/${ENGINE}" run --phase package --scope machine --no-elevate --install-dir /Applications --manifest "${macApp}/Resources/installer.toml" || echo "${app.name}: install steps failed; they run again on first launch" >&2\nexit 0\n`;
	files["pkg/uninstall.sh"] = `#!/bin/sh\n${header("#")}# A pkg has no uninstaller: ship this script (or run the Setup app's maintenance page)\nset -e\n"${macApp}/MacOS/${ENGINE}" uninstall --scope machine --no-elevate --install-dir /Applications --manifest "${macApp}/Resources/installer.toml" || true\nrm -rf "/Applications/${app.name}.app"\npkgutil --forget "${app.identifier}" >/dev/null 2>&1 || true\n`;
	files["managers/flathub.md"] = `Generated by fw installer build.\n\nFlatpak sandboxes cannot change the host system, so every step runs in firstRun inside the sandbox; steps that need the host (PATH, services) are skipped. Start from https://docs.flathub.org/docs/for-app-authors/submission and ship ${names.deb} as the source.\n`;
	return files;
}

/**
 * NSIS install mode from installer.toml: "ask" offers both (/AllUsers, /CurrentUser; note that
 * administrators then see one UAC prompt even for a per user install), "machine" is per machine.
 * An explicit installMode in tauri.conf.json wins.
 */
function nsisInstallMode(doc, conf = JSON.parse(read("src-tauri/tauri.conf.json"))) {
	const own = conf.bundle?.windows?.nsis?.installMode;
	if (own) return own;
	return { ask: "both", machine: "perMachine" }[doc.installer?.scope] ?? "currentUser";
}

function installerTauriConf(doc, sidecars) {
	return {
		bundle: {
			externalBin: [`binaries/${ENGINE}`, ...sidecars.map((s) => `binaries/${s}`)],
			resources: { "gen/installer/installer.toml": "installer.toml" },
			windows: { nsis: { installerHooks: "gen/installer/hooks.nsh", installMode: nsisInstallMode(doc) }, wix: { fragmentPaths: ["gen/installer/fanwit-install.wxs"], componentGroupRefs: ["FanwitInstallKit"] } },
			linux: { deb: { postInstallScript: "gen/installer/deb-postinst.sh", preRemoveScript: "gen/installer/deb-prerm.sh" }, rpm: { postInstallScript: "gen/installer/rpm-post.sh", preRemoveScript: "gen/installer/rpm-preun.sh" } }
		}
	};
}

/** Build phase: download every sidecar the host target needs, verify it, and place it for externalBin. */
async function fetchSidecars(doc, triple) {
	const [os, arch] = triple.includes("windows") ? ["windows", triple.split("-")[0]] : triple.includes("apple") ? ["macos", triple.split("-")[0]] : ["linux", triple.split("-")[0]];
	const names = [];
	for (const s of (doc.step ?? []).filter((s) => s.sidecar)) {
		const name = s.sidecar.split("/").pop();
		const out = `src-tauri/binaries/${name}-${triple}${exeExt(triple)}`;
		const d = s.download ?? {};
		const f = d[`${os}-${arch}`] ?? d[os] ?? d.any;
		if (exists(out)) {
			names.push(name);
			continue;
		}
		if (!f) {
			console.log(`  sidecar ${name}: no download for ${os}-${arch}; the step falls back to its other strategies`);
			continue;
		}
		console.log(`  sidecar ${name}: ${f.url}`);
		if (DRY) continue;
		const res = await fetch(f.url);
		if (!res.ok) die(`download failed (${res.status}): ${f.url}`);
		const buf = Buffer.from(await res.arrayBuffer());
		const got = createHash("sha256").update(buf).digest("hex");
		if (got !== f.sha256.toLowerCase()) die(`SHA-256 mismatch for ${f.url}\n  expected ${f.sha256}\n  got      ${got}`);
		const cache = abs(`${INST}/cache/${name}`);
		fs.rmSync(cache, { recursive: true, force: true });
		fs.mkdirSync(cache, { recursive: true });
		const file = path.join(cache, f.url.split("/").pop());
		fs.writeFileSync(file, buf);
		if (/\.(zip|tar\.gz|tgz|tar\.xz|tar\.zst)$/.test(file)) execSync(`tar -xf "${path.basename(file)}"`, { cwd: cache });
		const bin = `${s.bin ?? s.id}${exeExt(triple)}`;
		const find = (d) => {
			for (const e of fs.readdirSync(d, { withFileTypes: true })) {
				const p = path.join(d, e.name);
				if (e.isDirectory()) {
					const r = find(p);
					if (r) return r;
				} else if (e.name === bin || p === file) return p;
			}
		};
		const src = find(cache) ?? die(`${bin} not found in ${f.url}`);
		fs.mkdirSync(path.dirname(abs(out)), { recursive: true });
		fs.copyFileSync(src, abs(out));
		fs.chmodSync(abs(out), 0o755);
		changed.push(`create ${out}`);
		names.push(name);
	}
	return names;
}

/** Bundles Tauri produced on this machine, by kind. */
function bundles(app) {
	// tauri build --target <triple> (the universal macOS release) bundles under target/<triple>/release
	const dirs = [abs("src-tauri/target/release/bundle"), ...(fs.existsSync(abs("src-tauri/target")) ? fs.readdirSync(abs("src-tauri/target")).map((t) => abs(`src-tauri/target/${t}/release/bundle`)) : [])];
	const find = (sub, re) => dirs.flatMap((dir) => (fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter((f) => re.test(f)).map((f) => path.join(dir, sub, f)) : []))[0];
	return { nsis: find("nsis", /-setup\.exe$/), msi: find("msi", /\.msi$/), dmg: find("dmg", /\.dmg$/), app: find("macos", /\.app$/), deb: find("deb", /\.deb$/), rpm: find("rpm", /\.rpm$/), appimage: find("appimage", /\.AppImage$/) };
}

/**
 * Sign a file when signing is configured (Section 16.15). Windows: bundle.windows.signCommand
 * (%1 is the file) or certificateThumbprint with signtool; macOS: codesign with
 * APPLE_SIGNING_IDENTITY; Linux: a detached GPG signature with FW_GPG_KEY. Unsigned otherwise.
 */
function sign(file) {
	const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
	const w = conf.bundle?.windows ?? {};
	const sh = (cmd) => spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true }).status === 0;
	let ok = true;
	if (process.platform === "win32") {
		const signCommand = process.env.FW_WINDOWS_SIGN_COMMAND ?? (typeof w.signCommand === "string" ? w.signCommand : w.signCommand?.cmd ? [w.signCommand.cmd, ...(w.signCommand.args ?? [])].join(" ") : undefined);
		const thumb = process.env.FW_WINDOWS_CERT_THUMBPRINT ?? w.certificateThumbprint;
		if (signCommand) ok = sh(signCommand.replace("%1", `"${file}"`));
		else if (thumb) ok = sh(`signtool sign /sha1 ${thumb} /fd sha256 /tr ${w.timestampUrl ?? "http://timestamp.digicert.com"} /td sha256 "${file}"`);
		else return console.log(`  not signed (no signCommand or certificateThumbprint): ${rel(file)}`);
	} else if (process.platform === "darwin") {
		const id = process.env.APPLE_SIGNING_IDENTITY ?? conf.bundle?.macOS?.signingIdentity;
		if (!id) return console.log(`  not signed (no APPLE_SIGNING_IDENTITY): ${rel(file)}`);
		ok = sh(`codesign --force --options runtime --timestamp --sign "${id}" "${file}"`);
		if (ok && process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID && /\.(dmg|pkg|zip)$/.test(file)) {
			ok = sh(`xcrun notarytool submit "${file}" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait`) && sh(`xcrun stapler staple "${file}"`);
		}
	} else if (process.env.FW_GPG_KEY) {
		ok = sh(`gpg --batch --yes --local-user "${process.env.FW_GPG_KEY}" --detach-sign --armor "${file}"`);
	} else return console.log(`  not signed (no FW_GPG_KEY): ${rel(file)}`);
	if (!ok) die(`signing failed: ${rel(file)}`);
	console.log(`  signed ${rel(file)}`);
}

/** The Tauri CLI would find the main app first; point it at the Setup app, commands run from the root. */
const SETUP_PATHS = () => ({ TAURI_APP_PATH: abs("src-tauri/setup"), TAURI_FRONTEND_PATH: ROOT });

/**
 * The Setup app (Section 16.9.1): one program embedding installer.toml and the native package it
 * chains (or, online, the URL and pinned hash it downloads). Windows: an exe chaining NSIS. macOS:
 * a DMG of the Setup app chaining the app's DMG. Linux: an AppImage chaining the AppImage (user
 * scope) or the deb or rpm (machine scope).
 */
function buildSetup(doc, app, triple) {
	const b = bundles(app);
	const machine = doc.installer?.scope === "machine";
	const payload = process.platform === "win32" ? b.nsis : process.platform === "darwin" ? b.dmg : machine ? b.deb ?? b.rpm : b.appimage ?? b.deb;
	if (!payload) die("build the native package first (fw installer build --artefacts native)");
	const lic = doc.installer?.license;
	if (lic && exists(lic)) write(`${INST}/license.md`, read(lic));
	const online = doc.installer?.payload?.mode === "online";
	const env = { ...process.env, ...SETUP_PATHS(), FW_SETUP_MANIFEST: abs(`${INST}/installer.toml`), FW_SETUP_LICENSE: abs(`${INST}/license.md`) };
	if (online) {
		// the Setup app downloads the package: pin the hash of the one we just built
		const base = (doc.installer?.downloads ?? "").replace("{version}", app.version);
		const url = doc.installer.payload.url ?? `${base}/${path.basename(payload)}`;
		if (!url.startsWith("https://")) die("[installer.payload] online needs [installer] downloads or payload.url (https)");
		const sha = createHash("sha256").update(fs.readFileSync(payload)).digest("hex");
		const size = `${Math.ceil(fs.statSync(payload).size / 1e6)} MB`;
		const text = read(`${INST}/installer.toml`).replace(/^\[installer\.payload\][\s\S]*?(?=^\[|(?![\s\S]))/m, "");
		write(`${INST}/installer.toml`, `${text.trimEnd()}\n\n[installer.payload]\nmode = "online"\nurl = ${JSON.stringify(url)}\nsha256 = "${sha}"\nsize = "${size}"\n`);
		console.log(`online Setup: downloads ${url} (${size}); upload that file to the release`);
	} else env.FW_SETUP_PAYLOAD = payload;
	if (!DRY) report();
	// Windows: the bare exe is the Setup app; macOS and Linux: bundle it as a DMG or an AppImage
	const win = process.platform === "win32";
	const bundleArgs = win ? ["--no-bundle"] : ["--bundles", process.platform === "darwin" ? "dmg" : "appimage", "--config", JSON.stringify({ bundle: { active: true } })];
	const r = spawnSync("pnpm", ["tauri", "build", ...bundleArgs], { cwd: ROOT, stdio: "inherit", shell: win, env });
	if (r.status !== 0) return void (process.exitCode = r.status ?? 1);
	const outDir = abs("src-tauri/target/release/bundle/setup");
	fs.mkdirSync(outDir, { recursive: true });
	let out;
	if (process.platform === "win32") {
		out = path.join(outDir, `${app.name}_${app.version}_x64-Setup${online ? "-online" : ""}.exe`);
		fs.copyFileSync(abs(`src-tauri/target/release/fanwit-setup${exeExt(triple)}`), out);
	} else {
		// tauri bundled the Setup app itself (DMG or AppImage); give it the product's name
		const kind = process.platform === "darwin" ? "dmg" : "appimage";
		const dir = abs(`src-tauri/target/release/bundle/${kind}`);
		const built = fs.readdirSync(dir).filter((f) => f.startsWith("Fanwit Setup") || f.toLowerCase().includes("setup")).map((f) => path.join(dir, f)).sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs)[0];
		if (!built) die(`no Setup ${kind} was produced`);
		out = path.join(outDir, `${app.name}_${app.version}_Setup.${kind === "dmg" ? "dmg" : "AppImage"}`);
		fs.copyFileSync(built, out);
	}
	sign(out);
	console.log(`Setup app: ${rel(out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB${online ? ", downloads the package" : " including the native package"})`);
}

/** Portable build (Section 16.10): no installer; the app runs its steps on first launch. */
function buildPortable(app, triple) {
	const outDir = abs("src-tauri/target/release/bundle/portable");
	fs.mkdirSync(outDir, { recursive: true });
	const b = bundles(app);
	if (process.platform === "linux") {
		if (!b.appimage) die("build the native packages first: the AppImage is the portable Linux build");
		const out = path.join(outDir, path.basename(b.appimage));
		fs.copyFileSync(b.appimage, out);
		return console.log(`portable: ${rel(out)}`);
	}
	const stage = path.join(outDir, `${app.name}`);
	fs.rmSync(stage, { recursive: true, force: true });
	fs.mkdirSync(stage, { recursive: true });
	if (process.platform === "darwin") {
		if (!b.app) die("build the native packages first (bundle/macos/*.app)");
		const out = path.join(outDir, `${app.name}_${app.version}_portable.zip`);
		execSync(`ditto -c -k --keepParent "${b.app}" "${out}"`);
		return console.log(`portable: ${rel(out)}`);
	}
	const rel_ = (f) => abs(`src-tauri/target/release/${f}${exeExt(triple)}`);
	for (const f of [app.slug, `${app.slug}-cli`, ENGINE]) if (fs.existsSync(rel_(f))) fs.copyFileSync(rel_(f), path.join(stage, path.basename(rel_(f))));
	fs.copyFileSync(abs(`${INST}/installer.toml`), path.join(stage, "installer.toml"));
	const out = path.join(outDir, `${app.name}_${app.version}_x64_portable.zip`);
	fs.rmSync(out, { force: true });
	// bsdtar (Windows 10+) writes zip with -a
	execSync(`tar -a -cf "${out}" -C "${outDir}" "${app.name}"`);
	fs.rmSync(stage, { recursive: true, force: true });
	sign(out);
	console.log(`portable: ${rel(out)} (unzip and run ${app.slug}${exeExt(triple)}; steps run on first launch)`);
}

/** macOS pkg (Section 16.16, pkgbuild and productbuild; Tauri does not make one). */
function buildPkg(app) {
	if (process.platform !== "darwin") return console.log("skipped pkg: pkgbuild runs on macOS only");
	const b = bundles(app);
	if (!b.app) die("build the native packages first (bundle/macos/*.app)");
	const work = abs(`${INST}/pkg-build`);
	fs.rmSync(work, { recursive: true, force: true });
	fs.mkdirSync(path.join(work, "root"), { recursive: true });
	fs.mkdirSync(path.join(work, "scripts"), { recursive: true });
	execSync(`cp -R "${b.app}" "${path.join(work, "root")}/"`);
	fs.copyFileSync(abs(`${INST}/pkg/postinstall`), path.join(work, "scripts", "postinstall"));
	fs.chmodSync(path.join(work, "scripts", "postinstall"), 0o755);
	const outDir = abs("src-tauri/target/release/bundle/pkg");
	fs.mkdirSync(outDir, { recursive: true });
	const component = path.join(work, "component.pkg");
	const out = path.join(outDir, `${app.name}_${app.version}.pkg`);
	execSync(`pkgbuild --root "${path.join(work, "root")}" --scripts "${path.join(work, "scripts")}" --identifier "${app.identifier}" --version "${app.version}" --install-location /Applications "${component}"`, { stdio: "inherit" });
	const installerId = process.env.APPLE_INSTALLER_IDENTITY;
	execSync(`productbuild --package "${component}" ${installerId ? `--sign "${installerId}"` : ""} "${out}"`, { stdio: "inherit" });
	fs.copyFileSync(abs(`${INST}/pkg/uninstall.sh`), path.join(outDir, `uninstall-${app.slug}.sh`));
	console.log(`pkg: ${rel(out)}${installerId ? "" : " (unsigned: set APPLE_INSTALLER_IDENTITY)"}`);
}

/** Real installs in Linux containers (Section 16.16): e2e and elevation tests per distro. */
function testLinux() {
	const distros = (flag("distros") ?? "ubuntu:24.04,fedora:41").split(",");
	if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) die("docker is not running");
	const out = abs(`${INST}/linux`);
	fs.mkdirSync(out, { recursive: true });
	const env = { ...process.env, MSYS_NO_PATHCONV: "1" };
	console.log("building the Linux engine (rust:1-slim)");
	// touch: bind mounts from Windows can keep old timestamps, and cargo would reuse a stale build
	const build = spawnSync("docker", ["run", "--rm", "-v", `${abs("src-tauri")}:/src`, "-v", `${out}:/out`, "-v", "fw-cargo-registry:/usr/local/cargo/registry", "-v", "fw-linux-target:/target", "-e", "CARGO_TARGET_DIR=/target", "-w", "/src", "rust:1-slim", "sh", "-c", `find install/src -name '*.rs' -exec touch {} + && cargo build -p ${ENGINE} && cp /target/debug/${ENGINE} /out/${ENGINE}`], { stdio: "inherit", env });
	if (build.status !== 0) die("the Linux build failed");
	let failed = 0;
	for (const img of distros) {
		for (const test of ["e2e", "elevated"]) {
			const r = spawnSync("docker", ["run", "--rm", "-t", "-v", `${path.join(out, ENGINE)}:/engine:ro`, "-v", `${abs("installer/tests")}:/tests:ro`, img, "sh", `/tests/${test}.sh`], { env, encoding: "utf8" });
			const pass = r.status === 0 && /^PASS/m.test(r.stdout);
			console.log(`${pass ? "ok  " : "FAIL"} ${test} on ${img}`);
			if (!pass) {
				failed++;
				console.log(r.stdout.split("\n").slice(-25).join("\n"));
			}
		}
	}
	if (failed) process.exitCode = 1;
}

async function installer() {
	const [, sub, a3, a4] = args;
	const pass = (names) => names.flatMap((n) => (flag(n) !== undefined ? [`--${n}`, flag(n)] : []));
	if (sub === "init") {
		const preset = flag("preset", "classic");
		const p = PRESETS[preset] ?? die(`presets: ${Object.keys(PRESETS).join(", ")}`, 2);
		if (exists("installer.toml")) {
			let t = read("installer.toml");
			t = setTomlKey(t, "installer", "preset", preset);
			t = setTomlKey(t, "installer", "scope", p.scope);
			t = setTomlKey(t, "installer", "artefacts", p.artefacts);
			if (p.pages.length) t = setTomlKey(t, "installer", "pages", p.pages);
			write("installer.toml", t);
		} else write("installer.toml", `#:schema ./schemas/installer.schema.json\n[installer]\npreset = "${preset}"\nartefacts = ${JSON.stringify(p.artefacts)}\nscope = "${p.scope}"\npages = ${JSON.stringify(p.pages)}\nlanguages = ["en"]\ndownloads = ""\n\n[[component]]\nid = "core"\ntitle = "${identity().app.name}"\nrequired = true\n`);
		return report();
	}
	if (sub === "add-step") {
		if (!STEP_TEMPLATES[a3] || !a4) die(`fw installer add-step <${Object.keys(STEP_TEMPLATES).join("|")}> <id>`, 2);
		if (new RegExp(`^id\\s*=\\s*"${a4}"`, "m").test(read("installer.toml"))) die(`step ${a4} exists`);
		write("installer.toml", read("installer.toml").trimEnd() + "\n\n" + STEP_TEMPLATES[a3](a4));
		report();
		return console.log(`Next: fill in the hashes, then pnpm fw installer plan --scenario offline`);
	}
	const { doc, app, text } = installerManifest();
	write(`${INST}/installer.toml`, text);
	if (sub === "plan" || sub === "run") {
		const sc = flag("scenario");
		const a = [sub === "plan" ? "plan" : "run", "--manifest", `${INST}/installer.toml`, ...pass(["phase", "os", "arch", "scope", "components", "answers", "step"])];
		for (let i = 0; i < args.length; i++) if (args[i] === "--set") a.push("--set", args[i + 1]);
		if (sc) a.push("--scenario", scenarioFiles(sc));
		if (has("json")) a.push("--json");
		if (DRY && sub === "run") a.push("--dry-run");
		process.exitCode = engine(a);
		return;
	}
	if (sub === "build" || sub === "explain") {
		const triple = sub === "build" ? hostTriple() : "";
		const assets = flag("assets");
		const hashes = assetHashes(assets ? path.resolve(assets) : abs("src-tauri/target/release/bundle"), assetNames(app));
		const files = glue(doc, app, hashes);
		if (sub === "explain") {
			const pick = { pkg: ["pkg/postinstall", "pkg/uninstall.sh"], nsis: ["hooks.nsh"], wix: ["fanwit-install.wxs"], msi: ["fanwit-install.wxs"], deb: ["deb-postinst.sh", "deb-prerm.sh"], rpm: ["rpm-post.sh", "rpm-preun.sh"], scripts: ["install.sh", "install.ps1"], managers: Object.keys(files).filter((f) => f.startsWith("managers/")), conf: [] }[a3];
			if (!pick) die("fw installer explain <nsis|wix|deb|rpm|pkg|scripts|managers|conf>", 2);
			for (const f of pick) console.log(`----- ${INST}/${f}\n${files[f]}`);
			if (a3 === "conf") console.log(JSON.stringify(installerTauriConf(doc, []), null, 2));
			return;
		}
		const want = (flag("artefacts") ?? (doc.installer?.artefacts ?? ["native"]).join(",")).split(",");
		if (engine(["validate", "--manifest", `${INST}/installer.toml`]) !== 0) die("installer.toml is invalid");
		console.log("build phase:");
		const sidecars = await fetchSidecars(doc, triple);
		for (const [f, t] of Object.entries(files)) if (want.includes("native") || want.includes("pkg") || (want.includes("scripts") && f.startsWith("install.")) || (want.includes("managers") && f.startsWith("managers/"))) write(`${INST}/${f}`, t);
		if (want.includes("native")) {
			if (!DRY && spawnSync("cargo", ["build", "--release", "--manifest-path", "src-tauri/Cargo.toml", "-p", ENGINE], { cwd: ROOT, stdio: "inherit" }).status !== 0) die("could not build the engine");
			const bin = `src-tauri/binaries/${ENGINE}-${triple}${exeExt(triple)}`;
			if (!DRY) {
				fs.mkdirSync(abs("src-tauri/binaries"), { recursive: true });
				fs.copyFileSync(abs(`src-tauri/target/release/${ENGINE}${exeExt(triple)}`), abs(bin));
			}
			changed.push(`update ${bin}`);
			write(`${INST}/tauri.installer.conf.json`, JSON.stringify(installerTauriConf(doc, sidecars), null, "\t") + "\n");
		}
		report();
		if (want.includes("native") && !has("no-bundle") && !DRY) {
			run("pnpm", ["tauri", "build", "--config", `${INST}/tauri.installer.conf.json`]);
			if (process.exitCode) return;
			// now that the bundles exist, write their hashes into the scripts and manifests
			const after = glue(doc, app, assetHashes(abs("src-tauri/target/release/bundle"), assetNames(app)));
			for (const [f, t] of Object.entries(after)) if ((want.includes("scripts") && f.startsWith("install.")) || (want.includes("managers") && f.startsWith("managers/"))) write(`${INST}/${f}`, t);
			report();
		}
		if (process.exitCode || DRY) return;
		if (want.includes("setup")) buildSetup(doc, app, triple);
		if (want.includes("portable")) buildPortable(app, triple);
		if (want.includes("pkg")) buildPkg(app);
		return;
	}
	if (sub === "test" && has("linux")) return testLinux();
	if (sub === "test" && has("windows")) {
		// a real per user install and uninstall on this machine (installer/tests/e2e-windows.toml)
		if (spawnSync("cargo", ["build", "--manifest-path", "src-tauri/Cargo.toml", "-p", ENGINE], { cwd: ROOT, stdio: "inherit" }).status !== 0) die("could not build the engine");
		process.exitCode = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", abs("installer/tests/e2e-windows.ps1"), "-Engine", abs(`src-tauri/target/debug/${ENGINE}.exe`)], { stdio: "inherit" }).status ?? 1;
		return;
	}
	if (sub === "test") {
		write(`${INST}/sandbox.wsb`, `<Configuration>\n  <MappedFolders>\n    <MappedFolder>\n      <HostFolder>${abs("src-tauri/target/release/bundle")}</HostFolder>\n      <SandboxFolder>C:\\bundle</SandboxFolder>\n      <ReadOnly>true</ReadOnly>\n    </MappedFolder>\n  </MappedFolders>\n  <LogonCommand>\n    <Command>powershell -NoExit -Command "Get-ChildItem C:\\bundle\\nsis\\*.exe | ForEach-Object { Start-Process $_ -ArgumentList '/S' -Wait }; Write-Host 'Installed. Check the PATH and %LOCALAPPDATA%\\${app.name}\\.install\\receipt.toml'"</Command>\n  </LogonCommand>\n</Configuration>\n`);
		report();
		process.exitCode = spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "-p", ENGINE], { cwd: ROOT, stdio: "inherit" }).status ?? 1;
		if (!process.exitCode) {
			for (const os of ["windows", "macos", "linux"]) {
				console.log(`\n== ${os}`);
				if (engine(["plan", "--manifest", `${INST}/installer.toml`, "--os", os]) > 1) process.exitCode = 1;
			}
			console.log(`\nReal install: build with \`fw installer build\`, then open ${INST}/sandbox.wsb (Windows Sandbox).`);
		}
		return;
	}
	if (sub === "dev") {
		// the Setup app with hot reload against a simulated machine: nothing real changes
		const sc = scenarioFiles(flag("scenario") ?? "no-admin");
		const env = { ...process.env, ...SETUP_PATHS(), FW_SETUP_SCENARIO: sc.split(",").map((f) => path.resolve(ROOT, f)).join(","), FW_SETUP_MANIFEST: abs(`${INST}/installer.toml`) };
		if (has("real")) delete env.FW_SETUP_SCENARIO;
		if (has("uninstall")) env.FW_SETUP_UNINSTALL = "1";
		console.log(`Setup app: ${has("real") ? "REAL machine (changes are made)" : `simulated (${sc})`}`);
		process.exitCode = spawnSync("pnpm", ["tauri", "dev"], { cwd: ROOT, stdio: "inherit", shell: true, env }).status ?? 1;
		return;
	}
	die("fw installer <init|plan|run|add-step|build|explain|test> (see docs/fanwit/guides/installer.md)", 2);
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
  fw plugin new <id> [--kind feature|appearance] [--runtime js|wasm|sidecar] [--ui none|widgets|iframe]
  fw plugin build [id] [--release]    compile a plugin's Rust half (plugin.wasm or the sidecar binary)
  fw plugin pack <id>                 registry entry with a SHA-256 per file
  fw sdk build                        typed plugin SDK for this app
  fw parts                            strippable parts (showcase apps, samples, bundled plugins) and their state
  fw strip <part...> | --showcase | --kind <k> | --all [--with-dependents]   move parts to .trash/
  fw strip                            every part, and Labs off
  fw strip --undo                     reverse the last strip or restore
  fw restore <part...> | --all        bring parts back from .trash/ (with what they require)
  fw trash list | empty [--yes]
  fw lock | eject <file> | upgrade --from <dir>
  fw docs <check|build|serve|new <id>>   the manual: check links, build or serve the docs site, add a docset
  fw docs build [--version v] [--base /path] | publish <site> --version v   versioned docs site
  fw installer init [--preset p] | plan [--os --scenario a,b --phase --json] | add-step <type> <id>
               build [--artefacts native,setup,scripts,managers] [--no-bundle] [--assets dir] | explain <artefact> | test
               dev [--scenario a,b] [--with uv] [--real]   the Setup app with hot reload (simulated by default)
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
		// bundled sidecar plugins run from next to the app binary: build them first
		if (!has("web")) for (const id of sidecarIds()) buildPlugin(id);
		run("pnpm", has("web") ? ["dev", "--", "--open"] : ["tauri", "dev"]);
		break;
	case "build":
		if (has("web") || has("all")) run("pnpm", ["build"]);
		if (!has("web") || has("all")) {
			const conf = sidecarBundleConfig();
			run("pnpm", ["tauri", "build", ...(conf ? ["--config", conf] : [])]);
		}
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
	case "parts":
		parts();
		break;
	case "strip":
		strip();
		break;
	case "restore":
		restore();
		break;
	case "trash":
		await trash();
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
		await docs();
		break;
	case "installer":
		await installer();
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
