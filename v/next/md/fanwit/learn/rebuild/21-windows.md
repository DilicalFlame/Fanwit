# Windows

An export dialog, a floating inspector, a preferences window, a popped out editor: apps open windows all the time, and each platform does it differently. This chapter builds `windows/windows.svelte.ts`, the service behind `ctx.windows.open(kind, props)`. The Rust side that creates native windows comes in "Rebuild: the Rust core".

<Callout kind="why">

"Open a 520 by 420 window, owned by this one, without a taskbar button, that beeps and shakes when you click its parent" is what a module would otherwise have to say, and it is wrong in a browser, which has no owned windows or taskbar. FaNWiT lets a module say what it **means** instead: a `child` window, `focus = "lock"`. The service turns that into the closest thing each platform has: a native owned window on the desktop, a modal with an inert page behind it on the web. The module's code is the same on both.

</Callout>

```tikz caption="One kind, two presentations" alt="ctx.windows.open with kind export goes to the window service, which resolves the spec from base defaults. On desktop it asks the host for a native window via Rust. On the web it picks a virtual window, a modal, a browser tab or popup, or picture in picture."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=9mm,font=\scriptsize,text width=26mm}]
\node[b,fwuser] (open) at (0,0) {\texttt{windows.open(}\\\texttt{"export", props)}};
\node[b,fwcore] (svc) at (36,0) {WindowService\\base defaults + spec};
\node[b,fwwarm] (nat) at (80,14) {native window\\(host, Rust)};
\node[b,fwwarm] (web) at (80,-14) {web presentation};
\node[b,fill=fwPaper,draw=fwSlate,text width=20mm] (v) at (118,-2) {virtual window};
\node[b,fill=fwPaper,draw=fwSlate,text width=20mm] (m) at (118,-12) {modal};
\node[b,fill=fwPaper,draw=fwSlate,text width=20mm] (t) at (118,-22) {tab or popup};
\node[b,fill=fwPaper,draw=fwSlate,text width=20mm] (p) at (118,-32) {picture in picture};
\draw[fwarrow] (open) -- (svc);
\draw[fwarrow] (svc) -- node[fwlabel,above,sloped]{desktop} (nat);
\draw[fwarrow] (svc) -- node[fwlabel,below,sloped]{browser} (web);
\foreach \x in {v,m,t,p} \draw[fwarrow] (web.east) -- (\x.west);
\end{tikzpicture}
```

## Kinds

A module declares **kinds** of window, not windows. A kind has a `base` (what sort of window it is), a root `view` (chapter 19), and any options it wants to change:

<Source path="src/fanwit/windows/windows.svelte.ts" from="export interface WindowKindSpec" to="}" />

Each base comes with defaults, so most kinds only state the base, the view and a title:

<Source path="src/fanwit/windows/windows.svelte.ts" from="export const DEFAULTS" to="}" />

`resolveSpec` spreads the kind over its base's defaults. Anything the kind sets wins.

<Callout kind="new" title="New here: Record over a union, and spread order">

`Record<WindowBase, Partial<WindowKindSpec>>` requires **every** base to have an entry: add `"popover"` to `WindowBase` and this object no longer compiles until you give it defaults. That is a cheap way to make "did you handle every case?" a type error. `{ ...DEFAULTS[s.base], ...s }` copies the defaults first and the spec second, so later keys overwrite earlier ones.

</Callout>

## Opening a window

`open` returns a **handle**. Its `result` is a promise that settles when the window closes, with the value the window closed with:

```ts
const win = await ctx.windows.open<{ format: string }>("export", { path });
const choice = await win.result; // { format: "pdf" }, or undefined if closed with the X
```

A dialog becomes a function call that returns its answer. No callback props, no events to clean up.

<Source path="src/fanwit/windows/windows.svelte.ts" from="	async open<R = unknown>" to="	}" />

On the desktop:

- **One instance per identity.** The window's label (its name to Tauri) is built from the kind and its `identity`. Opening a kind that is already open focuses that window instead of opening a second one.
- **Everything travels in the URL.** A native window is a new webview with its **own kernel**, started fresh at `/w/<kind>`. The props, the opener's label, the vault and the spec itself go in the query string, which is all the new window gets. That is why the spec is sent along: a kind registered at runtime would otherwise be unknown over there.
- **The result comes back as an app event.** The child calls `close(value)`, which emits `fw:window-result` to every window. The opener's pending resolver for that label settles the promise. If the window is destroyed without a value, the host's `fw://window-destroyed` event resolves it with `undefined`. Either way, the opener never hangs.

