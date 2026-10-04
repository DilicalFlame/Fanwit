---
title: Kernel
section: Guides
order: 15
summary: One small core per window, and the shared tools every module builds on.
---
# Kernel

The <Api symbol="Kernel" /> boots once per window. It owns the core every module builds on: the command registry, key bindings, context keys, the event bus, the service container, undo history, lifecycle and logging. Systems such as layout, settings and windows attach to it. Modules don't use it directly: they get a `ctx`, which wraps it and keeps track of what each module registers.

<Callout kind="why">

Every window has its own kernel, because a window is its own webview. That keeps windows independent: a crash or a slow view in one doesn't stall the others, and each window boots only what it shows. Shared state crosses windows deliberately, through `app` scoped events and files, never through hidden globals. The `ctx` wrapper exists so that everything a module registers can be removed when it deactivates. That is what makes a plugin turned off truly gone.

</Callout>

## Services

Lazy singletons shared between modules, typed by id:

```ts
declare module "$fanwit" { interface Services { "notes.index": NotesIndex } }
ctx.services.provide("notes.index", () => new NotesIndex(ctx));
const index = await ctx.services.get("notes.index");
```

A module that lists `services: ["notes.index"]` in `contributes` is activated the first time someone asks for that service.

## Events

Typed by declaration merging (see <Api symbol="Events" />). Scopes are `window` (the default, this window only), `app` (every window) and `backend`.

```ts
declare module "$fanwit" { interface Events { "notes:saved": { path: string } } }
ctx.events.emit("notes:saved", { path }, { scope: "app" });
```

## Lifecycle

`ctx.lifecycle.onWillShutdown(e => e.veto(dirty, "Unsaved notes"))` asks the user before a window closes with unsaved work.

## Errors

Every error is a <Api symbol="FanwitError" />: a stable code, a message, a hint that says what to do, and a docs link. `ctx.notify.error(e)` shows all of it. The [Error codes](manual://fanwit/reference/errors) page lists every code the source throws.

<Callout kind="under-the-hood">

Boot runs in a fixed order: pick the host, create the core services, attach the systems, register every module's contributions (no module code runs yet), load the user's settings, keys, menus and commands, and then the layout. Only then do `onStartup` modules activate. The whole sequence is timed: `k.lifecycle` records each phase, and the Module Profiler (developer tools) shows them next to each module's activation time.

</Callout>

## Pitfalls

- **Module level singletons.** A `const cache = new Map()` at the top of a file is shared by nothing across windows and survives deactivation. Use a service, or state on `ctx`.
- **`app` scope for everything.** Every window receives an app event. Keep chatty events window scoped.
- **Throwing plain `Error`s.** They reach the user without a hint. Throw a `FanwitError` with a hint for anything a user might see.
