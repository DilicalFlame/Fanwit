/** Blender showcase scene: every area (whatever editor it shows) reads and edits this. */
export interface Obj {
	id: string;
	name: string;
	kind: "mesh" | "camera" | "light";
	loc: [number, number, number];
	rot: [number, number, number];
	scale: number;
	color: string;
	hidden?: boolean;
	/** Turns with the timeline (degrees per frame). */
	spin?: number;
}

export const scene = $state({
	selected: "cube" as string | null,
	frame: 1,
	end: 120,
	playing: false,
	objects: [
		{ id: "cube", name: "Cube", kind: "mesh", loc: [0, 0, 0], rot: [0, 0, 0], scale: 1, color: "#9ca3af", spin: 3 },
		{ id: "cube2", name: "Cube.001", kind: "mesh", loc: [2.6, 0, -1.4], rot: [0, 30, 0], scale: 0.6, color: "#60a5fa" },
		{ id: "camera", name: "Camera", kind: "camera", loc: [-3, -1.5, 3], rot: [0, 0, 0], scale: 1, color: "#e5e7eb" },
		{ id: "light", name: "Light", kind: "light", loc: [2, -3, 2], rot: [0, 0, 0], scale: 1, color: "#facc15" }
	] as Obj[]
});

export const selectedObj = () => scene.objects.find((o) => o.id === scene.selected) ?? null;

let timer: ReturnType<typeof setInterval> | undefined;
export function togglePlay() {
	scene.playing = !scene.playing;
	clearInterval(timer);
	if (scene.playing) timer = setInterval(() => (scene.frame = scene.frame >= scene.end ? 1 : scene.frame + 1), 1000 / 24);
}
