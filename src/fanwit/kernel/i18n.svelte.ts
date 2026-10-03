/**
 * Internationalisation (Section 21.2). Messages are data (per module, per locale) using a
 * MessageFormat subset: {name}, {count, plural, one {# note} other {# notes}}, {x, select, a {..} other {..}}.
 * A pseudo locale ("pseudo") expands and accents text to test layouts.
 */
import { toDisposable } from "./disposable";

type Messages = Record<string, string>;

function formatMessage(msg: string, params: Record<string, unknown>, locale: string): string {
	let out = "";
	let i = 0;
	while (i < msg.length) {
		const c = msg[i];
		if (c !== "{") {
			out += c;
			i++;
			continue;
		}
		// find matching brace
		let depth = 0;
		let j = i;
		for (; j < msg.length; j++) {
			if (msg[j] === "{") depth++;
			else if (msg[j] === "}" && --depth === 0) break;
		}
		const body = msg.slice(i + 1, j);
		i = j + 1;
		const [name, type, ...rest] = body.split(",");
		const key = name.trim();
		const v = params[key];
		if (!type) {
			out += v === undefined ? `{${key}}` : typeof v === "number" ? new Intl.NumberFormat(locale).format(v) : String(v);
			continue;
		}
		const options = rest.join(",");
		const cases = new Map<string, string>();
		const re = /\s*(=?\w+)\s*\{/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(options))) {
			let d = 1;
			let k = re.lastIndex;
			for (; k < options.length && d > 0; k++) {
				if (options[k] === "{") d++;
				else if (options[k] === "}") d--;
			}
			cases.set(m[1], options.slice(re.lastIndex, k - 1));
			re.lastIndex = k;
		}
		let chosen: string | undefined;
		if (type.trim() === "plural") {
			const n = Number(v);
			chosen = cases.get(`=${n}`) ?? cases.get(new Intl.PluralRules(locale).select(n)) ?? cases.get("other");
			out += formatMessage((chosen ?? "").replace(/#/g, new Intl.NumberFormat(locale).format(n)), params, locale);
		} else {
			chosen = cases.get(String(v)) ?? cases.get("other");
			out += formatMessage(chosen ?? "", params, locale);
		}
	}
	return out;
}

const PSEUDO: Record<string, string> = { a: "á", e: "é", i: "í", o: "ö", u: "ü", c: "ç", n: "ñ", A: "Å", E: "É", O: "Ö" };

export class I18nService {
	locale = $state("en");
	private catalogs = new Map<string, Messages>();

	add(locale: string, messages: Messages) {
		this.catalogs.set(locale, { ...(this.catalogs.get(locale) ?? {}), ...messages });
		return toDisposable(() => {
			const cat = this.catalogs.get(locale);
			if (cat) for (const k of Object.keys(messages)) delete cat[k];
		});
	}

	get locales() {
		return [...new Set(["en", ...this.catalogs.keys(), "pseudo"])];
	}

	has(key: string) {
		return !!(this.catalogs.get(this.locale)?.[key] ?? this.catalogs.get("en")?.[key]);
	}

	t(key: string, params: Record<string, unknown> = {}, fallback?: string): string {
		void this.locale;
		const loc = this.locale === "pseudo" ? "en" : this.locale;
		const base = loc.split("-")[0];
		const msg = this.catalogs.get(loc)?.[key] ?? this.catalogs.get(base)?.[key] ?? this.catalogs.get("en")?.[key] ?? fallback ?? key;
		const out = formatMessage(msg, params, loc);
		if (this.locale !== "pseudo") return out;
		return `［${[...out].map((ch) => PSEUDO[ch] ?? ch).join("")}${"~".repeat(Math.ceil(out.length * 0.3))}］`;
	}

	formatDate(d: Date | number, o: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
		return new Intl.DateTimeFormat(this.locale === "pseudo" ? "en" : this.locale, o).format(d);
	}

	formatNumber(n: number, o?: Intl.NumberFormatOptions) {
		return new Intl.NumberFormat(this.locale === "pseudo" ? "en" : this.locale, o).format(n);
	}

	relative(time: number) {
		const diff = (time - Date.now()) / 1000;
		const rtf = new Intl.RelativeTimeFormat(this.locale === "pseudo" ? "en" : this.locale, { numeric: "auto" });
		const abs = Math.abs(diff);
		if (abs < 60) return rtf.format(Math.round(diff), "second");
		if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
		if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
		return rtf.format(Math.round(diff / 86400), "day");
	}

	/** Right to left locales mirror the frame. */
	get dir(): "ltr" | "rtl" {
		return /^(ar|he|fa|ur)\b/.test(this.locale) ? "rtl" : "ltr";
	}
}

export { formatMessage };
