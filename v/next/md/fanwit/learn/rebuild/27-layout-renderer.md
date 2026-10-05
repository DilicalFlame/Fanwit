# Drawing the layout

Chapters 19 and 20 built the layout as data. This chapter draws it, using the components in `workbench/layout/` and `workbench/ViewHost.svelte`. When it is done, every change to `workspace.toml`, every action and every undo shows up on screen by itself.

<Callout kind="why">

These components only **read** `layout.doc` and **dispatch** actions. None of them keeps its own idea of the layout. Dragging a splitter, closing a tab or docking a pane all become actions, and the screen follows the document. So a hand edit of `workspace.toml`, a broadcast from another window, and undo need no special handling. To the renderer they are all just "the document changed".

</Callout>

```tikz caption="Components mirror the document; views live in the pool and are moved into slots" alt="LayoutRoot draws regions: sidebar, main, panel. Each region renders NodeView, which picks SplitView, TabSet, StackView or GridView by node type. SplitView renders NodeView again for each child. TabSet, StackView and GridView render PaneSlots. The pane pool holds one ViewHost per pane, and adoptPane moves its element into the matching slot."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=8mm,font=\scriptsize,text width=22mm}]
\node[b,fwcore] (root) at (0,24) {\texttt{LayoutRoot}\\regions};
\node[b,fwcore] (nv) at (0,8) {\texttt{NodeView}\\by node type};
\node[b,fill=fwPaper,draw=fwSlate] (sv) at (-30,-8) {\texttt{SplitView}};
\node[b,fill=fwPaper,draw=fwSlate] (ts) at (0,-8) {\texttt{TabSet}};
\node[b,fill=fwPaper,draw=fwSlate,text width=24mm] (st) at (31,-8) {\texttt{StackView}, \texttt{GridView}};
\node[b,fwuser] (slot) at (15,-26) {\texttt{PaneSlot}\\(empty)};
\node[b,fwwarm,text width=26mm] (pool) at (62,-26) {pane pool\\\texttt{ViewHost} per pane};
\draw[fwarrow] (root) -- node[fwlabel,right]{region node} (nv);
\draw[fwarrow] (nv) -- (sv);
\draw[fwarrow] (nv) -- (ts);
\draw[fwarrow] (nv) -- (st);
\draw[fwarrow] (sv.west) to[bend left=40] node[fwlabel,left]{each child} (nv.west);
\draw[fwarrow] (ts) -- (slot);
\draw[fwarrow] (st) -- (slot);
\draw[fwarrow,dashed] (pool) -- node[fwlabel,above]{\texttt{adoptPane}} (slot);
\end{tikzpicture}
```

## One node, any type

`NodeView` takes a node id, looks the node up, and draws the matching component. A split draws a `NodeView` for each child, so the whole tree is drawn by this one component calling itself:

<Source path="src/fanwit/workbench/layout/NodeView.svelte" from="<script lang=" />

<Callout kind="new" title="New here: a component that renders itself">

`import Self from "./NodeView.svelte"` inside `NodeView.svelte` is a component importing itself, which is how recursion works in Svelte 5. Because `SplitView` renders `NodeView` and `NodeView` renders `SplitView`, the two files also import each other. That is fine for components: the import is only used when rendering, long after both modules have loaded.

`$derived.by(() => { ... })` is `$derived` for values that need several statements to compute. The function runs again when anything it read changes.

</Callout>

On narrow screens the layout's `responsive` rules (chapter 19) can set the main area to `single` mode. `singleChild` then walks down the splits to the branch holding the focused tab set, and only that branch is drawn. The document still describes the full layout, so widening the window brings the splits back.

## Splits and splitters

<Source path="src/fanwit/workbench/layout/SplitView.svelte" from="<script lang=" />

Sizes in the document are **weights** (`0.6`) or **pixels** (`"280px"`). Pixel children get a fixed `flex: 0 0 280px`. Weighted children share what is left in proportion, through `flex-grow`.

Dragging is two phases, and that matters for performance and undo:

1. **While dragging**, `resize` measures the children, moves the boundary between two neighbours (never below 60 px), and writes the result to `live`, a local `$state`. Only this split redraws.
2. **On release**, `commit` dispatches one `setSizes` action with `undoable: false`. The document and `workspace.toml` change once, not sixty times a second, and the undo history is not flooded with pixel steps (chapter 20).

