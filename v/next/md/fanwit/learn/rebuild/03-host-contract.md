# The host contract

FaNWiT runs on the desktop (inside Tauri) and on the web (a static site), and its tests run in Node with no window at all. Three very different machines. This chapter writes the one file that makes them look the same to the rest of the code: `host/types.ts`, the **host contract**, and then the simplest host that keeps it, one that lives entirely in memory.

<Callout kind="why">

Code that asks "am I in Tauri?" spreads: one `if` in the settings service, another in the vault, a third in a plugin, each a little different and each a bug waiting for the web build. The specification's rule (Section 3.3) is that exactly one layer knows where FaNWiT runs, the **host**, and everything above it talks to an interface. Features never import `@tauri-apps/*`; where the platforms differ, they read a capability (`host.caps.nativeWindows`) instead of the platform's name.

</Callout>

```tikz caption="Everything above the host is the same code everywhere; only the host changes" alt="The kernel and services on top call one Host interface; below it, a Tauri host, a browser host and a memory host each implement it"
\begin{tikzpicture}[x=1mm,y=1mm,
  h/.style={fwnode,fwhost,text width=34mm,minimum height=13mm,font=\small},
  up/.style={fwnode,fwcore,text width=118mm,minimum height=10mm,font=\small}]
\node[up] (sys) at (60,26) {kernel, services, views, plugins: \textit{host.fs.readText(path)}, \textit{host.caps.nativeWindows}};
\node[fwnode,fill=fwWarmSoft,draw=fwWarm,text width=118mm,minimum height=9mm,font=\small\ttfamily] (contract) at (60,13) {interface Host \{ kind, platform, caps, dirs, fs, db, windows, events, dialog, ... \}};
\node[h] (t) at (18,-3) {TauriHost\\[1pt]{\scriptsize desktop: Rust commands}};
\node[h] (b) at (60,-3) {BrowserHost\\[1pt]{\scriptsize web: OPFS, SQLite WASM}};
\node[h] (m) at (102,-3) {MemoryHost\\[1pt]{\scriptsize tests: a Map of files}};
\draw[fwarrow] (sys) -- (contract);
\draw[fwdash] (t) -- (t |- contract.south); \draw[fwdash] (b) -- (contract); \draw[fwdash] (m) -- (m |- contract.south);
\end{tikzpicture}
```

## The contract

Create `src/fanwit/host/types.ts`. It is almost all interfaces: no logic, just the promise every host keeps. Read it as a table of contents of what an app needs from a computer.

### Who and where

<Source path="src/fanwit/host/types.ts" from="export type HostKind" to="}" />

`kind` says which host this is (rarely needed), `platform` which operating system, and `caps` what it can do. Notice the capabilities are not just booleans: `fileSystem` is `"full" | "fs-access" | "opfs" | "memory"`, because "can it read files?" has four honest answers, and code that picks a folder needs to know which.

<Callout kind="new" title="New here: string literal unions as enums">

`"windows" | "macos" | "linux" | "web"` is a type with exactly four possible values. TypeScript checks every assignment, completes the values in your editor, and in a `switch` over it can tell you a case is missing. FaNWiT uses these everywhere instead of `enum`: they are plain strings at run time, so they survive JSON (settings files, IPC) unchanged.

</Callout>

### Files

<Source path="src/fanwit/host/types.ts" from="export interface FsEntry" until="allowRoot(path: string)" />

Every path is a string with forward slashes. Every method returns a `Promise`, even where the memory host could answer at once, because on the desktop each one is a call into Rust. Two methods carry design decisions:

- `writeToml` writes a value into a TOML file **without destroying its comments**: the next chapter is about how.
- `allowRoot` exists because the desktop sandboxes file access (the Rust core refuses paths outside the folders you chose). On other hosts it does nothing, but callers do not need to know that.

`watch` returns `Promise<Disposable>`: watching starts asynchronously, and stops when you dispose the result. The pattern from the last chapter, already doing its job.

### The rest of the machine

<Source path="src/fanwit/host/types.ts" from="export interface HostDirs" until="close(handle: number): Promise<void>;" />

`HostDirs` names the four folders an app owns (config, data, cache, logs). `HostDb` is SQLite through integer handles: `open` gives a number, every other call takes it. Numbers cross the boundary into Rust or a Web Worker easily; database objects would not.

Then windows, events, notifications, global keys, dialogs, logging and app information, each a small interface. Skim them now; you will implement each for real later. One more is worth reading closely:

<Source path="src/fanwit/host/types.ts" from="export interface Host {" to="}" />

Two things to notice. `invoke<T>` is the escape hatch to the backend's own commands (on the desktop, any `fw_*` Rust command); and several members end in `?` (`plugins?`, `autostart?`, `lockVault?`): optional, because some hosts simply cannot. Callers write `host.autostart?.get()`, and TypeScript makes them handle the missing case.

<Callout kind="new" title="New here: optional members and optional chaining">

