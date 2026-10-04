---
title: Layout
section: Guides
order: 6
---
# Layout

The whole UI is one document, stored as `workspace.toml` and live in both directions.

## Views

Views are registered component types; panes are instances placed in the layout. A view declares its title, icon, allowed regions, identity (so `openView` focuses an existing pane) and keep alive strategy.

## Actions

Every mutation is an action and an undoable command: openView, closePane, movePane, split, setSizes, selectPane, maximize, toggleRegion, setRegion, float, dock, popOut, popIn, openDrawer, openOverlay, setAttrs, applyPreset, reset, saveWorkspace, loadWorkspace.

```ts
await ctx.layout.openView("notes.preview", { path }, { target: "beside", preview: true });
```

## The TOML document

Flat keyed tables (`[node.x]`, `[pane.y]`), structure only, defaults omitted. Edit and save: the app follows within 100 ms. An invalid edit keeps the last good layout and reports problems with line numbers.

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
