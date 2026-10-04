/**
 * Animated diagrams: a TikZ figure marks parts of itself with scopes (docs/_tex/fanwit-diagrams.sty),
 * which reach the SVG as <g data-...> groups, and this plays them with GSAP.
 *
 * - `reveal=N`: appears at step N (fades and rises in; its lines draw themselves).
 * - `flow`: particles stream along its lines, the way data moves through them.
 * - `packet`: a glowing dot travels along its first line, again and again.
 * - `pulse`: breathes gently, to point at it.
 *
 * Reduced motion shows the finished picture and plays nothing.
 */
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { reduced } from "../motion/motion";

gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin);

/** fwBrand: the dark reading themes invert diagrams, which keeps it a strong accent there too. */
const ACCENT = "#4f46e5";
const SVG_NS = "http://www.w3.org/2000/svg";

export interface FigureAnimation {
	/** Play the reveal again from the start. */
	replay(): void;
	/** Stop the endless parts while the figure is off screen. */
	pause(paused: boolean): void;
	kill(): void;
}

/** Lines (stroked, unfilled paths) inside `root`: what draws in, and what particles follow. */
const lines = (root: Element) => [...root.querySelectorAll<SVGPathElement>("path")].filter((p) => p.getAttribute("fill") === "none" && p.getAttribute("stroke"));

/** True when the figure has anything to animate. */
export const animated = (svg: Element) => !!svg.querySelector("[data-reveal], [data-flow], [data-packet], [data-pulse]");

export function animateFigure(svg: SVGSVGElement): FigureAnimation | null {
	if (reduced() || !animated(svg)) return null;
	const ctx = gsap.context(() => {});
	let loops: gsap.core.Timeline | null = null;
	let started = false;
	let hidden = false;

	const build = () =>
		ctx.add(() => {
			// steps in order; groups with the same number arrive together
			const groups = [...svg.querySelectorAll<SVGGElement>("[data-reveal]")];
			const steps = [...new Set(groups.map((g) => Number(g.dataset.reveal) || 0))].sort((a, b) => a - b);
			const intro = gsap.timeline();
			steps.forEach((n, i) => {
				const at = i * 0.55;
				const here = groups.filter((g) => (Number(g.dataset.reveal) || 0) === n);
				intro.from(here, { opacity: 0, y: 6, duration: 0.5, ease: "power2.out" }, at);
				// drawSVG works through stroke-dasharray, so a dashed line would lose its dashes: it only fades in
				const strokes = here.flatMap(lines).filter((p) => !p.getAttribute("stroke-dasharray"));
				if (strokes.length) intro.from(strokes, { drawSVG: "0%", duration: 0.7, ease: "power1.inOut" }, at);
			});

			// the endless parts start once everything has arrived (a dot must not run along a line not drawn yet)
			intro.call(() =>
				ctx.add(() => {
					endless();
					started = true;
					if (!hidden) loops?.play();
				})
			);
		});

	function endless() {
		loops = gsap.timeline({ paused: true });
		for (const g of svg.querySelectorAll<SVGGElement>("[data-flow]"))
			for (const p of lines(g)) {
				const dots = p.cloneNode() as SVGPathElement;
				const width = Number(p.getAttribute("stroke-width") || 0.8);
				dots.setAttribute("stroke", ACCENT);
				dots.setAttribute("stroke-width", String(width * 2.4));
				dots.setAttribute("stroke-linecap", "round");
				dots.setAttribute("stroke-dasharray", "0.1 7");
				dots.removeAttribute("stroke-dashoffset");
				dots.setAttribute("pointer-events", "none");
				dots.dataset.fwAnim = "";
				p.after(dots);
				loops.to(dots, { strokeDashoffset: -7.1, duration: 0.6, repeat: -1, ease: "none" }, 0);
			}
		for (const g of svg.querySelectorAll<SVGGElement>("[data-packet]")) {
			const path = lines(g)[0];
			if (!path) continue;
			const dot = document.createElementNS(SVG_NS, "g");
			dot.dataset.fwAnim = "";
			dot.innerHTML = `<circle r="6" fill="${ACCENT}" opacity="0.22"/><circle r="2.6" fill="${ACCENT}"/>`;
			svg.append(dot);
			loops.to(dot, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5] }, duration: 1.8, repeat: -1, repeatDelay: 0.5, ease: "power1.inOut" }, 0);
		}
		for (const g of svg.querySelectorAll<SVGGElement>("[data-pulse]")) loops.to(g, { opacity: 0.45, duration: 1.1, repeat: -1, yoyo: true, ease: "sine.inOut" }, 0);
	}

	build();
	return {
		replay() {
			ctx.revert();
			for (const el of svg.querySelectorAll("[data-fw-anim]")) el.remove();
			started = false;
			build();
		},
		pause(paused) {
			hidden = paused;
			if (paused) loops?.pause();
			else if (started) loops?.play();
		},
		kill() {
			ctx.revert();
			for (const el of svg.querySelectorAll("[data-fw-anim]")) el.remove();
		}
	};
}