`autostart?: {...}` means the property may be absent. Reading it gives `T | undefined`, and `host.autostart?.get()` calls `get` only if `autostart` exists (the whole expression is `undefined` otherwise). `?.` also works for calls (`fn?.()`) and indexing (`list?.[0]`).

</Callout>

### Paths

The file ends with four helpers every host shares:

<Source path="src/fanwit/host/types.ts" from="export function joinPath" />

Windows paths use backslashes, everything else forward slashes; FaNWiT normalises to forward slashes at the edge, so the rest of the code only ever sees one kind.

<Callout kind="new" title="New here: regular expressions">

`/[\\/]+$/` is a **regular expression**, a pattern for text, between slashes. `[\\/]` matches a backslash or a slash, `+` means one or more, `$` means "at the end". So `p.replace(/[\\/]+$/, "")` removes trailing slashes. `/^[\\/]+|[\\/]+$/g` removes them at both ends (`^` is the start, `|` is "or", the `g` flag replaces every match, not just the first). JavaScript's [regular expressions guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions) covers the syntax; you will meet a few more as the rebuild goes.

</Callout>

The whole contract:

<Source path="src/fanwit/host/types.ts" />

## The app's identity

Several hosts need the app's name, identifier and URL scheme. They come from one generated file:

<Source path="src/fanwit/gen/identity.ts" open="true" />

Its source of truth is `fanwit.app.toml`; later, `pnpm fw rename` regenerates this file (and the Tauri config, the Rust crate name, the installer) from it. For now, write it by hand with your app's values.

<Callout kind="new" title="New here: as const">

`as const` makes TypeScript treat the object as **read only and exact**: `identity.slug` has the type `"fanwit"`, not `string`, and assigning to it is an error. Useful for generated constants that code should never change.

</Callout>

## The memory host

Now the first implementation: `src/fanwit/host/memory.ts`. It keeps files in a `Map`, has no windows, no database and no dialogs, and is exactly what tests need. The other hosts borrow small pieces of it, so it comes first.

### A file system in a Map

<Source path="src/fanwit/host/memory.ts" from="export class MemoryFs implements HostFs" until="private missing(p: string): never" />

Files are a `Map` from path to bytes, folders a `Set` of paths. `put` creates the parent folders as it goes, and fires a change event that `watch` can hear.

<Callout kind="new" title="New here: implements, Map, Set and Uint8Array">

- `class MemoryFs implements HostFs` asks TypeScript to check that the class has every member of the interface, with the right types. Forget one and the class does not compile.
- `Map<string, Uint8Array>` is a dictionary with any key type and fast lookups (`get`, `set`, `has`, `delete`); `Set<string>` is a collection of unique values. Both keep insertion order.
- `Uint8Array` is an array of bytes. Files are bytes; `TextEncoder` turns a string into UTF-8 bytes and `TextDecoder` turns them back.

</Callout>

<Source path="src/fanwit/host/memory.ts" from="private missing(p: string): never" to="	}" />

<Callout kind="new" title="New here: the never type">

A function returning `never` never returns: it always throws. TypeScript uses that: in `this.files.get(p) ?? this.missing(p)`, the result can only be a `Uint8Array`, because the right side never produces a value. The error also gets a `code` of `"ENOENT"`, the same code Node and the Rust side use for "no such file", so callers can test for it the same way everywhere.

</Callout>

The rest of `MemoryFs` is what you would expect: `list` filters paths by prefix (only direct children unless `recursive`), `rename` moves a file or every file under a folder, `watch` subscribes to the change emitter and filters by path. `writeToml` uses `mergeToml`, which is the next chapter.

### Events, windows and the host itself

<Source path="src/fanwit/host/memory.ts" from="export class LocalEvents" to="}" />

`LocalEvents` is an emitter per event name: events reach only this window, because in a test there is only one. `stubWindows` returns a `HostWindows` whose methods do nothing (or throw, for `open`), which the browser host will reuse and override piece by piece.

Finally `createMemoryHost` puts the pieces together into a `Host`. Read it once: it is the simplest complete answer to "what does FaNWiT need from a machine?"

<Source path="src/fanwit/host/memory.ts" />

<Callout kind="new" title="New here: intersection types">

`createMemoryHost(...): Host & { fs: MemoryFs }` returns a value that is a `Host` **and** has an `fs` that is specifically a `MemoryFs`. Tests can then reach memory-only helpers (`host.fs.files`) while everything else sees a plain `Host`.

</Callout>

## Checkpoint

Create `src/fanwit/host/memory.test.ts`:

<Source path="src/fanwit/host/memory.test.ts" />

The last test writes TOML, which needs the next chapter: for now run the others,

```sh
pnpm vitest run src/fanwit/host -t "paths|disk|watchers"
```

and come back to the TOML test after the next chapter.

<Check question="A view needs to know whether it can open a real OS window. What should it check?" options={["Whether window.__TAURI_INTERNALS__ exists", "host.caps.nativeWindows", "host.platform === &quot;windows&quot;"]} answer={1}>

Capabilities describe what the host can do, not what it is. A future host (a remote one, a new platform) only has to set its capabilities right, and every feature adapts without a single new `if`.

</Check>
