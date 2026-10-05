const t=`// Runs in a Web Worker. The timer ticks here; the app only draws the tree it receives.
import { definePlugin } from "@fanwit/plugin-sdk";

export default definePlugin((ctx) => {
	const VIEW = "pomodoro.panel";
	const minutes = () => Number(ctx.settings.get("pomodoro.minutes")) || 25;
	let left = minutes() * 60;
	let timer = null;
	let done = 0;
	const item = ctx.statusbar.item("pomodoro.status");
	const mmss = (s) => \`\${String(Math.floor(s / 60)).padStart(2, "0")}:\${String(s % 60).padStart(2, "0")}\`;

	function draw() {
		item.text = timer ? \`● \${mmss(left)}\` : "";
		item.command = "pomodoro.toggle";
		ctx.ui.render(VIEW, {
			type: "stack",
			gap: 3,
			children: [
				{ type: "text", text: mmss(left), size: "xl", mono: true },
				{ type: "progress", value: 1 - left / (minutes() * 60), label: timer ? "Focusing" : left === minutes() * 60 ? "Ready" : "Paused" },
				{
					type: "row",
					children: [
						{ type: "button", label: timer ? "Pause" : "Start", icon: timer ? "pause" : "play", action: "toggle", variant: "primary" },
						{ type: "button", label: "Reset", icon: "rotate-ccw", action: "reset", variant: "ghost" }
					]
				},
				{ type: "select", id: "length", value: String(minutes()), options: ["5", "15", "25", "50"], action: "length" },
				{ type: "text", text: \`\${done} session\${done === 1 ? "" : "s"} done today\`, tone: "muted", size: "sm" }
			]
		});
	}
	function reset() {
		clearInterval(timer);
		timer = null;
		left = minutes() * 60;
		draw();
	}
	async function setLength(m) {
		await ctx.settings.set("pomodoro.minutes", Number(m));
		if (!timer) left = minutes() * 60;
		draw();
	}
	function toggle() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		} else {
			timer = setInterval(() => {
				left -= 1;
				if (left <= 0) {
					clearInterval(timer);
					timer = null;
					done += 1;
					left = minutes() * 60;
					ctx.notify.toast("Focus session done. Take a break.", "success");
				}
				draw();
			}, 1000);
		}
		draw();
	}
	ctx.ui.on(VIEW, async (action, value) => {
		if (action === "toggle") toggle();
		if (action === "reset") reset();
		if (action === "length") await setLength(value);
	});
	ctx.commands.handle("pomodoro.toggle", toggle);
	// the status item's context menu runs these (see plugin.toml menus)
	ctx.commands.handle("pomodoro.reset", reset);
	ctx.commands.handle("pomodoro.length", ({ minutes: m }) => setLength(m));
	ctx.commands.handle("pomodoro.open", () => ctx.commands.run("layout.openView", { view: VIEW }));
	draw();
});
`;export{t as default};
