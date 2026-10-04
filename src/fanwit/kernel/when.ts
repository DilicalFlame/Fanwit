/**
 * When clauses (Section 4.5.3).
 *
 *   expr := or
 *   or   := and ( "||" and )*
 *   and  := not ( "&&" not )*
 *   not  := "!" not | cmp
 *   cmp  := atom ( ("=="|"!="|">"|">="|"<"|"<="|"=~"|"in"|"not in") atom )?
 *   atom := key | string | number | true | false | regex | "(" expr ")" | "[" list "]"
 *
 * Expressions compile once into closures and record the keys they read.
 */
import { FanwitError } from "./errors";

export type WhenClause = string;
export type Lookup = (key: string) => unknown;

export interface CompiledWhen {
	source: string;
	keys: Set<string>;
	eval(lookup: Lookup): boolean;
	/** Explains the first failing sub clause, e.g. for "disabled because ...". */
	explain(lookup: Lookup): string | null;
}

type Tok =
	| { t: "op"; v: string }
	| { t: "id"; v: string }
	| { t: "str"; v: string }
	| { t: "num"; v: number }
	| { t: "re"; v: RegExp };

function tokenize(src: string): Tok[] {
	const out: Tok[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		const two = src.slice(i, i + 2);
		if (["&&", "||", "==", "!=", ">=", "<=", "=~"].includes(two)) {
			out.push({ t: "op", v: two });
			i += 2;
			// a regex literal may follow =~
			if (two === "=~") {
				while (/\s/.test(src[i] ?? "")) i++;
				if (src[i] === "/") {
					let j = i + 1;
					let body = "";
					while (j < src.length && src[j] !== "/") {
						if (src[j] === "\\") {
							body += src[j] + (src[j + 1] ?? "");
							j += 2;
						} else body += src[j++];
					}
					if (src[j] !== "/") throw err(src, "unterminated regex");
					j++;
					let flags = "";
					while (/[a-z]/.test(src[j] ?? "")) flags += src[j++];
					out.push({ t: "re", v: new RegExp(body, flags) });
					i = j;
				}
			}
			continue;
		}
		if ("!()[]<>,".includes(c)) {
			out.push({ t: "op", v: c });
			i++;
			continue;
		}
		if (c === "'" || c === '"') {
			let j = i + 1;
			let s = "";
			while (j < src.length && src[j] !== c) {
				if (src[j] === "\\") {
					s += src[j + 1] ?? "";
					j += 2;
				} else s += src[j++];
			}
			if (src[j] !== c) throw err(src, "unterminated string");
			out.push({ t: "str", v: s });
			i = j + 1;
			continue;
		}
		const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
		if (num) {
			out.push({ t: "num", v: Number(num[0]) });
			i += num[0].length;
			continue;
		}
		const id = /^[A-Za-z_$@][\w.\-:$@/]*/.exec(src.slice(i));
		if (id) {
			out.push({ t: "id", v: id[0] });
			i += id[0].length;
			continue;
		}
		throw err(src, `unexpected character "${c}" at ${i}`);
	}
	return out;
}

function err(src: string, msg: string) {
	return new FanwitError("WHEN_SYNTAX", {
		message: `Invalid when clause "${src}": ${msg}.`,
		hint: "Combine keys with &&, ||, ! and comparisons such as == 'value'.",
		docs: "manual://context-keys#grammar"
	});
}

type Node = (l: Lookup) => unknown;
interface Parsed {
	fn: Node;
	text: string;
	kids?: Parsed[];
	kind?: "and" | "or" | "leaf";
}