<Callout kind="new" title="New here: a promise resolved from outside">

```ts
let resolve!: (v: R | undefined) => void;
const result = new Promise<R | undefined>((r) => (resolve = r));
```

A promise's executor runs immediately, so this captures its `resolve` function in a variable. Whoever holds `resolve` can settle the promise later, from anywhere: here, from an event listener or a close button. The `!` in `let resolve!:` is a **definite assignment assertion**: it tells TypeScript the variable is assigned before use (by the executor), which it cannot see on its own. Newer runtimes have `Promise.withResolvers()` for the same thing.

`URLSearchParams` builds a query string with proper escaping: `new URLSearchParams({ label, opener })`, then `q.set("props", JSON.stringify(props))`, then `` `/w/${route}?${q}` ``.

</Callout>

## On the web

A browser has no native windows. `openVirtual` picks a presentation:

<Source path="src/fanwit/windows/windows.svelte.ts" from="	private openVirtual<R>" to="	}" />

- A **virtual window** is a draggable card inside the page, drawn by `VirtualWindows.svelte` (in "Rebuild: the window") from the reactive `virtual` list. It needs no new kernel, since it runs in this one.
- A **modal** is a virtual window with `modal: true`. The service sets `locked`, and the workbench makes the page behind it inert.
- A **tab** or **popup** is a real browser window at the same `/w/<kind>` URL as the desktop, with its own kernel. Windows with their own layout (the Manual) always open this way. A timer notices when the tab is closed, since browsers give no event for it.
- **Picture in picture** uses the Document Picture-in-Picture API, the only way a browser keeps a small window on top. The view is mounted into it with this kernel, after copying the page's styles across.

<Callout kind="new" title="New here: feature detection">

`"documentPictureInPicture" in window` asks whether the browser has an API before using it, instead of asking which browser it is. The same idea runs through the whole host (chapter 3): code checks `caps.nativeWindows`, never "am I in Tauri".

</Callout>

## Locked parents

When a child window locks its parent, a click on the parent should tell you why nothing happened. On the desktop, Rust does this (it sees the click first). On the web, the workbench calls `blocked()`:

<Source path="src/fanwit/windows/windows.svelte.ts" from="	blocked() {" to="	}" />

The bell comes from chapter 14's `beep`, the vibration from chapter 18's `haptic`. With reduced motion on, the shake becomes a flash.

## Inside the window

The window's own code needs its props and a way to close with a value. `useWindow()` reads them from Svelte context, which the window's root provides:

<Source path="src/fanwit/windows/windows.svelte.ts" from="export function useWindow" to="}" />

```svelte
<script lang="ts">
	import { useWindow } from "$fanwit";
	const win = useWindow<{ format: string }>();
</script>
<button onclick={() => win.close({ format: "pdf" })}>Export as PDF</button>
```

<Callout kind="new" title="New here: Symbol keys">

`const SELF_KEY = Symbol("fw-window-self")` makes a value that is equal only to itself. Used as a context key, it can never clash with another library's `setContext("self", ...)`, and nobody outside this file can read it except through `useWindow`. The description string only shows up in debuggers.

</Callout>

## What works where

Not every option means something on every platform: macOS has no per window taskbar entries, and a browser tab cannot block the page. `windowOptions` answers "does this option take effect here, and if not, why?". The Window Lab uses it to grey out controls with an explanation, rather than letting them silently do nothing:

<Source path="src/fanwit/windows/windows.svelte.ts" from="export function windowOptions" />

<Source path="src/fanwit/windows/windows.svelte.ts" />

## Checkpoint

<Source path="src/fanwit/windows/windows.test.ts" />

<Source path="src/fanwit/windows/options.test.ts" />

```sh
pnpm vitest run src/fanwit/windows
```

<Check question="A module opens a settings window with focus = lock on the web build. What does the user get?" options={["A new browser tab", "A modal over the page, with the page inert until it closes", "Nothing: locking needs native windows"]} answer={1}>

On the web, a locked window becomes a modal virtual window. The service sets `locked`, the page behind it becomes inert, and clicking it triggers the blocked feedback. The module's code is the same as on the desktop.

</Check>
