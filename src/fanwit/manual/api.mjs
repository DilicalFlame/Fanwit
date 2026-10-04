/**
 * API reference from code: runs TypeDoc in process on a docset's `api` entry and flattens the
 * project into plain symbols the manual renders itself (TypeDoc's own HTML theme is not used).
 * Type strings come from TypeDoc's model (`type.toString()`), so no type printer lives here.
 */
import path from "node:path";

/**
 * @typedef {object} ApiMember
 * @property {string} name
 * @property {string} kind
 * @property {string[]} signature  code lines
 * @property {string} summary  markdown
 * @property {string[]} examples  markdown
 * @property {string[]} see  links (manual:// or https://)
 * @property {string} [since]
 * @property {string} [deprecated]
 * @property {string} [source]  file:line
 */

/** @typedef {ApiMember & { id: string; members: ApiMember[] }} ApiSymbol */

/**
 * @param {string} root  repo root
 * @param {string} entry  repo relative entry file
 * @returns {Promise<{ symbols: ApiSymbol[]; undocumented: string[] }>}
 */
export async function extractApi(root, entry) {
	const { Application, ReflectionKind, Comment } = await import("typedoc");
	const app = await Application.bootstrap({
		// TypeDoc globs its inputs: posix separators even on Windows
		entryPoints: [path.join(root, entry).split(path.sep).join("/")],
		tsconfig: path.join(root, "tsconfig.json").split(path.sep).join("/"),
		// .svelte imports and virtual modules do not type check outside Vite; the shapes still do
		skipErrorChecking: true,
		excludePrivate: true,
		excludeProtected: true,
		excludeInternal: true,
		sort: ["source-order"],
		logLevel: "Error"
	});
	const project = await app.convert();
	if (!project) return { symbols: [], undocumented: [] };

	/** @param {import("typedoc").CommentDisplayPart[] | undefined} parts */
	const text = (parts) => (parts ? Comment.combineDisplayParts(parts).trim() : "");
	/** @param {import("typedoc").Reflection} r */
	const commentOf = (r) => /** @type {any} */ (r).comment ?? /** @type {any} */ (r).signatures?.[0]?.comment ?? /** @type {any} */ (r).getSignature?.comment;
	/** @param {any} c @param {string} tag */
	const tag = (c, tag) => c?.blockTags?.filter((/** @type {any} */ t) => t.tag === tag).map((/** @type {any} */ t) => text(t.content)) ?? [];
	/** @param {any} r */
	const source = (r) => {
		const s = r.sources?.[0];
		return s ? `${path.relative(root, s.fullFileName ?? s.fileName).replace(/\\/g, "/")}:${s.line}` : undefined;
	};
	/** @param {any} t */
	const ts = (t) => (t ? t.toString() : "unknown");
	/** @param {any[] | undefined} tps */
	const generics = (tps) => (tps?.length ? `<${tps.map((p) => p.name + (p.type ? ` extends ${ts(p.type)}` : "")).join(", ")}>` : "");
	/** @param {any} sig @param {string} name */
	const signature = (sig, name) =>
		`${name}${generics(sig.typeParameters)}(${(sig.parameters ?? []).map((/** @type {any} */ p) => `${p.flags.isRest ? "..." : ""}${p.name}${p.flags.isOptional || p.defaultValue ? "?" : ""}: ${ts(p.type)}`).join(", ")}): ${ts(sig.type)}`;

	/** @param {any} r @returns {string[]} */
	function lines(r) {
		const k = r.kind;
		if (r.signatures?.length) return r.signatures.map((/** @type {any} */ s) => signature(s, r.name));
		if (k & ReflectionKind.Accessor) return [`get ${r.name}(): ${ts(r.getSignature?.type)}`];
		if (k & ReflectionKind.TypeAlias) return [`type ${r.name}${generics(r.typeParameters)} = ${ts(r.type)}`];
		if (k & (ReflectionKind.Class | ReflectionKind.Interface)) {
			const ext = r.extendedTypes?.length ? ` extends ${r.extendedTypes.map(ts).join(", ")}` : "";
			return [`${k & ReflectionKind.Class ? "class" : "interface"} ${r.name}${generics(r.typeParameters)}${ext}`];
		}
		if (k & ReflectionKind.Variable) return [`const ${r.name}: ${ts(r.type)}`];
		if (k & (ReflectionKind.Property | ReflectionKind.EnumMember)) return [`${r.flags?.isReadonly ? "readonly " : ""}${r.name}${r.flags?.isOptional ? "?" : ""}: ${ts(r.type)}`];
		return [r.name];
	}

	/** @param {any} r @returns {ApiMember} */
	function member(r) {
		const c = commentOf(r);
		const dep = c?.blockTags?.find((/** @type {any} */ t) => t.tag === "@deprecated");
		return {
			name: r.name,
			kind: ReflectionKind.singularString(r.kind).toLowerCase(),
			signature: lines(r),
			summary: text(c?.summary),
			examples: tag(c, "@example"),
			see: tag(c, "@see"),
			since: tag(c, "@since")[0],
			deprecated: dep ? text(dep.content) || "Deprecated." : undefined,
			source: source(r)
		};
	}

	/** @type {ApiSymbol[]} */
	const symbols = [];
	/** @type {string[]} */
	const undocumented = [];
	for (const r of /** @type {any[]} */ (project.children ?? [])) {
		if (symbols.some((s) => s.name === r.name)) continue; // value and type exports of one name
		const m = member(r);
		const members = /** @type {any[]} */ (r.children ?? []).filter((c) => !c.flags?.isExternal && !c.name.startsWith("_")).map(member);
		symbols.push({ ...m, id: `api/${r.name}`, members });
		if (!m.summary) undocumented.push(r.name);
		else if (!m.examples.length) undocumented.push(`${r.name} (no @example)`);
	}
	return { symbols, undocumented };
}

// `node api.mjs <root> <entry>` prints the API as JSON. The Vite plugin runs it this way so
// TypeDoc (seconds of CPU) never blocks the dev server.
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
	const r = await extractApi(process.argv[2], process.argv[3]);
	process.stdout.write(JSON.stringify(r));
}
