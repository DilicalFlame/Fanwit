// An example TypeScript install step. Use it from installer.toml with:
//
// [[step]]
// id = "welcomeNote"
// type = "custom"
// runtime = "ts"
// handler = "example.welcomeNote"
// phases = ["bootstrap"]
//
// Real steps follow the same shape: check what is there, queue what is missing.
import { defineInstallStep } from "../steps";

export default defineInstallStep({
	id: "example.welcomeNote",
	summary: "Write a welcome note to the app data folder",
	async check(ctx) {
		return (await ctx.exists("{appData}/welcome.md")) ? "satisfied" : "missing";
	},
	apply(ctx) {
		ctx.writeFile("{appData}/welcome.md", `# Welcome\n\nInstalled for ${ctx.scope === "machine" ? "everyone" : "you"} with: ${ctx.components.join(", ")}.\n`);
		// the inverse of writeFile already removes it on uninstall; undo is for anything extra
	}
});
