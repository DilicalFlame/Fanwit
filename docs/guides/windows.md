---
title: Windows
section: Guides
order: 7
---
# Windows

The Windows API decides how a window behaves: who owns it, who gets focus, where it opens, and how it remembers its place.

## Kinds

| Base | Behaviour |
|---|---|
| main | Primary window, taskbar entry |
| aux | Independent window |
| child | Owned by a parent, focus policy (default lock) |
| panel | Always on top tool window |
| sheet | Dialog attached to its parent |
| palette | Quick input window |
| splash, tray | Startup splash, tray popover |

## Results

```ts
const win = await ctx.windows.open("app.export", { doc: id });
const choice = await win.result; // resolves when the child calls close(value)
```

## Focus policies

`none`, `takeover`, `lock`. With lock the parent is disabled (true OS modality on Windows), veiled, and blocked clicks bell and shake the child. On the web the same intent becomes a modal with an inert background.

```fanwit-run
labs.openExport
```
