---
title: Events, lifecycle and services
section: "Rebuild: foundations"
order: 10
summary: Three small pieces the kernel is made of. A typed event bus that reaches one window or all of them, the phases a window goes through from boot to shutdown, and a container of lazy shared services.
---
# Events, lifecycle and services

The last foundation chapter builds three small files the kernel will hold: the **event bus** (`kernel/events.ts`), the **lifecycle** (`kernel/lifecycle.svelte.ts`) and the **service registry** (`kernel/services.ts`). Each is short; each uses a TypeScript technique you will see again in every extension point FaNWiT offers.

<Callout kind="why">

Modules must cooperate without importing each other: the notes module should not need the search module's code to tell it a note was saved. An **event** says "this happened" to whoever listens; a **service** says "here is a shared object" to whoever asks for it by name. Both keep modules independent, so any one of them can be removed. And because windows open and close while the app runs, everything needs to know which **phase** it is in: still booting, ready, or about to shut down (where unsaved work may veto the close).

</Callout>

## Typed events by declaration merging

<Source path="src/fanwit/kernel/events.ts" from="export interface Events {}" until="export type EventScope" />

`Events` starts empty. A module adds its own events to it from its own file:

```ts
declare module "$fanwit" {
	interface Events {
		"notes:saved": { path: string };
	}
}
```

From then on `ctx.events.emit("notes:saved", { path })` is checked: a misspelled name or a payload of the wrong shape fails to compile, in every module that uses it.

<Callout kind="new" title="New here: declaration merging, conditional types and string & &#123;&#125;">

- **Declaration merging**: TypeScript merges every `interface Events` declared for the same module into one. That is what lets each module add entries without editing the core.
- `EventPayload<K> = K extends keyof Events ? Events[K] : unknown` is a **conditional type**: if the name is a known event, the payload has its declared type; otherwise `unknown`.
- `keyof Events | (string & {})` accepts any string while still offering the known names in your editor's completion. A plain `| string` would swallow the known names into `string`; intersecting with `{}` keeps them visible.

</Callout>

### Scopes: one window, or all

<Source path="src/fanwit/kernel/events.ts" from="export class EventBus" to="}" />

`emit` with the default scope `"window"` delivers to listeners in this window only. With `"app"`, it goes through the host (`host.events`), which on the desktop is Tauri's event system and on the web a `BroadcastChannel`, so every window of the app hears it, this one included. `on` subscribes locally and, the first time a name is used, bridges it from the host too. `onAny` sees every event, which is what the developer tools' event monitor shows.

## The lifecycle

<Source path="src/fanwit/kernel/lifecycle.svelte.ts" from="export type Phase" to="}" />

A window goes **boot** (the kernel is being built) → **ready** (first paint) → **restored** (the last session is back) → **idle** (startup work done) → **willShutdown** → **shutdown**. Code that needs a phase waits for it: `await lifecycle.when("restored")` resolves at once if that phase has passed, or when it arrives.

`onWillShutdown` lets a module veto closing: `e.veto(hasUnsaved(), "Unsaved notes")`. `collectVetoes` asks everyone, waits for each answer at most five seconds (a hung plugin must not trap the user), and returns the reasons of the vetoes that held, which the window then shows in a dialog.

<Source path="src/fanwit/kernel/lifecycle.svelte.ts" from="	async collectVetoes" to="	}" />

<Callout kind="new" title="New here: Promise.race, Promise.all and filter with a type predicate">

- `Promise.race([answer, timeout])` settles with whichever settles first: the module's answer, or `false` after the timeout.
- `Promise.all(list)` waits for every promise in a list, in parallel, and gives their results in order.
- `.filter((r): r is string => !!r)` uses a type predicate in a callback: the result's type is `string[]`, not `(string | null)[]`, because the filter told TypeScript what it keeps.

</Callout>

<Source path="src/fanwit/kernel/lifecycle.svelte.ts" />

## Services

<Source path="src/fanwit/kernel/services.ts" from="export class ServiceRegistry" to="}" />

A service is a **lazy singleton**: provided as a factory, created on the first `get`, the same instance for every caller after that. `instance ??= Promise.resolve(e.factory())` stores the promise, not the result, so two calls that arrive at the same time still share one instance even if the factory is async. If nobody provides the id yet, `resolveMissing` gives the kernel a chance to activate the module that declares it (`onService:<id>`), the same lazy loading as commands.

`Services` is extended by declaration merging exactly like `Events`, so `ctx.services.get("notes.index")` returns a typed `NotesIndex`.

<Source path="src/fanwit/kernel/services.ts" />

<Source path="src/fanwit/kernel/events.ts" />

## Checkpoint

Add `src/fanwit/kernel/events.test.ts`:

<Source path="src/fanwit/kernel/events.test.ts" />

```sh
pnpm vitest run src/fanwit/kernel
```

That completes the foundations: every piece the kernel is made of exists and is tested. Next, the kernel itself.

<Check question="The Settings window and the main window both need to refresh when a note is saved in either. Which scope does the save event use?" options={["window: the default", "app: it goes through the host, so every window of the app hears it", "backend"]} answer={1}>

`window` events never leave the window they were emitted in. `app` events travel through the host to every window, including the sender.

</Check>
