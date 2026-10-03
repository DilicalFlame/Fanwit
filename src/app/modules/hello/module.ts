import { defineModule } from "$fanwit";

/** The fifteen line example from the spec (Section 4.1): a command, a shortcut, a menu entry, a palette entry, a CLI subcommand and a lazy view. */
export default defineModule({
	id: "hello",
	contributes: {
		commands: [{ id: "hello.greet", title: "Say hello", category: "Hello", icon: "hand", args: { name: { type: "string", default: "world" } }, cli: true }],
		keybindings: [{ key: "mod+alt+h", command: "hello.greet" }],
		menus: { "view/title": [{ id: "hello.greet", command: "hello.greet", group: "navigation" }] },
		views: [{ id: "hello.panel", title: "Hello", icon: "hand", component: () => import("./views/HelloView.svelte") }]
	},
	// loaded only when hello.greet runs or hello.panel is shown
	activate: () => import("./activate")
});
