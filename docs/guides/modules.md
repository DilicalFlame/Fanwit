---
title: Modules
section: Guides
order: 1
---
# Modules

A module has two halves: **contributions** (data, read at boot without running code) and **activation** (code, loaded when an activation event fires).

```ts
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

## Activation events

| Event | Fires when |
|---|---|
| `onStartup` | Before first paint (core only) |
| `onStartupFinished` | After first paint, in an idle callback |
| `onCommand:<id>` | Implicit for every contributed command |
| `onView:<id>` | A contributed view becomes visible |
| `onWindow:<kind>` | A window of that kind opens |
| `onVault`, `onVaultFile:*.md` | A vault opens, or contains matching files |
| `onUri:<module>` | A deep link targets the module |

## The module context

Every call through `ctx` is attributed to your module: settings live under your id, everything you register is disposed when the module deactivates, and errors name the owner.

```fanwit-run
hello.greet {"name": "Asha"}
```
