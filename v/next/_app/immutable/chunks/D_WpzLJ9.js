const t=`// The worker half: commands live here, drawing lives in ui.html. They talk through events.
import { definePlugin } from "@fanwit/plugin-sdk";

export default definePlugin((ctx) => {
	ctx.commands.handle("sketchPad.clear", async () => {
		await ctx.storage.set("strokes", []);
		await ctx.events.emit("sketchPad.cleared", {});
	});
});
`;export{t as default};
