/**
 * Motion (GSAP) and haptics. Small, fast and interruptible: entrances use `use:enter`, exits
 * use `out:leave` (a CSS transition eased by GSAP's curves). Press states are plain CSS in
 * layout.css. Everything is skipped under reduced motion (OS setting or ui.reducedMotion).
 */
import { gsap } from "gsap";

gsap.defaults({ overwrite: "auto" });

export const DUR = { fast: 0.12, base: 0.18, slow: 0.26 } as const;

/** Reduced motion: the OS setting or Settings, Appearance, Reduce motion. */
export function reduced(): boolean {
	if (typeof document === "undefined") return true;
	return document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Vars = gsap.TweenVars;

/** Starting states for entrances; elements animate from these to their natural state. */
const PRESETS = {
	/** menus, popovers: grow from the anchor side */
	pop: { opacity: 0, scale: 0.96, y: -4, duration: DUR.fast },
	/** sub menus: slide in from the parent row */
	side: { opacity: 0, x: -6, duration: DUR.fast },
	/** command palette: drop from the title bar */
	drop: { opacity: 0, y: -10, scale: 0.98, duration: DUR.base },
	/** dialogs and windows inside the page */
	dialog: { opacity: 0, scale: 0.95, y: 6, duration: DUR.base, ease: "back.out(1.4)" },
	/** toasts: slide in from the screen edge */
	toast: { opacity: 0, x: 28, duration: DUR.base, ease: "power3.out" },
	/** panels sliding in from the right (notification center, drawers) */
	right: { opacity: 0, x: 24, duration: DUR.base, ease: "power3.out" },
	left: { opacity: 0, x: -24, duration: DUR.base, ease: "power3.out" },
	/** content changes (pages, steps): a short rise */
	rise: { opacity: 0, y: 6, duration: DUR.base },
	/** rows appearing in a list (expanded folders, new tabs) */
	row: { opacity: 0, y: -3, duration: DUR.fast },
	fade: { opacity: 0, duration: DUR.base }
} satisfies Record<string, Vars>;

export type Preset = keyof typeof PRESETS;

export interface EnterOptions {
	preset?: Preset;
	/** Overrides merged into the preset (e.g. x for direction aware steps). */
	from?: Vars;
	delay?: number;
	/** Stagger these children instead of animating the node itself. */
	stagger?: string;
	/** Transform origin, or a function evaluated when the animation starts. */
	origin?: string | (() => string);
	/** false: render in place without animating (initial rows of a list). */
	when?: boolean;
}

// rows mounting in the same frame (an expanded folder) cascade instead of popping together
let burst = 0;
let burstFrame = 0;
function burstDelay(): number {
	if (!burstFrame) burstFrame = requestAnimationFrame(() => ((burst = 0), (burstFrame = 0)));
	return Math.min(burst++, 12) * 0.015;
}

/** `<div use:enter={"pop"}>` or `use:enter={{ preset: "rise", stagger: "> *" }}`. */
export function enter(node: HTMLElement, opts: Preset | EnterOptions = "fade") {
	const o: EnterOptions = typeof opts === "string" ? { preset: opts } : opts;
	if (o.when === false || reduced()) return;
	const { duration, ...from } = { ...PRESETS[o.preset ?? "fade"], ...o.from } as Vars;
	const targets = o.stagger ? node.querySelectorAll(o.stagger.startsWith(">") ? `:scope ${o.stagger}` : o.stagger) : node;
	const tween = gsap.from(targets, {
		...from,
		duration,
		ease: from.ease ?? "power2.out",
		delay: o.delay ?? (o.preset === "row" ? burstDelay() : 0),
		stagger: o.stagger ? 0.035 : undefined,
		transformOrigin: typeof o.origin === "string" ? o.origin : undefined,
		// a function origin reads the final layout (menus flip after mounting)
		onStart: typeof o.origin === "function" ? () => void gsap.set(node, { transformOrigin: (o.origin as () => string)() }) : undefined,
		clearProps: "opacity,transform"
	});
	return { destroy: () => void tween.kill() };
}

/**
 * Exit transition for `out:leave={{ preset }}`: Svelte keeps the node until it ends, the CSS
 * runs on the compositor, and the curve is GSAP's.
 */
export function leave(node: Element, o: { preset?: "pop" | "dialog" | "toast" | "right" | "fade"; duration?: number } = {}) {
	// whatever is leaving must not swallow the next click (a palette backdrop fading out)
	(node as HTMLElement).style.pointerEvents = "none";
	if (reduced()) return { duration: 0 };
	const ease = gsap.parseEase("power2.in");
	const p = o.preset ?? "fade";
	return {
		duration: (o.duration ?? (p === "toast" || p === "right" ? 160 : 100)),
		easing: (t: number) => 1 - ease(1 - t),
		css: (t: number) => {
			const u = 1 - t;
			const transform =
				p === "pop" ? `scale(${1 - u * 0.03})` : p === "dialog" ? `scale(${1 - u * 0.04}) translateY(${u * 4}px)` : p === "toast" || p === "right" ? `translateX(${u * 24}px)` : "none";
			return `opacity:${t};transform:${transform}`;
		}
	};
}

const PRESSABLE = 'button, [role="button"]';
// rows, backdrops, draggable handles and opted out elements keep the CSS shade instead
const NOT_PRESSABLE = '.w-full, [class*="inset-0"], :disabled, [aria-disabled="true"], [data-no-press], [draggable="true"]';

/**
 * Press feedback for every button in this window: dip while held, spring back on release.
 * Size aware, so a wide card moves about as many pixels as a small icon button.
 */
export function attachPress(root: Document = document): () => void {
	let pressed: HTMLElement | null = null;
	// the element's own inline transition, kept across quick repeated presses
	const saved = new WeakMap<HTMLElement, string>();
	const release = () => {
		const el = pressed;
		pressed = null;
		if (!el) return;
		gsap.to(el, {
			scale: 1,
			duration: 0.32,
			ease: "back.out(3)",
			clearProps: "transform",
			onComplete: () => {
				el.style.transition = saved.get(el) ?? "";
				saved.delete(el);
			}
		});
	};
	const down = (e: PointerEvent) => {
		if (e.button !== 0 || reduced()) return;
		const el = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
		if (!el || el.matches(NOT_PRESSABLE)) return;
		const r = el.getBoundingClientRect();
		// about 4 px of travel whatever the size: 0.92 for icon buttons, 0.99 for wide cards
		const scale = Math.min(0.99, Math.max(0.92, 1 - 4 / Math.max(r.width, r.height, 1)));
		pressed = el;
		// a component's own CSS transition on transform would smear GSAP's frames
		if (!saved.has(el)) saved.set(el, el.style.transition);
		el.style.transition = "none";
		gsap.to(el, { scale, duration: 0.08, ease: "power2.out" });
	};
	root.addEventListener("pointerdown", down, true);
	root.addEventListener("pointerup", release, true);
	root.addEventListener("pointercancel", release, true);
	root.addEventListener("dragstart", release, true);
	return () => {
		root.removeEventListener("pointerdown", down, true);
		root.removeEventListener("pointerup", release, true);
		root.removeEventListener("pointercancel", release, true);
		root.removeEventListener("dragstart", release, true);
	};
}

/** A small "something happened here" pulse (copied, saved, applied). */
export function pulse(el: Element | null | undefined) {
	if (!el || reduced()) return;
	gsap.fromTo(el, { scale: 1 }, { scale: 1.06, duration: 0.09, yoyo: true, repeat: 1, ease: "power1.out", clearProps: "transform" });
}

/** Refusal feedback (a blocked window, an invalid drop): a short horizontal shake. */
export function shake(el: Element | null | undefined) {
	if (!el) return;
	if (reduced()) return void gsap.fromTo(el, { opacity: 0.6 }, { opacity: 1, duration: 0.2, clearProps: "opacity" });
	gsap.fromTo(el, { x: 0 }, { keyframes: { x: [-6, 5, -3, 2, 0] }, duration: 0.28, ease: "none", clearProps: "transform" });
}

export type HapticKind = "tick" | "select" | "success" | "warning";
const PATTERNS: Record<HapticKind, number | number[]> = { tick: 6, select: 10, success: [8, 40, 8], warning: [24, 40, 24] };
let hapticsOn = true;

/** Settings, Appearance, Haptic feedback. */
export function setHaptics(on: boolean) {
	hapticsOn = on;
}

/**
 * Haptic feedback where the device has a vibration motor (phones and tablets running the web
 * build). Desktop browsers and WebViews have no haptics API, so there it does nothing and the
 * visual press states carry the feedback.
 */
export function haptic(kind: HapticKind = "tick") {
	if (!hapticsOn || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
	try {
		navigator.vibrate(PATTERNS[kind]);
	} catch {
		/* blocked until the user has interacted with the page */
	}
}
