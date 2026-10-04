/**
 * A small spreadsheet formula evaluator: numbers, cell refs (A1), ranges (A1:B3) inside SUM,
 * AVERAGE, MIN, MAX and COUNT, + - * / ^, unary minus and parentheses. Errors come back as
 * spreadsheet error values (#ERR!, #VALUE!, #DIV/0!, #CYCLE!, #NAME?).
 */
export type Cells = Record<string, string>;
export type Value = number | string;

export const colName = (i: number) => String.fromCharCode(65 + i);
export const parseRef = (ref: string) => ({ col: ref.charCodeAt(0) - 65, row: Number(ref.slice(1)) - 1 });
export const isError = (v: Value) => typeof v === "string" && v.startsWith("#");

class Fail extends Error {}

export function evaluate(cells: Cells, ref: string, seen: Set<string> = new Set()): Value {
	const raw = (cells[ref] ?? "").trim();
	if (!raw.startsWith("=")) return raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
	if (seen.has(ref)) return "#CYCLE!";
	const inner = new Set(seen).add(ref);
	try {
		return run(raw.slice(1), (r) => evaluate(cells, r, inner));
	} catch (e) {
		return e instanceof Fail ? e.message : "#ERR!";
	}
}

function run(src: string, cell: (ref: string) => Value): Value {
	const tokens = src.match(/\d+(?:\.\d+)?|[A-Z]\d+(?::[A-Z]\d+)?|[A-Z]+(?=\()|[-+*/^(),]|\S/gi) ?? [];
	let i = 0;
	const peek = () => tokens[i]?.toUpperCase();
	const take = (t?: string) => {
		if (t && peek() !== t) throw new Fail("#ERR!");
		return tokens[i++];
	};
	const num = (v: Value): number => {
		if (typeof v === "number") return v;
		if (isError(v)) throw new Fail(v);
		if (v === "") return 0;
		throw new Fail("#VALUE!");
	};
	const range = (r: string): Value[] => {
		const [a, b] = r.toUpperCase().split(":").map(parseRef);
		const out: Value[] = [];
		for (let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++) for (let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++) out.push(cell(`${colName(col)}${row + 1}`));
		return out;
	};
	const FNS: Record<string, (xs: number[]) => number> = {
		SUM: (xs) => xs.reduce((s, x) => s + x, 0),
		AVERAGE: (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0),
		MIN: (xs) => (xs.length ? Math.min(...xs) : 0),
		MAX: (xs) => (xs.length ? Math.max(...xs) : 0),
		COUNT: (xs) => xs.length
	};

	function primary(): Value {
		const t = take();
		if (t === undefined) throw new Fail("#ERR!");
		if (/^\d/.test(t)) return Number(t);
		if (t === "(") {
			const v = expr();
			take(")");
			return v;
		}
		const T = t.toUpperCase();
		if (/^[A-Z]\d+$/.test(T)) return cell(T);
		if (/^[A-Z]+$/.test(T) && peek() === "(") {
			const fn = FNS[T];
			if (!fn) throw new Fail("#NAME?");
			take("(");
			const xs: Value[] = [];
			while (peek() !== ")") {
				const a = tokens[i]?.toUpperCase() ?? "";
				if (/^[A-Z]\d+:[A-Z]\d+$/.test(a)) {
					i++;
					xs.push(...range(a));
				} else xs.push(expr());
				if (peek() === ",") take(",");
				else break;
			}
			take(")");
			for (const x of xs) if (isError(x)) throw new Fail(x as string);
			return fn(xs.filter((x): x is number => typeof x === "number"));
		}
		throw new Fail("#ERR!");
	}
	function unary(): Value {
		if (peek() === "-") {
			take();
			return -num(unary());
		}
		if (peek() === "+") take();
		return primary();
	}
	function power(): Value {
		const base = unary();
		if (peek() !== "^") return base;
		take();
		return num(base) ** num(power());
	}
	function term(): Value {
		let v = power();
		while (peek() === "*" || peek() === "/") {
			const op = take();
			const r = num(power());
			if (op === "/" && r === 0) throw new Fail("#DIV/0!");
			v = op === "*" ? num(v) * r : num(v) / r;
		}
		return v;
	}
	function expr(): Value {
		let v = term();
		while (peek() === "+" || peek() === "-") v = take() === "+" ? num(v) + num(term()) : num(v) - num(term());
		return v;
	}

	const v = expr();
	if (i < tokens.length) throw new Fail("#ERR!");
	return v;
}

export function display(v: Value): string {
	if (typeof v !== "number") return v;
	return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
