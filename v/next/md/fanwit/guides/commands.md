# Commands

A command is a named, typed action: `notes.newDaily`, `theme.select`, `layout.applyPreset`. Menus, keys, the palette, toolbar buttons, the CLI, deep links, plugins and tests all run commands. None of them call your functions directly.

<Callout kind="why">

Most apps wire each button straight to its code. Then one feature needs separate work for the menu item, the shortcut, the CLI flag and the test, and the copies drift apart: the menu checks a condition the shortcut forgets. FaNWiT has one door instead. Write the action once as a command, and every surface gets it, with the same validation, the same `when` rule and the same undo.

</Callout>

## What happens when one runs

Step through it, or press play:

<CommandPipeline />

## Declare it, then handle it

A command has two halves, and they live in different files on purpose.

<Steps>

1. **Declare** it in your module's `contributes.commands`. This is data: the palette, menus and the key editor can list it before any of your code has loaded.
2. **Handle** it in `activate(ctx)` with <Api symbol="ModuleContext" />'s `ctx.commands.handle`. This code loads the first time the command runs.
3. **Bind** a key, add it to a menu, or just find it in the palette (<Keys command="palette.open" />). Nothing else to wire.

</Steps>

<Tabs labels="module.ts, activate.ts">

```ts
import { defineModule } from "$fanwit";

export default defineModule({
	id: "notes",
	contributes: {
		commands: [
			{ id: "notes.newDaily", title: "Open today's daily note", category: "Notes", icon: "calendar", when: "vault.open", cli: true }
		]
	},
	activate: () => import("./activate")
});
```

```ts
import type { ModuleContext } from "$fanwit";

export default function activate(ctx: ModuleContext) {
	ctx.commands.handle("notes.newDaily", async () => {
		const path = `Daily/${new Date().toISOString().slice(0, 10)}.md`;
		if (!(await ctx.vault.fs.exists(path))) await ctx.vault.fs.write(path, "");
		await ctx.layout.openView("notes.editor", { path });
		return path;
	});
}
```

</Tabs>

`pnpm fw add command notes.newDaily` writes both halves for you.

### Try it

This is a real module. **Run** registers it in the app you are reading, so its command appears in the palette (<Keys command="palette.open" />, type "greet"). Run it from there or with the button. Run it once without a name and the palette asks for one, because `name` is declared but missing. **Stop** removes the module and everything it added.

<Playground mode="module" title="Your first command">

```js
export default defineModule({
	id: "greeter",
	contributes: {
		commands: [
			{ id: "greeter.greet", title: "Greet me", category: "Playground", args: { name: { type: "string" } } }
		]
	},
	activate(ctx) {
		ctx.commands.handle("greeter.greet", ({ name }) => {
			ctx.notify.toast(`Hello, ${name}!`);
			console.log("greeted", name);
		});
	}
});
```

</Playground>

<Check question="A command is in the palette, a menu and a keybinding. Where does its logic live?" options={["Three times: once for each place", "Once, in the handler registered with ctx.commands.handle", "In the menu item's onclick"]} answer={1}>

Every surface runs `commands.run(id, args)`, and that reaches the one handler. The palette entry, the menu item and the key are data that point at the id.

</Check>

<Callout kind="under-the-hood">

Because the declaration is data, the first run of `notes.newDaily` fires the activation event `onCommand:notes.newDaily`, which loads `activate.ts` and only then calls the handler. Until that moment the module has cost nothing, which is how an app with many features still starts fast.

</Callout>

## Ids

Ids are `<module>.<verbObject>` in camel case (`notes.newDaily`), and titles are sentence case ("Open today's daily note"). Prefix ids with your module id so they never collide. When you rename a command, list the old id in `deprecatedAliases`. Keys, menus and scripts that use the old id keep working.

## Arguments

One schema powers three things: validation, palette prompts for missing arguments, and CLI flags.

| Arg type | Palette prompt | CLI |
|---|---|---|
| string | text input | `--name value` |
| number | numeric input | `--size 12` |
| boolean | yes or no | `--force`, `--no-force` |
| enum | pick list | `--mode split` |
| path | picker | positional, resolved against cwd |
| ref | quick pick of commands, views, themes | `--theme nord-ish` |

Run this without an argument: the palette asks for the missing `value`.

```fanwit-run
fanwit.setDensity
```

## Undo

A handler that returns `{ undo, redo?, label }` joins the undo history. Group several steps into one with `ctx.history.transaction(label, fn)`, so a single undo reverts all of them.

```fanwit-run
history.undo
```

## User commands and macros

`commands.toml` composes commands without code. Each entry appears in the palette, in menus and in the key editor, like any other command:

```toml
[[command]]
id = "user.focusWriting"
title = "Focus writing"
steps = [
  { run = "layout.toggleZen" },
  { run = "theme.setMode", args = { mode = "dark" } },
]
```

**Developer: Record Macro** captures the commands you run and writes them here.

## Pitfalls

- **Logic in a click handler.** If a button calls a function instead of a command, the shortcut, the menu and the CLI can't reach it. Make it a command.
- **A `when` the handler doesn't check.** The `when` clause is checked before the handler runs, so the handler can rely on it. Put the condition in `when` rather than in an `if` inside the handler, and the palette and menus will grey the command out to match.

See also: the <Term name="context key">context keys</Term> used in `when`, and the generated [Commands reference](manual://fanwit/reference/commands).
