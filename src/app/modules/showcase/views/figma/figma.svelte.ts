/** Figma showcase state: shared by the canvas and its floating panels. */
export type Tool = "move" | "frame" | "rect" | "ellipse" | "text" | "hand";
export interface Shape {
	id: string;
	type: "frame" | "rect" | "ellipse" | "text";
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
	radius: number;
	opacity: number;
	text?: string;
	hidden?: boolean;
}

let seq = 10;
export const figma = $state({
	tool: "move" as Tool,
	selected: null as string | null,
	pan: { x: 300, y: 80 },
	zoom: 1,
	shapes: [
		{ id: "s1", type: "frame", name: "Mobile home", x: 0, y: 0, w: 260, h: 480, fill: "#ffffff", radius: 18, opacity: 100 },
		{ id: "s2", type: "rect", name: "Hero card", x: 20, y: 70, w: 220, h: 140, fill: "#6366f1", radius: 14, opacity: 100 },
		{ id: "s3", type: "text", name: "Title", x: 20, y: 24, w: 200, h: 32, fill: "#111827", radius: 0, opacity: 100, text: "Good morning" },
		{ id: "s4", type: "ellipse", name: "Avatar", x: 196, y: 20, w: 44, h: 44, fill: "#f59e0b", radius: 0, opacity: 100 },
		{ id: "s5", type: "rect", name: "Button", x: 20, y: 400, w: 220, h: 48, fill: "#111827", radius: 24, opacity: 100 },
		{ id: "s6", type: "rect", name: "Sticky note", x: 330, y: 40, w: 180, h: 160, fill: "#fde68a", radius: 4, opacity: 100 }
	] as Shape[]
});

export const selectedShape = () => figma.shapes.find((s) => s.id === figma.selected) ?? null;

export function addShape(type: Shape["type"], x: number, y: number, w: number, h: number): Shape {
	const fills = { frame: "#ffffff", rect: "#38bdf8", ellipse: "#f472b6", text: "#111827" };
	const s: Shape = { id: `s${++seq}`, type, name: `${type[0].toUpperCase()}${type.slice(1)} ${seq}`, x, y, w, h, fill: fills[type], radius: type === "frame" ? 8 : 0, opacity: 100, text: type === "text" ? "Text" : undefined };
	figma.shapes.push(s);
	figma.selected = s.id;
	return s;
}

export function removeSelected() {
	figma.shapes = figma.shapes.filter((s) => s.id !== figma.selected);
	figma.selected = null;
}
