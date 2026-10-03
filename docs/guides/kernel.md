---
title: Kernel
section: Guides
order: 15
---
# Kernel

The kernel boots once per window and owns the service container, context keys, event bus, lifecycle and logger.

## Services

```ts
declare module "$fanwit" { interface Services { "notes.index": NotesIndex } }
ctx.services.provide("notes.index", () => new NotesIndex(ctx));
const index = await ctx.services.get("notes.index");
```

## Events

Typed by declaration merging; scopes are window (default), app (all windows) and backend.

## Lifecycle

`ctx.lifecycle.onWillShutdown(e => e.veto(dirty, "Unsaved notes"))` asks before a window closes.

## Errors

Every error is a `FanwitError` with a stable code, a message, a hint and a docs link.
