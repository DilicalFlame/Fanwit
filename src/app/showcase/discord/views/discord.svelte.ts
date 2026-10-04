/** Discord showcase: servers, channels and messages. */
export interface Message {
	id: number;
	author: string;
	text: string;
	time: string;
}
export interface Server {
	id: string;
	name: string;
	color: string;
	channels: { id: string; name: string; voice?: boolean }[];
}

let seq = 0;
const now = () => new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const m = (author: string, text: string): Message => ({ id: ++seq, author, text, time: now() });

export const PEOPLE: Record<string, { color: string; status: "online" | "idle" | "offline"; bot?: boolean }> = {
	you: { color: "#5865f2", status: "online" },
	Ada: { color: "#eb459e", status: "online" },
	Linus: { color: "#57f287", status: "idle" },
	Grace: { color: "#fee75c", status: "online" },
	Layoutbot: { color: "#ed4245", status: "online", bot: true },
	Ken: { color: "#9b84ee", status: "offline" }
};

export const chat = $state({
	server: "fanwit",
	channel: "general",
	muted: false,
	deafened: false,
	servers: [
		{ id: "fanwit", name: "Fanwit", color: "#5865f2", channels: [{ id: "general", name: "general" }, { id: "layouts", name: "layouts" }, { id: "showcase", name: "showcase" }, { id: "lounge", name: "Lounge", voice: true }] },
		{ id: "design", name: "Design Club", color: "#eb459e", channels: [{ id: "critique", name: "critique" }, { id: "inspiration", name: "inspiration" }, { id: "studio", name: "Studio", voice: true }] },
		{ id: "games", name: "Game Night", color: "#57f287", channels: [{ id: "lobby", name: "lobby" }, { id: "clips", name: "clips" }] }
	] as Server[],
	messages: {
		general: [m("Ada", "Morning! Has anyone tried the new layout presets?"), m("Linus", "The Blender one is wild, every area switches editors."), m("Grace", "Discord in four columns of the same layout system 👀")],
		layouts: [m("Layoutbot", "Every column here is a tab set with a hidden strip. Drag the borders to resize them.")],
		showcase: [m("Grace", "Post your favourite preset here.")]
	} as Record<string, Message[]>
});

const REPLIES = ["Nice!", "Same here 😄", "Ship it 🚀", "That layout is just TOML, try editing it.", "Can you pop that out into its own window?", "+1"];

export function send(text: string) {
	(chat.messages[chat.channel] ??= []).push(m("you", text));
	const channel = chat.channel;
	setTimeout(() => {
		const who = ["Ada", "Linus", "Grace", "Layoutbot"][seq % 4];
		(chat.messages[channel] ??= []).push(m(who, REPLIES[seq % REPLIES.length]));
	}, 900);
}

export const server = () => chat.servers.find((s) => s.id === chat.server)!;
