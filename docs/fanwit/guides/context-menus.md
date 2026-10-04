---
title: Context menus
section: Guides
order: 5
---
# Context menus

A menu is data: an ordered list of items, each with a **kind** and props. Kinds are registered renderers that emit values passed to commands. User changes are **patches** in `menus.toml`, never copies, so app updates keep flowing.

## Locations and groups

Attach a location to any element: `<li use:menu={{ location: "explorer/item", target: { path } }}>`. Separators are drawn between groups automatically.

## Item kinds

action, submenu, checkbox, radio, toggle, icon-row, segmented, slider (with a preview command), stepper, input, color-swatches, list, progress, and custom kinds made with `defineMenuItemKind`.

## Patches

```toml
[[patch]]
location = "tab/context"
op = "hide"
item = "tab.copyRelativePath"
```

## Developer mode

Every menu ends with a developer group: **Edit this menu**, **Inspect element**, **Open component source** (dev builds) and **Copy selector**. Elements without a menu open just that group, and Edit this menu creates a location for them. Alt+click a row to jump to it in the editor.

```fanwit-run
menus.edit {"location": "canvas/selection"}
```
