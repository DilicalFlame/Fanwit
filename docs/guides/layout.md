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

A preset is a whole layout document you can switch to (View > Layout preset, the status bar, or
`layout.applyPreset`). Open files travel into the new layout; everything else is replaced.

The core ships one, **vscode**: activity bar, switchable sidebars, tabbed editor groups you can
split, and a bottom panel. It is the default (`layout.default` in `app.config.ts`).

### The showcase

`src/app/modules/showcase` is a set of rough copies of well known apps. They only exist to show
that the same layout system can shape very different desktop apps; delete the folder (and its
line in `src/app/modules/index.ts`) when you build your own.

| Preset | What it shows |
|---|---|
| figma | An infinite canvas filling the window, with tools, layers and design as floating cards (`[float.*]`) |
| blender | A screen split into areas; each area switches its own editor from its header (stored as pane props) and splits or closes itself |
| photoshop | Options bar in the `header` region, a tool strip as a narrow sidebar, documents as tabs, and groups of tabbed panels docked in a split |
| notion | A page tree and one page, no tabs (`strip = "hidden"`) and no status bar |
| obsidian | Activity bar switching sidebar containers, notes in split tab groups, graph and backlinks following the focused note |
| discord | Four columns in one split, three of them pixel sized |
| browser | An address bar in the `header` region over page tabs; drag a tab to browse side by side |
| excel | Ribbon and formula bar in the header, a cell grid, sheet tabs at the bottom (`strip = "bottom"`) |
| dashboard | One `grid` node with cards placed by CSS grid areas; images open as a lightbox overlay |
| terminal | Terminal tabs that split like tmux (`split`, `vsplit`) and run app commands (`run <command>`) |

```fanwit-run
layout.applyPreset {"preset": "blender"}
```

### Your own

Arrange the app, then save the live `workspace.toml` as a preset:

```sh
pnpm fw layout preset my-app path/to/workspace.toml
```

Modules ship presets through `contributes.layoutPresets` (see the showcase module). Tab sets take
`strip = "top" | "bottom" | "hidden"`; a split copies its tab set's strip.
