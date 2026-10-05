---
title: The layout model
section: "Rebuild: services"
order: 6
summary: Every window, split, tab set and pane as one plain document that maps one to one onto workspace.toml, changed only by a pure reducer, and checked by a validator that points at the broken line.
---
# The layout model

The workbench you see (a sidebar, tabbed editors you can split, a bottom panel, floating cards, popped out windows) is described by one plain object, the **layout document**. This chapter builds the data side of the layout system, with no Svelte in it:

- `layout/model.ts`: the shape of the document.
- `layout/views.ts`: what a module contributes so a pane can show something.
- `layout/actions.ts`: the reducer, the only code that changes a document.
- `layout/validate.ts`: what a document must satisfy.
- `layout/presets/vscode.toml`: the default layout, written as TOML.

<Callout kind="why">

Most UI frameworks keep layout inside components: a `<Split>` holds a `<Tabs>`, and the arrangement lives in their state. You cannot save that, undo it, edit it by hand, send it to another window or test it without a browser. FaNWiT turns it around. The layout is **data**, components only draw it, and every change is a function from one document to the next. That gives `workspace.toml` you can edit live, undo for every drag, presets, pop out windows that share one document, and tests that run in milliseconds.

</Callout>

## A flat document

A tree would be the obvious shape: a split containing tab sets containing panes. FaNWiT stores it **flat** instead. Every window, node and pane sits in its own keyed table, and parents list their children by id:

```tikz caption="Flat tables in the file, a tree on screen" alt="On the left, TOML tables window.main, node.center, node.side, pane.welcome, pane.explorer. Arrows show window.main's regions pointing at node ids and nodes listing pane ids. On the right, the resulting workbench: a sidebar stack with the explorer and a main tab set with the welcome tab."
\begin{tikzpicture}[x=1mm,y=1mm,t/.style={fwnode,text width=38mm,align=left,font=\scriptsize\ttfamily,minimum height=9mm}]
\node[t,fwcore] (win) at (0,24) {[window.main.regions]\\sidebar = \{ node = "side" \}\\main = \{ node = "center" \}};
\node[t,fwwarm] (side) at (-22,6) {[node.side]\\type = "stack"\\panes = ["explorer"]};
\node[t,fwwarm] (center) at (22,6) {[node.center]\\type = "tabs"\\panes = ["welcome"]};
\node[t,fwuser] (pe) at (-22,-12) {[pane.explorer]\\view = "fanwit.explorer"};
\node[t,fwuser] (pw) at (22,-12) {[pane.welcome]\\view = "fanwit.welcome"};
\draw[fwarrow] (win) -- (side);
\draw[fwarrow] (win) -- (center);
\draw[fwarrow] (side) -- (pe);
\draw[fwarrow] (center) -- (pw);
\begin{scope}[shift={(62,-14)}]
\draw[fill=fwPaper,draw=fwSlate,rounded corners=1.5pt] (0,0) rectangle (60,46);
\draw[fill=fwSlate!15,draw=fwSlate] (0,40) rectangle (60,46);
\draw[fill=fwWarmSoft,draw=fwWarm] (0,0) rectangle (18,40);
\node[font=\tiny,anchor=north west] at (1,39) {Explorer};
\draw[draw=fwBrand] (18,34) -- (60,34);
\draw[fill=fwBrandSoft,draw=fwBrand] (19,34) rectangle (34,39);
\node[font=\tiny] at (26.5,36.5) {Welcome};
\node[font=\tiny,text=fwSlate] at (39,17) {fanwit.welcome};
\end{scope}
\draw[fwarrow,dashed] (44,6) -- node[fwlabel,above]{draws} (61,10);
\end{tikzpicture}
```

Flat tables pay off everywhere:

- **Ids are addresses.** "Close pane `welcome`" or "resize split `split-2`" needs no path through a tree.
- **Moving is relinking.** Dragging a tab to another group removes an id from one list and adds it to another; the pane's table, with its props, is untouched.
- **TOML stays shallow.** Nested tables five levels deep would be unreadable; `[node.center]` is not.
- **Merging works.** Chapter 4's TOML merge can update `[pane.welcome]` without disturbing the comments around `[node.side]`.

## The model

Start with the regions of a window. `REGIONS` lists all of them; `NODE_REGIONS` are those that hold a layout node (the title bar and status bar are fixed chrome):

<Source path="src/fanwit/layout/model.ts" from="export type RegionName" until="export type NodeRegion" />

<Callout kind="new" title="New here: as const and indexed access types">

`["sidebar", "main"] as const` makes the array **readonly** and its element type the literal `"sidebar" | "main"` instead of `string`. `(typeof NODE_REGIONS)[number]` then reads "the type of any element of this array": the union of its literals. You write the list once, and both the runtime array (to loop over) and the type (to check against) come from it. `RegionName` above does it the other way round, a union plus a separate array, and the two must be kept in sync by hand.

</Callout>

A window has a `kind` (main, aux, a dialog...), a `frame` that draws its chrome, and its `regions`; non workbench windows set `root` instead. Then the nodes: a **split** lays out children in a row or column, a **tabs** set shows one pane at a time, a **stack** shows collapsible sections (the explorer sidebar), a **grid** places panes by CSS grid areas:

<Source path="src/fanwit/layout/model.ts" from="export interface WindowModel" until="export type LayoutNode =" />

<Callout kind="new" title="New here: discriminated unions and index signatures">

`LayoutNode` is a **discriminated union**: every member has a `type` field with a different literal (`"split"`, `"tabs"`, ...). After `if (n.type === "split")`, TypeScript knows `n` is a `SplitNode` and lets you read `n.children`. `CustomNode` is the escape hatch for node types a module adds (chapter 20): `type: string` and `[k: string]: unknown`, an **index signature** saying "any other key, of unknown type". Because its `type` is plain `string`, it overlaps every literal, which is why the model code sometimes casts (`n as SplitNode`) where narrowing alone cannot decide.

