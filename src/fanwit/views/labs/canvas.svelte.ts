/** Shapes for the Menu Lab canvas (the "Figma style colour menu" recipe). */
export interface Shape {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	fill: string;
	opacity: number;
	round: boolean;
	locked: boolean;
}

export const canvas = $state<{ shapes: Shape[]; selected: string[]; preview: Record<string, number> }>({
	shapes: [
		{ id: "a", x: 40, y: 40, w: 140, h: 100, fill: "#3b82f6", opacity: 100, round: false, locked: false },
		{ id: "b", x: 220, y: 80, w: 120, h: 120, fill: "#f97316", opacity: 100, round: true, locked: false },
		{ id: "c", x: 120, y: 200, w: 180, h: 70, fill: "#22c55e", opacity: 80, round: false, locked: false }
	],
	selected: [],
	preview: {}
});

export const selectedShapes = () => canvas.shapes.filter((s) => canvas.selected.includes(s.id));
