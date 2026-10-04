---
title: Modules
section: Guides
order: 1
summary: A feature in two halves, data the app reads at boot and code it loads on first use.
---
# Modules

A <Term name="module" /> is one feature of your app: notes, sync, an exporter. It has two halves. **Contributions** are data the app reads at boot without running any code. **Activation** is code that loads only when the module is first needed.

<Callout kind="why">

If every feature runs its setup code at startup, the app gets slower with each one you add, and a broken feature can stop the whole app from starting. Splitting a feature into data and code lets the app show every command, menu item and view before any of their code exists. The code arrives on the first click.

</Callout>

## The two halves

<Tabs labels="module.ts, activate.ts">

```ts
import { defineModule } from "$fanwit";

export default defineModule({
	id: "hello",
	contributes: {
		commands: [{ id: "hello.greet", title: "Say hello", args: { name: { type: "string", default: "world" } }, cli: true }],
		keybindings: [{ command: "hello.greet", key: "mod+alt+h" }],
		views: [{ id: "hello.panel", title: "Hello", component: () => import("./views/HelloView.svelte") }]
	},
	activate: () => import("./activate")
});
```

```ts
import type { ModuleContext } from "$fanwit";

export default function activate(ctx: ModuleContext) {
	ctx.commands.handle("hello.greet", ({ name }) => {
		ctx.notify.toast(`Hello, ${name}`);
		return { greeted: name };
	});
}
```

</Tabs>

<Steps>

1. Create it with `pnpm fw add module hello`. It lands in `src/app/modules/hello/`, and the app finds it by glob, so there is nothing to register.
2. Declare what it adds in `contributes`: commands, keybindings, views, menus, settings, windows and more.
3. Write the code in `activate.ts`. It receives a <Api symbol="ModuleContext" /> and runs once, the first time the module is needed.

</Steps>

Run the command the module above declares:

```fanwit-run
hello.greet {"name": "Asha"}
```

## When the code loads

A module activates when one of its activation events fires. Most events are implicit: contributing a command adds `onCommand:<id>`, and contributing a view adds `onView:<id>`.

| Event | Fires when |
|---|---|
| `onStartup` | Before first paint (core only) |
| `onStartupFinished` | After first paint, in an idle callback |
| `onCommand:<id>` | Implicit for every contributed command |
| `onView:<id>` | A contributed view becomes visible |
| `onWindow:<kind>` | A window of that kind opens |
| `onVault`, `onVaultFile:*.md` | A vault opens, or contains matching files |
| `onUri:<module>` | A deep link targets the module |

<Callout kind="under-the-hood">

At boot the kernel walks every module's `contributes` and hands each key to the system that owns it. Commands go to the command registry and views to the layout. Each system records the owner. The first time an event matches, the module's `activate` loader is imported and called. If it throws, only that module fails, and the error names it.

</Callout>

## The module context

Every call through `ctx` is attributed to your module. Settings live under your id, everything you register (commands, listeners, keys, views) is disposed when the module deactivates, and errors name the owner. The full list of what `ctx` offers is in the [ModuleContext reference](manual://fanwit/api/ModuleContext).

<Check question="Your module contributes a command but has no onStartup event. When does activate.ts run?" options={["At app start, like every module", "The first time the command runs (or another of its events fires)", "Never: commands need onStartup"]} answer={1}>

Contributing a command adds `onCommand:<id>` to the module's events. Until it fires, the command still shows in the palette and menus, because that part is data.

</Check>

## Pitfalls

- **Work at import time.** Code at the top level of `module.ts` runs at boot for every user. Keep `module.ts` to the definition, and put the work in `activate`.
- **`onStartup` by habit.** It defeats lazy loading. Prefer an implicit event, or `onStartupFinished` if the module must run early.
- **Forgetting to dispose.** Anything you create outside `ctx` (timers, DOM listeners) should go into `ctx.subscriptions` wrapped with `toDisposable`.
