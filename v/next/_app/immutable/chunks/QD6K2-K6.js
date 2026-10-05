const t=`// Runs inside the sandboxed frame. window.fanwit is the plugin ctx (permission checked).
const c = document.getElementById("c");
const g = c.getContext("2d");
let strokes = [];
let color = "currentColor";
let cur = null;

function fit() {
	const r = window.devicePixelRatio || 1;
	c.width = c.clientWidth * r;
	c.height = c.clientHeight * r;
	g.setTransform(r, 0, 0, r, 0, 0);
	draw();
}
function draw() {
	const ink = getComputedStyle(document.body).color;
	g.clearRect(0, 0, c.width, c.height);
	g.lineWidth = 2.5;
	g.lineCap = g.lineJoin = "round";
	for (const s of strokes) {
		g.strokeStyle = s.color === "currentColor" ? ink : s.color;
		g.beginPath();
		s.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
		g.stroke();
	}
}
c.addEventListener("pointerdown", (e) => {
	c.setPointerCapture(e.pointerId);
	cur = { color, points: [[e.offsetX, e.offsetY]] };
	strokes.push(cur);
});
c.addEventListener("pointermove", (e) => {
	if (!cur) return;
	cur.points.push([e.offsetX, e.offsetY]);
	draw();
});
c.addEventListener("pointerup", () => {
	cur = null;
	fanwit.storage.set("strokes", strokes);
});
for (const b of document.querySelectorAll("[data-color]"))
	b.addEventListener("click", () => {
		color = b.dataset.color;
		document.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b));
	});
document.getElementById("clear").addEventListener("click", () => fanwit.commands.run("sketchPad.clear"));

fanwit.onReady(async () => {
	strokes = (await fanwit.storage.get("strokes")) || [];
	fanwit.events.on("sketchPad.cleared", () => ((strokes = []), draw()));
	draw();
});
new ResizeObserver(fit).observe(c);
new MutationObserver(draw).observe(document.documentElement, { attributes: true });
`;export{t as default};