`Partial<Record<RegionName, RegionState>>` is two built in types together: `Record<K, V>` is an object with keys `K` and values `V`; `Partial<T>` makes every key optional. A window lists only the regions it uses.

</Callout>

Panes hold a view id and its props. The document itself is a table of each kind; floats, drawers and overlays are panes shown above the layout instead of inside it, each pointing at a pane and a window:

<Source path="src/fanwit/layout/model.ts" from="export interface PaneModel" to="}" />

<Source path="src/fanwit/layout/model.ts" from="export interface LayoutDoc" to="}" />

The rest of `model.ts` are small queries every other file uses: `parentOf` finds who lists an id, `locateNode` walks up to the window and region a node is mounted in, `newId` picks the first free `tabs-1`, `tabs-2`..., and `clean` drops `undefined`, empty tables and empty lists before writing, so `workspace.toml` only contains what was set:

<Source path="src/fanwit/layout/model.ts" />

## Views

A pane names a **view**; a module contributes the view. The contribution says how to title a pane, which component draws it, and, through `identity`, when two `openView` calls mean the same thing (opening `a.md` twice focuses the first tab instead of opening a second):

<Source path="src/fanwit/layout/views.ts" />

<Callout kind="new" title="New here: Component types and lazy imports in a union">

`component: (() => Promise<{ default: Component<any> }>) | Component<any>` accepts either a component or a function returning `import("./View.svelte")`. A dynamic `import()` returns a promise of the module, and a Svelte file's module has the component as `default`. With the lazy form, Vite splits each view into its own chunk, downloaded the first time a pane shows it. `ViewEntry extends ViewContribution` adds `owner`, so a module's views go away when it is disabled (chapter 13).

</Callout>

## The reducer

Every change to the layout is an **action**, a plain object such as `{ type: "closePane", pane: "welcome" }`:

<Source path="src/fanwit/layout/actions.ts" from="export type Side" until="doc: LayoutDoc; reason?: string };" />

`reduce(doc, action, ctx)` returns the next document. It never changes the one it was given: the first line is a deep copy, and the rest of the function edits the copy freely.

<Source path="src/fanwit/layout/actions.ts" from="export function reduce(" until="			break;" />

<Callout kind="new" title="New here: structuredClone, switch on a union, and ??=">

- `structuredClone(input)` is a built in deep copy (in browsers, Node and Deno). It copies nested objects, arrays, maps and dates, which `{ ...doc }` would only copy one level deep.
- `switch (a.type)` over a discriminated union narrows `a` in each `case`: inside `case "openView"`, `a.view` and `a.props` exist; inside `case "closePane"`, `a.pane` does. Braces around each case body (`case "x": { ... }`) give its `const`s their own scope.
- `doc.float ??= {}` assigns only when the left side is `null` or `undefined`.

</Callout>

`openView` shows the shape every case follows: look for an existing pane with the same identity and focus it; otherwise make a pane id, add the pane, and insert it into the right tab set. Targets are `"active"` (the focused tab set in the main area), `"beside"` (a new group to its right), `"float"`, a region name, or a node id. A **preview** tab (single click in the explorer) replaces the previous preview instead of piling up.

Two helpers keep the tree healthy after any change:

- `insertBeside` puts a node next to another. If the parent split already runs in that direction it gains a child and shares its size; otherwise the target is wrapped in a new split.
- `tidy` collapses what a removal left behind: an empty tab set disappears, a split with one child is replaced by that child, a pop out window with no panes closes. Region roots are protected, so the main area never vanishes.

<Source path="src/fanwit/layout/actions.ts" from="/** Insert node `fresh` beside" to="}" />

Applying a **preset** (switch to the Blender layout, say) would close every open document if it simply replaced the document. `mergePreset` carries the panes that show files over into the new layout's main tab set:

<Source path="src/fanwit/layout/actions.ts" from="/** Keep panes from `prev`" />

<Source path="src/fanwit/layout/actions.ts" />

## Validation

A hand edited `workspace.toml` can say anything. `validateLayout` turns mistakes into diagnostics with a line number (via chapter 15's `locate`): errors for what cannot be drawn (a missing `[window.main]`, a node listing a pane that does not exist, a cycle, a pane listed in two places) and warnings for what can (an unknown view id shows a placeholder, since its module may simply be off):

<Source path="src/fanwit/layout/validate.ts" />

## The default layout

The app's default layout is a TOML file, read with `?raw` (chapter 18) and written to the vault as the first `workspace.toml`. Read it top to bottom with the model above in mind:

<Source path="src/fanwit/layout/presets/vscode.toml" />

`${vault.name}` in the title is filled in by the frame at draw time. `[window.main.responsive]` turns the sidebar into a drawer under 900 pixels, and the main area into a single pane under 640; the layout renderer (in "Rebuild: the window") applies it, so the document stays the same on every screen.

## Checkpoint

The reducer is plain TypeScript, so its tests build a document, apply actions and compare:

<Source path="src/fanwit/layout/layout.test.ts" />

```sh
pnpm vitest run src/fanwit/layout/layout.test.ts
```

<Check question="You drag a tab from one group to another. What changes in the document?" options={["The pane's table is deleted and a new one is created with the same props", "The pane's id moves from one tab set's panes list to the other's; its table is unchanged", "The whole node tree is rebuilt from the screen"]} answer={1}>

Panes live in their own keyed table and nodes list them by id, so moving is relinking. The component showing the pane is not remounted either: chapter 20's pane pool moves its element.

</Check>
