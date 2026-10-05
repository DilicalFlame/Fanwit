# The layout service

Chapter 19 built a layout as data and a pure function to change it. Something has to hold the **current** document, decide what happens when it changes, and draw it. That is `layout/layout.svelte.ts`. This chapter builds it, along with `layout/define.ts`, which lets you write a layout in TypeScript as well as TOML.

<Callout kind="why">

A pure reducer cannot write files, record undo steps, let a module refuse a change, or tell other windows. Keeping those concerns out of the reducer kept it easy to test. They all have to happen somewhere, and always in the same order, or the screen, the file and the undo stack drift apart. The service is that somewhere, and **every** layout change goes through one method, `dispatch`.

</Callout>

```tikz caption="One dispatch: interceptors, the reducer, then everything that follows a change" alt="An action enters dispatch, passes interceptor 1 and 2, reaches reduce, which returns the next document. setDoc then updates the screen, writes workspace.toml, broadcasts to other windows, and pushes an undo entry. An edit on disk enters setDoc from the side."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=9mm,font=\scriptsize,text width=22mm}]
\node[b,fwuser] (act) at (0,0) {\texttt{openView}\\action};
\node[b,fill=fwPaper,draw=fwSlate] (i1) at (30,0) {interceptor\\(docs site)};
\node[b,fill=fwPaper,draw=fwSlate] (i2) at (58,0) {interceptor\\(a module)};
\node[b,fwcore] (red) at (86,0) {\texttt{reduce}\\pure};
\node[b,fwcore] (set) at (116,0) {\texttt{setDoc}};
\draw[fwarrow] (act) -- (i1);
\draw[fwarrow] (i1) -- node[fwlabel,above]{next} (i2);
\draw[fwarrow] (i2) -- node[fwlabel,above]{next} (red);
\draw[fwarrow] (red) -- node[fwlabel,above]{doc} (set);
\node[b,fwwarm] (scr) at (150,18) {screen\\(\texttt{\$state.raw})};
\node[b,fwwarm] (file) at (150,6) {workspace.toml};
\node[b,fwwarm] (bc) at (150,-6) {other windows};
\node[b,fwwarm] (hist) at (150,-18) {undo history};
\foreach \x in {scr,file,bc,hist} \draw[fwarrow] (set.east) -- (\x.west);
\node[b,fill=fwPaper,draw=fwSlate,dashed] (disk) at (116,-22) {edit on disk};
\draw[fwarrow,dashed] (disk) -- (set);
\draw[fwarrow,dashed] (i1.south) to[bend right=20] node[fwlabel,below]{veto} ++(0,-12);
\end{tikzpicture}
```

## State

<Source path="src/fanwit/layout/layout.svelte.ts" from="export class LayoutService {" until="	scope = " />

Read the field list as a map of what the layout knows:

- `doc` is the document itself, as `$state.raw`. The service never edits it in place. Each change replaces it with a new object from `reduce`, so components that read `layout.doc` update.
- `activeTabset`, `activePane` and `activeDocument` are **runtime** focus. They are not saved in the file, since two windows showing the same layout focus different things.
- `dirty` and `titles` are reported by views ("this editor has unsaved changes", "the tab is now called Chapter 3").
- `views`, `nodeTypes` and `presets` are registries filled from module contributions. Each `register...` returns a `Disposable` (chapter 2), so disabling a module removes what it added.

<Callout kind="new" title="New here: $state.raw">

