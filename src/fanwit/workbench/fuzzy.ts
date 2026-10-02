/**
 * Fuzzy scorer for the palette (Section 5.4): subsequence match with bonuses for word starts,
 * camel humps and consecutive characters. Returns null when `query` is not a subsequence.
 */
export interface FuzzyMatch {
	score: number;
	/** Indices of matched characters in the text (for bold highlighting). */
	positions: number[];
}

export function fuzzy(query: string, text: string): FuzzyMatch | null {
	if (!query) return { score: 0, positions: [] };
	const q = query.toLowerCase();
	const t = text.toLowerCase();
	// fast reject
	let qi = 0;
	for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++;
	if (qi < q.length) return null;

	const positions: number[] = [];
	let score = 0;
	let ti = 0;
	let prev = -2;
	for (let i = 0; i < q.length; i++) {
		const c = q[i];
		// prefer a word start or camel hump for this character if one exists ahead
		let best = -1;
		for (let j = ti; j < t.length; j++) {
			if (t[j] !== c) continue;
			if (best < 0) best = j;
			const isStart = j === 0 || /[\s\-_./:]/.test(text[j - 1]) || (text[j] !== t[j] && text[j - 1] === t[j - 1]);
			if (isStart || j === prev + 1) {
				best = j;
				break;
			}
		}
		if (best < 0) return null;
		const isStart = best === 0 || /[\s\-_./:]/.test(text[best - 1]) || (text[best] !== t[best] && text[best - 1] === t[best - 1]);
		score += 1;
		if (best === prev + 1) score += 5;
		if (isStart) score += 8;
		if (best === 0) score += 4;
		score -= Math.min(best - ti, 10) * 0.2;
		positions.push(best);
		prev = best;
		ti = best + 1;
	}
	if (t === q) score += 30;
	else if (t.startsWith(q)) score += 15;
	score -= text.length * 0.02;
	return { score, positions };
}
