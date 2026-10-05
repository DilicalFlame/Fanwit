---
title: The core handlers
section: "Rebuild: the window"
order: 2
summary: What the core commands do. Short handlers that call the services, menus that act on the thing they were opened on, quitting without losing work, links that can only run what they are allowed to, and a macro recorder built from the command log.
---
# The core handlers

Chapter 24 declared the core commands. This chapter makes them do something: `core/handlers.svelte.ts`, one function, `activateCore`, called from the core module's `activate`.

<Callout kind="why">

Every core command is a **thin** handler: a line or two that calls a service built in an earlier chapter. That is no accident. The logic lives in services, which have tests. Commands are the public, undoable, scriptable doors into them. Read a handler, and you can see at a glance which service does the work. If a handler grows, it usually means a service is missing something.

</Callout>

## Shape

<Source path="src/fanwit/core/handlers.svelte.ts" from="export function activateCore" to="	};" />

- `k.sys` holds the services boot creates (chapter 30). Destructuring them once keeps every handler short.
- `h(id, fn)` is `ctx.commands.handle`. It attaches a handler to a command declared elsewhere, and is disposed with the module (chapter 13).
- `targetPane(inv)` answers "which tab?". When the command came from a tab's context menu, the invocation carries that menu's **target** (chapter 22), so **Close tab** closes the tab you right clicked, not the one that happens to be active. Without a target, it falls back to the active pane.

<Callout kind="new" title="New here: Parameters<typeof f>[1]">

`Parameters<typeof ctx.commands.handle>[1]` reads as "the type of the second parameter of `ctx.commands.handle`". `typeof` (in a type position) takes the type of a value, `Parameters<F>` turns a function type into a tuple of its parameter types, and `[1]` indexes it. The wrapper `h` thus accepts exactly what `handle` accepts, with nothing retyped by hand that could drift.

</Callout>

## Thin by design

The palette commands just open the palette with a prefix (chapter 23):

<Source path="src/fanwit/core/handlers.svelte.ts" from="	// ----- palette -----" until="palette.windows" />

Layout commands turn into chapter 19's actions. `L(...)` marks them as coming from a command, for the Layout Lab's timeline:

<Source path="src/fanwit/core/handlers.svelte.ts" from="	// ----- layout -----" until="toggleZen" />

Tabs show the same pattern, with one addition. Closing a tab whose view reported unsaved changes (`layout.dirty`, chapter 20) asks first:

<Source path="src/fanwit/core/handlers.svelte.ts" from="	// ----- tabs -----" until="tab.reopen" />

`F6` and `Shift+F6` (`layout.focusNextRegion`) move keyboard focus between the title bar, sidebar, main area, panel and status bar. They find each region by its `data-fw-region` attribute, then focus its first focusable element. That is how a keyboard user gets out of an editor and into the sidebar without a mouse.

## Quitting without losing work

<Source path="src/fanwit/core/handlers.svelte.ts" from="async function confirmShutdown" to="}" />

<Source path="src/fanwit/core/handlers.svelte.ts" from="async function flushAll" to="}" />

Quit is two steps:

1. **Ask.** Chapter 12's lifecycle collects **vetoes**: any module may say "this document has unsaved changes". If there are any, they are listed in one dialog. If not, and the `general.confirmQuit` setting is on, a plain confirmation is shown.
2. **Flush.** Every TOML file has a debounced write pending (chapters 15 to 22). `flushAll` writes them all at once and ignores individual failures, since one stuck file must not stop the others from saving. Only then does the host exit.

<Callout kind="new" title="New here: Promise.all over Promise.resolve(...).catch">

`Promise.all(list)` waits for every promise in parallel and fails if one fails. Each item here is wrapped first: `Promise.resolve(p)` turns a plain value (or `undefined`, when a file does not exist) into a promise, and `.catch(() => {})` turns a failure into success. Together they mean "try all of these at once, wait for all, never fail". `Promise.allSettled` is the built in alternative when you want the individual outcomes.

</Callout>

## Links

`fanwit://run/theme.setMode?mode=dark` in a browser, an email or a note runs a command in the app. Links can come from any web page, so they need a firm rule:

<Source path="src/fanwit/core/handlers.svelte.ts" from="export async function handleDeepLink" to="}" />

- Only commands declared with `uri: true` can be run by a link. Anything else fails with `PERMISSION_DENIED`.
- Query parameters become arguments, and go through the same validation as any other run (chapter 10). A link cannot pass a value the command's schema rejects.
- `confirmed: false` means a command with `confirm` always asks, even if the link says otherwise.
- Other hosts (`fanwit://notes/...`) wake the module of that name with the `onUri:notes` activation event and hand it the link.

`openPath` handles files and folders passed to the app: from the CLI, from double clicking a file associated with the app, or from a second launch. A folder opens as a vault. A file opens its folder as a vault if needed, then opens the file in the first view that declares its extension.

## A macro recorder in 30 lines

Every command run already passes through one place, chapter 10's pipeline, which emits `onDidExecute`. Recording a macro is just listening to it:

<Source path="src/fanwit/core/handlers.svelte.ts" from="function startMacroRecorder" to="}" />

Run **Record macro**, use the app, and run it again. The commands you ran, with their arguments, are saved to `commands.toml` as a user command with `steps`. That file is chapter 9's user commands, so the macro gets a palette entry, can be bound to a key, and can be edited by hand.

## Context keys from layout

<Source path="src/fanwit/core/handlers.svelte.ts" from="function effectRoot" to="}" />

`$effect` normally belongs to a component and stops when the component is destroyed. A module is not a component, so `$effect.root` creates an effect owner by hand, and its cleanup function is added to the module's subscriptions. Here it keeps `layout.sidebarVisible`, `layout.inspectorVisible` and `layout.panelVisible` in sync with the document, for menus that show a check mark next to **Toggle panel**.

<Callout kind="new" title="New here: why this file is .svelte.ts">

Runes (`$state`, `$effect`, `$effect.root`) only work in `.svelte` and `.svelte.ts` files, because the Svelte compiler has to rewrite them. A plain `.ts` file can import and use reactive classes, but cannot create effects. That is why this file, and every service with `$state` fields, has the double extension. [Svelte docs: .svelte.js and .svelte.ts files](https://svelte.dev/docs/svelte/svelte-js-files)

</Callout>

<Source path="src/fanwit/core/handlers.svelte.ts" />

## Checkpoint

The handlers need the whole app around them, and the end to end tests in "Rebuild: tools and shipping" run them that way. The link rules are worth a unit test of their own, since they guard a door the web can knock on:

<Source path="src/fanwit/core/deeplink.test.ts" />

```sh
pnpm vitest run src/fanwit/core
```

<Check question="A web page links to fanwit://run/vault.backup. vault.backup is declared with cli: true but not uri: true. What happens when someone clicks it?" options={["The backup runs, because the command is public", "Nothing runs: handleDeepLink refuses commands without uri: true", "The app asks for confirmation, then runs it"]} answer={1}>

Each door is opened separately. `cli: true` lets the terminal run a command, `uri: true` lets links run it, and `palette: false` keeps it out of the palette. A terminal is something you are typing into yourself, while a link can come from anyone, so being on one list never implies the other.

</Check>