<Source path="src/fanwit/workbench/layout/Splitter.svelte" from="<script lang=" />

<Callout kind="new" title="New here: pointer capture, and ARIA for a splitter">

`setPointerCapture(pointerId)` sends every later move and release of that pointer to this element, even when the pointer leaves it. Without it, a fast drag "drops" the splitter as soon as the cursor outruns the 1 px line.

The splitter is the ARIA **window splitter** pattern: `role="separator"`, `tabindex="0"` to make it focusable, and `aria-valuenow`. Arrow keys move it by 10 px (50 with Shift) and Enter equalises. The `svelte-ignore` comment names those keyboard equivalents, as AGENTS.md requires. Svelte's accessibility check flags an interactive `separator`, and the comment records why this one is fine.

</Callout>

## Regions

`LayoutRoot` draws a window's regions around the main area: title bar, header, activity bar, sidebar, main, panel, inspector, footer, status bar. Each one appears only if the document gives it a node and it is visible. Its sidebar, panel and inspector splitters use the same live then commit pattern, through `setRegion`.

<Source path="src/fanwit/workbench/layout/LayoutRoot.svelte" from="	const responsive = $derived.by" to="	});" />

Responsive rules are evaluated against the window's measured width (`bind:clientWidth`). The widest matching breakpoint is applied first, so narrower ones override it. The results are drawing modes, never document changes. A sidebar becomes a drawer opened from the activity bar, the panel becomes a bottom sheet, and the activity bar moves to the bottom as a tab bar.

<Callout kind="new" title="New here: bind:clientWidth, and snippets as props">

`bind:clientWidth={width}` keeps `width` equal to the element's rendered width. Svelte watches it with a `ResizeObserver`, and the binding is read only.

The title bar and status bar are passed in as **snippets** (`titlebar`, `statusbar`) instead of being imported. `LayoutRoot` only decides **where** they go. That keeps it free of the frame's components, so a different frame can supply different bars.

</Callout>

<Source path="src/fanwit/workbench/layout/LayoutRoot.svelte" />

## Tab sets

`TabSet` is the most detailed component here, because tabs carry many conventions people expect:

- **Keyboard.** The strip is a `tablist` with one focusable tab (roving `tabindex`). Arrow keys move between tabs, Delete closes, Enter focuses the view.
- **Mouse.** Middle click closes, double click maximises, the wheel scrolls an overflowing strip, and **Show all tabs** lists every tab once they no longer fit.
- **State shown on the tab.** Pinned tabs sort first and show only an icon. A preview tab is in italics. A dot marks unsaved changes and turns into the close button on hover.
- **Every close goes through the command.** The X runs `tab.close` with the pane as its target, so the unsaved changes prompt and `closable = false` (chapter 19) apply to the button exactly as to Ctrl+W.
- **One sliding underline.** Rather than each tab drawing its own border, a single indicator moves to the active tab with GSAP (chapter 18), and follows its width as titles change.
- **Empty states.** An empty main tab set offers quick open and the palette. In the Manual window, it offers the home page instead.

<Source path="src/fanwit/workbench/layout/TabSet.svelte" from="	// one underline that slides" to="	});" />

<Callout kind="new" title="New here: offsetLeft, CSS.escape and ResizeObserver">

`tab.offsetLeft` and `offsetWidth` are the tab's position and size inside its parent, in layout pixels. Unlike `getBoundingClientRect`, they ignore transforms, so an animation running on the tab (its entrance) does not throw the underline off. AGENTS.md asks for offset sizes on anything that animates in for this reason.

`CSS.escape(id)` makes an id safe inside a selector (`[data-fw-tab="${...}"]`), whatever characters it contains. A `ResizeObserver` calls back whenever an element's size changes, here when a tab's title gets longer.

</Callout>

Below the strip, each pane gets a `PaneSlot`, hidden unless active. A view whose `keepAlive` is `"none"` only gets a slot while active, so it is destroyed when you switch away. Everything else stays mounted and keeps its state.

<Source path="src/fanwit/workbench/layout/TabSet.svelte" />

`StackView` draws collapsible sections (the explorer sidebar), `GridView` draws cards in a CSS grid (dashboards), and `ActivityBar` switches a region between its `containers`:

<Source path="src/fanwit/workbench/layout/StackView.svelte" />