`$state({...})` makes a **deep proxy**: assigning `doc.node.center.panes.push("x")` would be tracked. That is costly for a document this size, and it is also a trap: in-place edits would bypass the reducer, the file and undo. `$state.raw(...)` tracks only the variable itself, so only `this.doc = next` notifies anyone, which is exactly the one way the service changes it. [Svelte docs: $state.raw](https://svelte.dev/docs/svelte/$state#$state.raw)

</Callout>

`ctx()` hands the reducer what it needs from the live app: the window, the focused tab set, how to compute a view's identity (its `identity` function, or the view id for a `singleton`), and a view's home region.

## Loading and two way sync

<Source path="src/fanwit/layout/layout.svelte.ts" from="	/** Load (or create from the app default)" until="layout.maximized" />

`load` reuses chapter 15's `TomlFile`, so the layout gets everything settings got: a template on first run (the default layout with a header comment), validation on every read, line numbered diagnostics, a debounced write that merges into the existing text without losing comments, and a watcher.

- **A broken file never breaks the app.** If validation reports an error, the service runs on the default layout and leaves the file untouched, so the person who made the mistake can fix it. The diagnostics are shown in the Layout Lab and the problems list.
- **Edits on disk become the layout.** `onDidChangeFromDisk` calls `setDoc` without writing back, so saving `workspace.toml` in another editor rearranges the window at once.
- **`setDoc` is the single entry.** Load, reload, dispatch, undo and broadcasts all pass through it. It fills tables a file left out (an empty layout has no `[pane]` table at all), drops focus that points at something gone, unmounts views whose panes left (the pool below), and writes only when asked to.

The constructor's `fw:layout` listener is the other direction of the broadcast. Every window of the same vault shares one `workspace.toml`; when one window changes the layout, the others receive the new document over the host's app events (chapter 3) and adopt it without writing.

## Dispatch

<Source path="src/fanwit/layout/layout.svelte.ts" from="	async dispatch(action: LayoutAction" until="		return focus;" />

<Callout kind="new" title="New here: a middleware chain from closures">

`chain(i)` returns a function that runs interceptor `i`, giving it `chain(i + 1)` as its `next`. The last link runs the action. An interceptor can pass the action on (`next(a)`), change it first (`next({ ...a, target: "beside" })`), or veto it by not calling `next`. The pattern comes from web servers (Express and Koa middleware), and chapter 10's command pipeline uses it too. The docs site uses it to refuse pop outs and presets. Because `dispatch` returns a promise, an interceptor may also `await` something, such as a confirmation dialog, before deciding.

</Callout>

Undo is recorded as two closures over the documents **before** and **after** the action. Since documents are never mutated, holding the old one is enough. Undo doesn't have to compute an inverse action, so every action (including ones added later) is undoable for free. Resizing a splitter (`setSizes`) and moving a float are skipped: dragging a splitter fires dozens of them, and nobody wants to undo pixel by pixel.

`closePane` also remembers the closed pane (last 30), which is what **Reopen closed tab** uses. The action log feeds the Layout Lab's timeline, with each action's origin and how long it took.

## Focus

<Source path="src/fanwit/layout/layout.svelte.ts" from="	focusPane(pane: string) {" to="	}" />

Focusing a pane is where the layout meets the rest of the kernel:

- It sets context keys (chapter 8): `activeTab`, `focusedView`, `resource.path`, `resource.ext` and `activeRegion`, so `when` clauses such as `resource.ext == md` enable the right commands.
- It emits `layout:activePane` for modules and plugins that follow "what the user is looking at".
- It fires the activation event `onView:<view id>`, so a lazy module starts the first time one of its views is focused (chapter 13).

Bars (the title bar and header) are excluded: clicking a button in the title bar must not make **Close tab** close the title bar.

## Presets and workspaces

<Source path="src/fanwit/layout/layout.svelte.ts" from="	/** Replace the workspace with a preset" until="view: last.pane.view" />

Each one is a `replace` action, so it goes through interceptors and can be undone like any other change. A preset keeps open files (chapter 19's `mergePreset`). `saveWorkspace` and `loadWorkspace` store named arrangements in the vault's `workspaces/` folder and validate them before use.

## The pane pool

The last piece decides how panes become pixels, and it is why dragging a tab never loses your cursor position.

A naive renderer would write `{#each panes as p}<View pane={p} />{/each}` inside each tab set. Move a pane to another tab set and Svelte destroys the component in the first and creates a new one in the second. Its state, scroll position, focus, a half typed search, an editor's undo history, would all be lost.

The **pane pool** mounts each pane's view **once**, into a detached `<div>` of its own, keyed by pane id. Layout components never create views. They leave an empty slot, and the `adoptPane` action moves the pane's element into it. Moving a pane moves an element; the component inside never notices.

<Source path="src/fanwit/layout/layout.svelte.ts" from="export class PanePool {" />

<Callout kind="new" title="New here: mount, unmount, and context passed by hand">

`mount(Component, { target, props, context })` is how Svelte starts a component from plain TypeScript, outside any template. Components started this way do not inherit their parent's context, since they have no parent. The pool passes the kernel in as `context: new Map([["fanwit", k]])`, which is what makes `getContext("fanwit")` work inside views. `unmount(app)` destroys one. `node.replaceChildren(el)` swaps a slot's content in a single DOM operation.

A **Svelte action** (`use:adoptPane={{ pool, pane }}`) is a function called with an element when it mounts. Its returned `update` runs when the parameters change. It is the tool for "do something to this real DOM node" that markup cannot express. [Svelte docs: use:](https://svelte.dev/docs/svelte/use)

</Callout>

`hostComponent` is set by the workbench (in "Rebuild: the window") to `ViewHost.svelte`, which shows a view's loading, error and empty states around it.

<Source path="src/fanwit/layout/layout.svelte.ts" />

## Layouts in code

TOML is the format for people. A module that ships a preset, or a test that needs a particular arrangement, may prefer TypeScript. `defineLayout` takes a builder function and returns the **same** `LayoutDoc`. Nothing new reaches the renderer:

<Source path="src/fanwit/layout/define.ts" />

<Callout kind="new" title="New here: identity helpers like defineLayoutNode">

`defineLayoutNode(t)` just returns `t`. It exists for the type annotation: writing `export const carousel = defineLayoutNode({ ... })` gives you autocompletion and errors against `CustomNodeType` without typing `: CustomNodeType` yourself. `defineModule` (chapter 13) works the same way, and so does `defineConfig` in Vite.

</Callout>

## Checkpoint

The service needs a kernel, a host and a file system. Chapter 5's memory host provides all three, so these tests run the real `workspace.toml` round trip without a browser or a disk:

<Source path="src/fanwit/layout/layout-service.test.ts" />

```sh
pnpm vitest run src/fanwit/layout
```

Writing these tests found a real bug. A valid `workspace.toml` with an empty tab set has no `[pane]` table, and `reduce` crashed on `Object.entries(undefined)`. The fix is the first line of `setDoc`, where every document enters the service.

<Check question="An extension wants to stop anything from being popped out of the main window. Where does that belong?" options={["A check inside reduce, for the popOut case", "A layout interceptor that does not call next for popOut actions", "A CSS rule hiding the Pop out menu item"]} answer={1}>

Interceptors see every action, from any origin (menus, keys, the CLI, scripts), before it reaches the reducer, and they can be removed with the module that added them. Changing `reduce` would affect every app, and hiding a menu item leaves the keyboard shortcut and the command working.

</Check>
