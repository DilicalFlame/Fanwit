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

## Presets

workbench, notes, canvas, three column, dashboard, single, wizard, media, zen.

```fanwit-run
layout.applyPreset {"preset": "notes"}
```
