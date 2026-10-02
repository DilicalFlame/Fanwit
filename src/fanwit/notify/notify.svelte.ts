/**
 * Notification API (Chapter 10). One API, many surfaces (toast, OS, centre, banner, badge,
 * taskbar progress, attention), and an automatic routing policy (Figure 10.1) that channel
 * settings chosen by the user can override.
 */
import { Emitter, toDisposable, type Disposable } from "../kernel/disposable";
import { isFanwitError, toFanwitError } from "../kernel/errors";
import type { Host } from "../host/types";

export type NotifyKind = "info" | "success" | "warning" | "error" | "progress";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface NotifyAction {
	label: string;
	command: string;
	args?: Record<string, unknown>;
	primary?: boolean;
}

export interface NotificationSpec {
	id?: string;
	title: string;
	body?: string;
	kind?: NotifyKind;
	icon?: string;
	channel?: string;
	priority?: Priority;
	route?: "auto" | "toast" | "os" | "center" | "toast+os";
	actions?: NotifyAction[];
	duration?: number | "sticky";
	dedupeKey?: string;
	persist?: boolean;
	onClick?: { command: string; args?: Record<string, unknown> };
	source?: string;
}

export interface NotificationItem extends Required<Pick<NotificationSpec, "title" | "kind" | "priority">> {
	id: string;
	body?: string;
	icon?: string;
	channel: string;
	actions: NotifyAction[];
	time: number;
	read: boolean;
	count: number;
	source: string;
	onClick?: NotificationSpec["onClick"];
	progress?: { fraction: number | null; message?: string; cancellable: boolean; done: boolean };
	vault?: boolean;
}

export interface Toast {
	item: NotificationItem;
	duration: number | "sticky";
	remaining: number;
	started: number;
	paused: boolean;
}

export interface ChannelDef {
	id: string;
	title: string;
	description?: string;
	enabled?: boolean;
	toast?: boolean;
	os?: boolean;
	sound?: boolean;
	minPriority?: Priority;
}

export interface ProgressHandle {
	signal: AbortSignal;
	report(fraction: number | null, message?: string): void;
	done(message?: string): void;
	fail(err: unknown): void;
}

const PRIO: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
const DURATION: Record<NotifyKind, number | "sticky"> = { info: 4000, success: 4000, warning: 8000, error: "sticky", progress: "sticky" };
const RETENTION_DAYS = 30;