<Source path="src/fanwit/workbench/layout/GridView.svelte" />

<Source path="src/fanwit/workbench/layout/ActivityBar.svelte" />

## Slots and hosts

Chapter 20's pane pool mounts each view once, in an element of its own. A slot is the empty box that element is moved into:

<Source path="src/fanwit/workbench/layout/PaneSlot.svelte" from="<script lang=" />

The slot also marks the DOM for everything else. `data-fw-pane` and `data-fw-view` let CSS snippets and appearance plugins target one view (`[data-fw-view="notes.editor"]`). Focusing anything inside makes the pane active, which sets the context keys of chapter 20.

What the pool mounts in each element is `ViewHost`:

<Source path="src/fanwit/workbench/ViewHost.svelte" from="<script lang=" />

- It **loads the view lazily**. A component written as `() => import(...)` is fetched the first time a pane shows it, with a skeleton meanwhile, and the module's `onView:` activation event fires.
- It **handles every state**: a pane whose view no module provides (a disabled plugin), a failed download, loading, and a crash.
- It **isolates crashes**. `<svelte:boundary>` catches errors thrown while the view renders or in its effects, and shows chapter 26's `ErrorCard` with a **Reload view** button in its place. One broken view never blanks the window.
- It **scopes context keys**. `use:ctxkeys` (chapter 8) sets `focusedView`, `pane.id` and `history.scope` for everything inside, so undo inside an editor undoes that editor's steps.

<Callout kind="new" title="New here: svelte:boundary">

`<svelte:boundary>` is Svelte 5's error boundary. If anything inside throws while rendering or updating, the `failed` snippet is shown instead, with the error and a `reset` function that tries again. Errors in event handlers or in promises you do not await are not caught. Those reach chapter 6's global handler. [Svelte docs: svelte:boundary](https://svelte.dev/docs/svelte/svelte-boundary)

The skeleton is a [shadcn-svelte](https://www.shadcn-svelte.com) component, added with `pnpm dlx shadcn-svelte@latest add skeleton` into `src/lib/components/ui/` (chapter 18).

</Callout>

## Floats, drawers and overlays

`Layers` draws what sits above the tree: floating cards you can drag and resize, drawers sliding in from an edge, and modal overlays. Each is a `PaneSlot` in a positioned box, and geometry is committed on release, as with splitters. Negative coordinates measure from the right or bottom edge, so a card placed at the top right stays there when the window resizes:

<Source path="src/fanwit/workbench/layout/Layers.svelte" />

## Docking by drag

Pressing on a tab starts a **dock drag** (`k.sys.dock.begin`). While you drag, `hit` works out what is under the pointer:

- the **strip** of a tab set: insert at that position;
- the **centre** of a tab set: add as a tab;
- one of its four **edges** (the outer quarter): split that side;
- empty space while holding **Shift**: float;
- **outside the window** on the desktop: dock into another app window under the pointer, or pop out into a new one.

<Source path="src/fanwit/workbench/layout/dnd.svelte.ts" from="	private async drop(pane" to="	}" />

The drop is just one action (`movePane`, `split`, `float` or `popOut`), so docking is undoable like any other change. A drag only starts after the pointer moves 4 px, so a click is never mistaken for one, and Escape cancels. Between windows, the drag is described in app events (`fw:dock-hover`, `fw:dock-drop`), so the window under the pointer draws the drop preview, using its own layout.

<Source path="src/fanwit/workbench/layout/dnd.svelte.ts" />

## Checkpoint

The renderer has no unit tests. It is tested where it can only really be tested, in a browser, by the end to end tests in "Rebuild: tools and shipping": splitting, docking, floating past the window edges, closing, and every region of every showcase layout. For now, check it compiles cleanly. AGENTS.md treats any Svelte warning, accessibility included, as a failure:

```sh
pnpm check
```

<Check question="Dragging a splitter fires about sixty pointer moves a second. What reaches workspace.toml?" options={["Sixty setSizes actions a second, each written and added to undo", "Nothing until release; then one setSizes action, not added to undo", "Only the final size, as a full rewrite of the file"]} answer={1}>

While dragging, sizes live in the component's own `live` state, so only that split redraws. On release, one `setSizes` is dispatched with `undoable: false`, and chapter 15's `TomlFile` merges that one change into the file without touching the rest.

</Check>
