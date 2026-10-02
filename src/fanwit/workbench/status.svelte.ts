/** Status bar items contributed by modules with priority and alignment (Section 8.3.1). */
import { toDisposable, type Disposable } from "../kernel/disposable";

export interface StatusItemSpec {
	id: string;
	align?: "left" | "right";
	priority?: number;
	text?: string;
	icon?: string;
	tooltip?: string;
	command?: string;
	args?: Record<string, unknown>;
	when?: string;
	/** Accessible name when the text is an icon or number. */
	label?: string;
}

export interface StatusItem extends StatusItemSpec {
	owner: string;
	/** Optional component rendered instead of text (core items like the bell). */
	component?: unknown;
}

export class StatusService {
	items = $state<StatusItem[]>([]);

	add(spec: StatusItemSpec & { component?: unknown }, owner: string): Disposable & { update(p: Partial<StatusItemSpec>): void; item: StatusItem } {
		const item: StatusItem = { align: "left", priority: 0, ...spec, owner };
		this.items = [...this.items.filter((i) => i.id !== spec.id), item];
		const self = this;
		return {
			item,
			update(p) {
				const i = self.items.findIndex((x) => x.id === spec.id);
				if (i >= 0) self.items[i] = { ...self.items[i], ...p };
			},
			dispose() {
				self.items = self.items.filter((i) => i.id !== spec.id);
			}
		};
	}

	/** Plugin SDK style handle: `const item = ctx.statusbar.item("wordCount.item"); item.text = "12 words"`. */
	item(id: string, owner: string) {
		const existing = this.items.find((i) => i.id === id);
		if (!existing) this.add({ id }, owner);
		const self = this;
		return {
			get text() {
				return self.items.find((i) => i.id === id)?.text;
			},
			set text(t: string | undefined) {
				const i = self.items.findIndex((x) => x.id === id);
				if (i >= 0) self.items[i] = { ...self.items[i], text: t };
			},
			set tooltip(t: string | undefined) {
				const i = self.items.findIndex((x) => x.id === id);
				if (i >= 0) self.items[i] = { ...self.items[i], tooltip: t };
			},
			dispose: () => toDisposable(() => (self.items = self.items.filter((i) => i.id !== id))).dispose()
		};
	}

	sorted(align: "left" | "right") {
		return this.items.filter((i) => (i.align ?? "left") === align).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}
}
