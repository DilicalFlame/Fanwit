---
title: The browser host
section: "Rebuild: foundations"
order: 3
summary: FaNWiT on the web. Files in the browser's private file system or a folder the user picks, SQLite in a worker, events between tabs, a lock per vault, and the function that picks the host at boot.
---
# The browser host

The memory host forgets everything when the page closes. The **browser host** is what the docs site and any web build of your app run on: a real, persistent machine made out of browser APIs. It is the longest host, because the web offers the same abilities as a desktop in a dozen different, partial ways, and this file collects them behind the one contract.

<Callout kind="why">

FaNWiT's promise is that the same app runs on the desktop and on the web, with the differences as capabilities rather than as different code. That puts the burden here: every method of `HostFs`, `HostDb`, `HostEvents` must work in a browser tab, with no server, as well as the platform allows, and report honestly (`caps`) where it cannot.

</Callout>

## Where files live

Browsers give a page two places to keep files:

- **OPFS** (Origin Private File System): a private file system per site, invisible to the user, fast, always available. FaNWiT keeps its config, data, caches and logs there (`/config`, `/global`, ...), and vaults you create in the browser.
- **File System Access**: a real folder on disk the user picks with `showDirectoryPicker()` (Chromium browsers). FaNWiT addresses those as `fsa://<id>/...`, and remembers the folder's handle in IndexedDB so it can reopen it next time (after asking for permission again).

<Source path="src/fanwit/host/browser.ts" from="	private async root(path: string)" to="	}" />

`root` turns a host path into a starting directory handle and the remaining path segments; `dirAt` and `fileAt` walk the segments.

<Callout kind="new" title="New here: regex capture groups">

`/^fsa:\/\/([^/]+)(\/.*)?$/.exec(path)` returns `null` or an array: `m[1]` is what the first parentheses matched (the folder id, any characters but `/`), `m[2]` the rest of the path or `undefined` (the `?` makes that group optional). Parentheses in a pattern **capture** what they match.

</Callout>

<Callout kind="new" title="New here: IndexedDB and wrapping callbacks in a promise">

`idb(...)` at the top of the file wraps IndexedDB, the browser's database for structured values, which reports results through `onsuccess` and `onerror` callbacks. `new Promise((resolve, reject) => { ... })` turns that into something you can `await`: call `resolve(value)` when it worked, `reject(error)` when not. Folder handles can be stored in IndexedDB (not in `localStorage`, which only holds strings).

</Callout>

## Watching for changes

Changes to OPFS can only come from this site, so the browser host **announces** them instead of polling: every write tells this tab's watchers, and other tabs through a `BroadcastChannel`. A picked folder can change behind the app's back (you edit a note in another editor), so it needs real watching: the new `FileSystemObserver` where the browser has it, else a poll that slows down when nothing changes and pauses while the tab is hidden.

<Source path="src/fanwit/host/browser.ts" from="	async watch(path: string" until="private deliver(events: FsEvent[])" />

<Callout kind="new" title="New here: for await, and globalThis feature checks">

- `for await (const [name, child] of h.entries())` loops over an **async iterator**: each step waits for the next entry. Directory handles hand out their entries one at a time like this.
- `(globalThis as unknown as { FileSystemObserver?: FsObserverCtor }).FileSystemObserver` checks for a browser feature TypeScript's built-in types do not know yet. `as unknown as X` is a double cast: "forget what you think this is, treat it as X". Use it only at the edge, like here, where the platform is ahead of the type definitions.

</Callout>

## SQLite in a worker

The web gets the real SQLite, compiled to WebAssembly, running in a **Web Worker** (a second thread for the page) with the OPFS "SAH pool" storage, which works on any static host. The host side posts messages and matches answers by id:

<Source path="src/fanwit/host/browser.ts" from="function sqliteDb()" to="}" />

<Callout kind="new" title="New here: Workers, postMessage and new URL(..., import.meta.url)">

A **Worker** runs a script on another thread; the two sides talk only by `postMessage`, and each message is copied. `new URL("./sqlite.worker.ts", import.meta.url)` gives the worker file's address relative to this module, which Vite recognises and bundles as a worker. The `pending` map turns the message stream back into one promise per call: the same shape as Tauri's `invoke`, which is the point.

</Callout>

The worker itself, `src/fanwit/host/sqlite.worker.ts`, opens databases, runs statements, and enforces one more rule: a plugin's statements may only touch tables named with its own prefix. SQLite calls an **authorizer** callback for every table a statement uses, and the worker refuses the others:

<Source path="src/fanwit/host/sqlite.worker.ts" from="function withOwner" to="}" />

<Source path="src/fanwit/host/sqlite.worker.ts" />

## The host itself

`createBrowserHost` assembles it, starting from the memory host's `stubWindows` and replacing what a browser can do: closing its own tab, a badge on an installed web app, focus and resize events, a `beforeunload` guard, fullscreen. Its capabilities are measured, not assumed:

<Source path="src/fanwit/host/browser.ts" from="		caps: {" until="sql: typeof Worker" />

<Callout kind="new" title="New here: the in operator and Web Locks">

`"Notification" in window` checks whether a property exists, the honest way to detect a browser feature. Further down, `lockVault` uses **Web Locks** (`navigator.locks.request`): a named lock the browser holds until the callback's promise settles, released automatically when the tab closes. It gives the web the same "one window owns a vault" rule the desktop gets from an OS file lock, crash-proof, with no server.

</Callout>

The whole file:

<Source path="src/fanwit/host/browser.ts" />

## Picking the host

Finally `src/fanwit/host/index.ts`, which every other file imports from:

<Source path="src/fanwit/host/index.ts" open="true" />

`pickHost` runs once at boot. If the app supplied its own host (a remote one), use it; if Tauri's internals are on the window, the Tauri host; otherwise the browser host. Each is loaded with `import()`, so the web build never downloads Tauri code and the desktop never downloads the OPFS code. The Tauri host comes in the Rust stage; until then, `pickHost` simply never takes that branch, because you run the web build.

<Callout kind="new" title="New here: export * from">

`export * from "./types"` re-exports everything `types.ts` exports, so other files write `import { joinPath, type Host } from "../host"` and never need to know which file inside `host/` holds what.

</Callout>

## Checkpoint

The browser host needs a browser, so the unit tests do not cover it; you will see it run when the window comes alive in stage 5. For now, check it type checks:

```sh
pnpm check
```

and that the host tests still pass:

```sh
pnpm vitest run src/fanwit/host
```

<Check question="Why does the browser host announce OPFS changes instead of polling for them?" options={["Polling is not allowed in browsers", "Only this site can write its OPFS, so every change passes through this code; it can tell watchers (and other tabs) directly", "OPFS does not support reading"]} answer={1}>

OPFS is private to the site: nothing else can change it. Announcing writes is exact and costs nothing. Picked folders are different, because other programs can change them, so those are observed or polled.

</Check>
