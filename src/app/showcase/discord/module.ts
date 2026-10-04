import { defineModule } from "$fanwit";
import { preset, v } from "../_shared/contrib";
import discord from "./presets/discord.toml?raw";

/** Discord look-alike: one layout preset plus its mock views. Strip it with `pnpm fw strip showcase-discord`. */
export default defineModule({
	id: "showcase.discord",
	title: "Discord showcase",
	contributes: {
		layoutPresets: [preset("discord", "Discord", discord, "Servers, channels, chat and members side by side")],
		views: [
			v("showcase.discord.titlebar", "Discord title bar", "app-window", () => import("./views/Titlebar.svelte"), { singleton: true }),
			v("showcase.discord.servers", "Servers", "server", () => import("./views/Servers.svelte"), { singleton: true }),
			v("showcase.discord.channels", "Channels", "hash", () => import("./views/Channels.svelte"), { singleton: true }),
			v("showcase.discord.chat", "Chat", "message-square", () => import("./views/Chat.svelte"), { singleton: true }),
			v("showcase.discord.members", "Members", "users", () => import("./views/Members.svelte"), { singleton: true })
		]
	}
});