export class NotifyService {
	toasts = $state<Toast[]>([]);
	items = $state<NotificationItem[]>([]);
	dndUntil = $state<number | null>(null);
	centerOpen = $state(false);
	channels = $state<Record<string, ChannelDef>>({ default: { id: "default", title: "General" } });
	/** User overrides per channel (Settings, Notifications). */
	channelPrefs = $state<Record<string, Partial<ChannelDef>>>({});
	banners = $state<{ id: string; target: string; title: string; body?: string; kind: NotifyKind; actions: NotifyAction[] }[]>([]);
	readonly onDidSend = new Emitter<NotificationItem>();
	private seq = 0;
	private controllers = new Map<string, AbortController>();
	private timer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private host: Host,
		private runCommand: (id: string, args?: Record<string, unknown>) => Promise<unknown>,
		private persistItems: (items: NotificationItem[]) => void = () => {}
	) {
		if (typeof window !== "undefined") this.timer = setInterval(() => this.tick(), 200);
	}

	get unread() {
		return this.items.filter((i) => !i.read).length;
	}

	get dnd() {
		return !!this.dndUntil && this.dndUntil > Date.now();
	}

	setDnd(minutes: number | null) {
		this.dndUntil = minutes === null ? null : minutes <= 0 ? null : Date.now() + minutes * 60000;
	}

	restore(items: NotificationItem[]) {
		const cutoff = Date.now() - RETENTION_DAYS * 86400000;
		this.items = items.filter((i) => i.time > cutoff && i.kind !== "progress");
		void this.updateBadge();
	}

	addChannel(c: ChannelDef): Disposable {
		this.channels[c.id] = c;
		return toDisposable(() => delete this.channels[c.id]);
	}

	channel(id: string): Required<Omit<ChannelDef, "description">> & { description?: string } {
		const base = this.channels[id] ?? { id, title: id };
		const user = this.channelPrefs[id] ?? {};
		return { enabled: true, toast: true, os: true, sound: false, minPriority: "low", ...base, ...user } as Required<Omit<ChannelDef, "description">> & { description?: string };
	}

	private focused() {
		return typeof document === "undefined" ? true : document.hasFocus() && document.visibilityState === "visible";
	}

	send(spec: NotificationSpec): NotificationItem {
		const kind = spec.kind ?? "info";
		const priority = spec.priority ?? (kind === "error" ? "high" : "normal");
		const channel = this.channel(spec.channel ?? "default");
		const key = spec.dedupeKey ?? `${spec.title}\n${spec.body ?? ""}`;

		// duplicates within 5 s collapse with a counter
		const dupe = this.toasts.find((t) => (t.item.id === spec.id || `${t.item.title}\n${t.item.body ?? ""}` === key || t.item.id === key) && Date.now() - t.item.time < 5000);
		if (dupe && kind !== "progress") {
			dupe.item.count++;
			dupe.item.time = Date.now();
			dupe.remaining = typeof dupe.duration === "number" ? dupe.duration : dupe.remaining;
			return dupe.item;
		}

		const item: NotificationItem = {
			id: spec.id ?? `n${Date.now().toString(36)}${++this.seq}`,
			title: spec.title,
			body: spec.body,
			kind,
			priority,
			icon: spec.icon,
			channel: channel.id,
			actions: spec.actions ?? [],
			time: Date.now(),
			read: false,
			count: 1,
			source: spec.source ?? "app",
			onClick: spec.onClick
		};
		if (!channel.enabled || PRIO[priority] < PRIO[channel.minPriority]) return item;

		// routing policy (Figure 10.1)
		let toast = false,
			os = false,
			center = spec.persist ?? (kind === "warning" || kind === "error");
		const route = spec.route ?? "auto";
		if (route === "toast") toast = true;
		else if (route === "os") os = true;
		else if (route === "center") center = true;
		else if (route === "toast+os") toast = os = true;
		else if (this.dnd) {
			center = true;
			os = priority === "urgent";
		} else if (this.focused()) {
			toast = true;
		} else {
			os = true;
			center = true;
			if (PRIO[priority] >= PRIO.high) void this.host.notify.attention().catch(() => {});
		}
		toast &&= channel.toast;
		os &&= channel.os;

		if (toast) {
			const d = spec.duration ?? DURATION[kind];
			this.toasts.push({ item, duration: d, remaining: typeof d === "number" ? d : 0, started: Date.now(), paused: false });
			if (channel.sound) beep(kind);
		}
		if (os) void this.host.notify.os({ title: item.title, body: stripMd(item.body) }).catch(() => {});
		if (center || (!toast && !os)) this.addToCenter(item);
		this.onDidSend.fire(item);
		return item;
	}

	private addToCenter(item: NotificationItem) {
		if (this.items.some((i) => i.id === item.id)) return;
		this.items.unshift(item);
		this.save();
	}

	toast(text: string, kind: NotifyKind = "info") {
		return this.send({ title: text, kind, route: "toast", persist: false });
	}

	error(err: unknown, source = "app") {
		const e = toFanwitError(err);
		if (e.code === "CANCELLED") return null;
		const actions: NotifyAction[] = [];
		if (isFanwitError(err) && e.docs) actions.push({ label: "Open docs", command: "manual.open", args: { page: e.docs } });
		actions.push({ label: "Open logs", command: "dev.logs" });
		return this.send({ title: e.message, body: e.hint, kind: "error", actions, source, dedupeKey: e.code + e.message });
	}

	progress(spec: Omit<NotificationSpec, "kind"> & { cancellable?: boolean }): ProgressHandle {
		const ac = new AbortController();
		const item = this.send({ ...spec, kind: "progress", route: spec.route ?? "toast", duration: "sticky" });
		item.progress = { fraction: null, cancellable: !!spec.cancellable, done: false };
		this.controllers.set(item.id, ac);
		const refresh = () => (this.toasts = [...this.toasts]);
		return {
			signal: ac.signal,
			report: (fraction, message) => {
				item.progress = { ...item.progress!, fraction, message };
				refresh();
				void this.host.windows.setProgress(fraction).catch(() => {});
			},
			done: (message) => {
				item.progress = { ...item.progress!, fraction: 1, done: true };
				this.finish(item, message ?? item.title, "success");
			},
			fail: (err) => {
				item.progress = { ...item.progress!, done: true };
				this.finish(item, toFanwitError(err).message, "error");
			}
		};
	}

	private finish(item: NotificationItem, title: string, kind: NotifyKind) {
		this.controllers.delete(item.id);
		void this.host.windows.setProgress(null).catch(() => {});
		this.dismiss(item.id);
		// the finished job moves to the centre (and a short toast confirms it)
		this.send({ title, body: item.body, kind, source: item.source, persist: true, dedupeKey: item.id + "-done" });
	}

	cancel(id: string) {
		this.controllers.get(id)?.abort(new Error("Cancelled"));
	}

	dismiss(id: string) {
		this.toasts = this.toasts.filter((t) => t.item.id !== id);
	}

	pause(on: boolean) {
		for (const t of this.toasts) {
			if (on && !t.paused && typeof t.duration === "number") t.remaining -= Date.now() - t.started;
			if (!on) t.started = Date.now();
			t.paused = on;
		}
	}

	private tick() {
		const now = Date.now();
		const keep = this.toasts.filter((t) => t.paused || t.duration === "sticky" || now - t.started < t.remaining);
		if (keep.length !== this.toasts.length) this.toasts = keep;
	}

	async act(item: NotificationItem, a: NotifyAction | NotificationSpec["onClick"]) {
		if (!a) return;
		this.dismiss(item.id);
		this.markRead(item.id);
		await this.runCommand(a.command, a.args);
	}

	markRead(id?: string) {
		for (const i of this.items) if (!id || i.id === id) i.read = true;
		this.save();
	}

	remove(id: string) {
		this.items = this.items.filter((i) => i.id !== id);
		this.save();
	}

	clearAll() {
		this.items = [];
		this.toasts = this.toasts.filter((t) => t.item.kind === "progress");
		this.save();
	}

	snooze(id: string, ms: number) {
		const item = this.items.find((i) => i.id === id);
		if (!item) return;
		this.remove(id);
		// ponytail: in-session timer; persist snoozeUntil if snoozes must survive restarts
		setTimeout(() => this.send({ title: item.title, body: item.body, kind: item.kind, actions: item.actions, channel: item.channel, persist: true }), ms);
	}

	banner(b: { id?: string; target: string; title: string; body?: string; kind?: NotifyKind; actions?: NotifyAction[] }): Disposable {
		const id = b.id ?? `b${++this.seq}`;
		this.banners = [...this.banners.filter((x) => x.id !== id), { id, target: b.target, title: b.title, body: b.body, kind: b.kind ?? "info", actions: b.actions ?? [] }];
		return toDisposable(() => (this.banners = this.banners.filter((x) => x.id !== id)));
	}

	private save() {
		this.persistItems($state.snapshot(this.items) as NotificationItem[]);
		void this.updateBadge();
	}

	private async updateBadge() {
		await this.host.windows.setBadge(this.unread || null).catch(() => {});
	}

	dispose() {
		clearInterval(this.timer);
	}
}

function stripMd(s?: string) {
	return s?.replace(/[*_`#>]/g, "");
}

let audio: AudioContext | null = null;
/** Short tick for channels with sound enabled, and the web "bell" for blocked focus. */
export function beep(kind: NotifyKind | "bell" = "info") {
	try {
		audio ??= new AudioContext();
		const o = audio.createOscillator();
		const g = audio.createGain();
		o.frequency.value = kind === "error" ? 330 : kind === "bell" ? 880 : 660;
		g.gain.setValueAtTime(0.06, audio.currentTime);
		g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.04);
		o.connect(g).connect(audio.destination);
		o.start();
		o.stop(audio.currentTime + 0.05);
	} catch {
		/* audio unavailable */
	}
}
