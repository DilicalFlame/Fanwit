---
title: Windows
section: Guides
order: 7
---
# Windows

The Windows API decides how a window behaves: who owns it, who gets focus, where it opens, and how it remembers its place.

## Kinds

A kind is mostly a preset: a base plus the options you set. Only a few behaviours are wired to the
base itself; everything else is a default you can override in the spec.

| Base | Wired to the base | Defaults you can override |
|---|---|---|
| main | The workbench window (route `/`): owns a vault and the layout. Opened with New window, not `windows.open` | 1280 × 800, remembers its place |
| aux | Never owned: its own taskbar button, minimises on its own, cannot lock anything. One instance per kind unless `instance` says otherwise | 960 × 680, cascades, remembers its place |
| child | Owned by its opener: stays above it and closes with it. Compact title bar with only a close button. A new instance per open | 520 × 420, centred on the parent, focus `lock`, bell and shake, no taskbar button |
| sheet | Same as child | 520 × 360, focus `lock`, not resizable |
| panel | Owned, compact title bar | 320 × 420, focus `none`, always on top, remembers its place |
| palette | Owned, compact title bar, **opens at the pointer** | 640 × 120, focus `takeover`, always on top, not resizable |
| splash | **No title bar** | 420 × 260, centred, not resizable |
| tray | **Opens beside the pointer, towards the screen centre** (the tray icon is in a corner) | 320 × 400, always on top, not resizable |

So yes, some bases overlap: **sheet is a child with a fixed size**, and panel, palette and tray
differ from child only in their defaults and placement. They are kept as names of intent (what
the window is for), which also picks sensible defaults per platform. If two of your kinds differ
only in options, use one base and set the options.

## Options and where they apply

| Option | Desktop | Web |
|---|---|---|
| `focus` | `none` shows the window without taking focus, `takeover` focuses it, `lock` also disables the owner. `lock` needs an owner: it does nothing for aux and main | Only the virtual presentation chooses: `lock` makes it a modal. A modal always locks; popup, tab and pip cannot block the page |
| `onBlocked` | Only while the owner is locked. Bell, shake, flash (in the page), attention (task bar). On Windows these replace the system beep. On Linux (Wayland) the page content shakes instead of the window | Only for modals |
| `alwaysOnTop` | Every kind. Owned windows already stay above their owner; this keeps them above other apps too | Not possible: browsers only keep Picture-in-Picture windows on top (`web: "pip"`) |
| `skipTaskbar` | Windows: only for unowned (aux) windows, owned windows never get a taskbar button. Linux: every kind. macOS: no per window entries | Not applicable |
| `shadow: "css"` | Windows and Linux: a transparent window whose page draws the shadow. Not on macOS | Not applicable |
| `web` | Not applicable | `virtual` a card in the page, `modal` a dialog over a blocked page, `popup` a browser window, `tab` a browser tab, `pip` Picture-in-Picture (a virtual window where unsupported) |

The Window Lab greys out options that do nothing for the chosen kind on the current platform and
says why (`windowOptions()` in `windows.svelte.ts`).

## Results

```ts
const win = await ctx.windows.open("app.export", { doc: id });
const choice = await win.result; // resolves when the child calls close(value)
```

## Focus policies

`none`, `takeover`, `lock`. With lock the parent is disabled (true OS modality on Windows), veiled, and blocked clicks play the kind's `onBlocked` effects on the child. On the web the same intent becomes a modal with an inert background.

```fanwit-run
labs.openExport
```