function parse(src: string, keys: Set<string>): Parsed {
	const toks = tokenize(src);
	let p = 0;
	const peek = () => toks[p];
	const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;
	const isWord = (v: string) => peek()?.t === "id" && (peek() as { v: string }).v === v;

	function or(): Parsed {
		const kids = [and()];
		while (isOp("||")) {
			p++;
			kids.push(and());
		}
		if (kids.length === 1) return kids[0];
		return { kind: "or", kids, text: kids.map((k) => k.text).join(" || "), fn: (l) => kids.some((k) => truthy(k.fn(l))) };
	}
	function and(): Parsed {
		const kids = [not()];
		while (isOp("&&")) {
			p++;
			kids.push(not());
		}
		if (kids.length === 1) return kids[0];
		return { kind: "and", kids, text: kids.map((k) => k.text).join(" && "), fn: (l) => kids.every((k) => truthy(k.fn(l))) };
	}
	function not(): Parsed {
		if (isOp("!")) {
			p++;
			const inner = not();
			return { kind: "leaf", text: "!" + inner.text, fn: (l) => !truthy(inner.fn(l)) };
		}
		return cmp();
	}
	function cmp(): Parsed {
		const left = atom();
		const t = peek();
		let op: string | null = null;
		if (t?.t === "op" && ["==", "!=", ">", ">=", "<", "<=", "=~"].includes(t.v)) op = t.v;
		else if (isWord("in")) op = "in";
		else if (isWord("not") && toks[p + 1]?.t === "id" && (toks[p + 1] as { v: string }).v === "in") {
			op = "not in";
			p++;
		}
		if (!op) return { kind: "leaf", ...left };
		p++;
		const right = atom();
		const text = `${left.text} ${op} ${right.text}`;
		const a = left.fn;
		const b = right.fn;
		const fns: Record<string, Node> = {
			"==": (l) => loose(a(l)) === loose(b(l)),
			"!=": (l) => loose(a(l)) !== loose(b(l)),
			">": (l) => Number(a(l)) > Number(b(l)),
			">=": (l) => Number(a(l)) >= Number(b(l)),
			"<": (l) => Number(a(l)) < Number(b(l)),
			"<=": (l) => Number(a(l)) <= Number(b(l)),
			"=~": (l) => {
				const r = b(l);
				const v = a(l);
				if (v == null) return false;
				return r instanceof RegExp ? r.test(String(v)) : new RegExp(String(r)).test(String(v));
			},
			in: (l) => contains(b(l), a(l)),
			"not in": (l) => !contains(b(l), a(l))
		};
		return { kind: "leaf", text, fn: fns[op] };
	}
	function atom(): { fn: Node; text: string } {
		const t = toks[p++];
		if (!t) throw err(src, "unexpected end");
		if (t.t === "str") return { fn: () => t.v, text: `'${t.v}'` };
		if (t.t === "num") return { fn: () => t.v, text: String(t.v) };
		if (t.t === "re") return { fn: () => t.v, text: String(t.v) };
		if (t.t === "id") {
			if (t.v === "true") return { fn: () => true, text: "true" };
			if (t.v === "false") return { fn: () => false, text: "false" };
			keys.add(t.v);
			const k = t.v;
			return { fn: (l) => l(k), text: k };
		}
		if (t.v === "(") {
			const inner = or();
			if (!isOp(")")) throw err(src, "missing )");
			p++;
			return { fn: inner.fn, text: `(${inner.text})` };
		}
		if (t.v === "[") {
			const items: Node[] = [];
			const texts: string[] = [];
			while (!isOp("]")) {
				const a = atom();
				items.push(a.fn);
				texts.push(a.text);
				if (isOp(",")) p++;
				else if (!isOp("]")) throw err(src, "expected , or ]");
			}
			p++;
			return { fn: (l) => items.map((f) => f(l)), text: `[${texts.join(", ")}]` };
		}
		throw err(src, `unexpected "${t.v}"`);
	}

	if (toks.length === 0) return { kind: "leaf", text: "true", fn: () => true };
	const root = or();
	if (p < toks.length) throw err(src, `unexpected "${String((toks[p] as { v: unknown }).v)}"`);
	return root;
}

function truthy(v: unknown) {
	if (Array.isArray(v)) return v.length > 0;
	return !!v;
}
function loose(v: unknown) {
	return v === undefined || v === null ? "" : typeof v === "number" || typeof v === "boolean" ? String(v) : v;
}
function contains(coll: unknown, v: unknown) {
	if (Array.isArray(coll)) return coll.some((x) => loose(x) === loose(v));
	if (typeof coll === "string") return coll.includes(String(v));
	if (coll && typeof coll === "object") return String(v) in coll;
	return false;
}

const cache = new Map<string, CompiledWhen>();

/**
 * Parse a when clause once (results are cached) into something you can evaluate many times, ask
 * which context keys it reads, and ask why it is false. Syntax: `&&`, `||`, `!`, `==`, `!=`,
 * `<`, `<=`, `>`, `>=`, `=~ /regex/`, `in`, `not in`, parentheses.
 *
 * @example
 * ```ts
 * const w = compileWhen("vault.open && resource.ext == 'md'");
 * w.eval(k.context.lookup(null));    // true or false
 * w.explain(k.context.lookup(null)); // "vault.open" when that part is false
 * ```
 * @see manual://fanwit/guides/context-keys
 */
export function compileWhen(source: WhenClause): CompiledWhen {
	const hit = cache.get(source);
	if (hit) return hit;
	const keys = new Set<string>();
	const root = parse(source, keys);
	const explain = (node: Parsed, l: Lookup): string | null => {
		if (truthy(node.fn(l))) return null;
		if (node.kind === "and") {
			for (const k of node.kids!) {
				const e = explain(k, l);
				if (e) return e;
			}
		}
		return node.text;
	};
	const compiled: CompiledWhen = {
		source,
		keys,
		eval: (l) => truthy(root.fn(l)),
		explain: (l) => explain(root, l)
	};
	cache.set(source, compiled);
	return compiled;
}

/**
 * Evaluate a clause once; empty or undefined clauses are true. For repeated checks, compile it
 * with {@link compileWhen}.
 *
 * @example
 * ```ts
 * evalWhen("vault.open && !inputFocus", k.context.lookup(null));
 * ```
 */
export function evalWhen(clause: WhenClause | undefined, lookup: Lookup): boolean {
	if (!clause) return true;
	return compileWhen(clause).eval(lookup);
}
