---
title: Layout
section: Guides
order: 6
summary: The whole UI is one live document of regions, nodes and panes.
---
# Layout

The whole UI is one document, stored as `workspace.toml` and live in both directions.

<Callout kind="why">

In most apps the arrangement of panels is scattered across components, so "move the outline to the right" or "make it look like Blender" means rewriting code. Here the arrangement is data. Every change, whether you drag a tab, run a command or edit the file, is an action on one document, so it can be undone, saved as a <Term name="workspace" />, shared as a <Term name="preset" />, and reproduced exactly. The same document drives the desktop and the web.

</Callout>

## The model in one picture

A window has fixed <Term name="region">regions</Term> (title bar, sidebar, main, inspector, panel, status bar). Each region holds a <Term name="node" />: a split, a tab set, a stack or a grid. Nodes hold <Term name="pane">panes</Term>, and each pane is an instance of a <Term name="view" /> with its props. This manual is laid out the same way:

<LayoutPreview preset="manual" height={220} showToml />

## Views

Views are registered component types; panes are instances placed in the layout. A view declares its title, icon, allowed regions, identity (so `openView` focuses an existing pane) and keep alive strategy.

A view is an ordinary Svelte 5 component. It receives `{ paneId, props }` and can reach the app with `getKernel()`. Edit this one and it re-renders beside the code; **Run** (or Ctrl+Enter) compiles it again.

<Playground mode="svelte" title="A view component" height={220}>

```svelte
<script>
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>

<button onclick={() => count++}>Clicked {count} times</button>
<p>Twice that is {doubled}.</p>

<style>
	button { padding: 4px 12px; border: 1px solid currentColor; border-radius: 6px; }
</style>
```

</Playground>

<Check question="You open the same file twice with openView. What decides whether you get one tab or two?" options={["The view's identity: the same identity focuses the existing pane", "The order of panes in the tab set", "Whether the view is a singleton region"]} answer={0}>

`identity(props)` names an instance: the notes editor uses the file path, so a second `openView` with the same path focuses the open tab instead of adding another. Singleton views always have one instance.

</Check>

## Actions

Every mutation is an action and an undoable command: openView, closePane, movePane, split, setSizes, selectPane, maximize, toggleRegion, setRegion, float, dock, popOut, popIn, openDrawer, openOverlay, setAttrs, applyPreset, reset, saveWorkspace, loadWorkspace.

```ts
await ctx.layout.openView("notes.preview", { path }, { target: "beside", preview: true });
```

## The TOML document

Flat keyed tables (`[node.x]`, `[pane.y]`), structure only, defaults omitted. Edit and save: the app follows within 100 ms. An invalid edit keeps the last good layout and reports problems with line numbers.

<Callout kind="why">

Why flat tables instead of a nested tree? A nested document would put a pane's settings five levels deep, so moving a tab would mean cutting and pasting a whole block. With flat tables a move changes one list (`panes = [...]`), so diffs stay small and hand edits are safe.

</Callout>

Below is the default `vscode` preset, drawn from its own TOML. Hover a box to see which node or pane it is; click one to find its table. Edit the TOML and the window redraws: try changing `dir = "row"` to `"column"`, or adding a pane to a `panes` list.

<LayoutPreview preset="vscode" editable height={280} />

```fanwit-run
layout.openView {"view": "fanwit.layoutLab"}
```

## Title bars

The default title bar has the app button, menu bar, search, layout toggles and window controls.
A layout can draw its own instead: give the `titlebar` region a node, and that node's view fills
the bar.

```toml
[window.main.regions]
titlebar = { node = "titlebar", size = "40px" }

[node.titlebar]
type = "tabs"
strip = "hidden"
panes = ["titlebar"]

[pane.titlebar]
view = "myapp.titlebar"
```

The view draws its own background and keeps the bar usable as a window frame:

- put `data-tauri-drag-region` on empty space so the window can be dragged (and double clicked
  to maximise);
- add the `fw-titlebar-inset` class to the outer element: it leaves room for the macOS traffic
  lights;
- place `<WindowControls />` (`$fanwit/workbench/WindowControls.svelte`) where minimise, maximise
  and close belong. It follows the bar's text colour and shows nothing on macOS and the web;
- `<MenuBar />` (`$fanwit/workbench/MenuBar.svelte`) gives the app button and the menu bar when
  the app wants them.

Views in the title bar and the header region never become the active pane, so tab commands such as
Close tab keep acting on the document you were in. Every showcase preset ships its own bar.

## Presets

A preset is a whole layout document you can switch to (View > Layout preset, the status bar, or
`layout.applyPreset`). Open files travel into the new layout; everything else is replaced.

The core ships one, **vscode**: activity bar, switchable sidebars, tabbed editor groups you can
split, and a bottom panel. It is the default (`layout.default` in `app.config.ts`).

### The showcase

`src/app/showcase/<part>` holds rough copies of well known apps (Figma, Blender, Photoshop,
Notion, Obsidian, Discord, a web browser, Excel, a dashboard and a terminal). They only exist to
show that the same layout system can shape very different desktop apps. Each part is one folder
with its module, preset, views, tests and a README that explains what it shows.

Parts come and go with the CLI; nothing else needs editing:

```sh
pnpm fw parts                      # what is there, what is in .trash
pnpm fw strip showcase-blender     # move one part to .trash/
pnpm fw strip --showcase           # all of them
pnpm fw strip --undo               # put the last strip back
pnpm fw restore showcase-blender   # bring one part back
```

```fanwit-run
layout.applyPreset {"preset": "vscode"}
```

### Your own

Arrange the app, then save the live `workspace.toml` as a preset:

```sh
pnpm fw layout preset my-app path/to/workspace.toml
```

Modules ship presets through `contributes.layoutPresets` (see any `src/app/showcase/<part>/module.ts`). Tab sets take
`strip = "top" | "bottom" | "hidden"`; a split copies its tab set's strip.

## Pitfalls

- **Changing the layout from a component.** Dispatch an action (`ctx.layout.dispatch`) or run a layout command. Direct changes skip undo, persistence and every other window.
- **Views without an identity.** Without `identity`, every `openView` adds a new tab. Give document views an identity, such as the file path.
- **Measuring panes as they animate.** Use offset sizes (`offsetWidth`), not `getBoundingClientRect`, on anything that animates in.
