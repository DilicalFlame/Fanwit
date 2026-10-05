# Windows

The Windows API decides how a window behaves: who owns it, who gets focus, where it opens, and how it remembers its place.

<Callout kind="why">

Desktop apps that hand-build each window repeat the same decisions: should it block its parent, stay on top, have a taskbar button, remember its size? And those decisions differ per OS and don't exist at all in a browser. FaNWiT asks you for **intent** instead: a <Term name="kind (window)">window kind</Term> says "a child that locks focus" or "a palette at the pointer". The <Term name="host" /> turns that into the right behaviour on Windows, macOS, Linux and the web, where the same kind becomes a virtual window or a modal. You write one spec, and every platform gets its native behaviour.

</Callout>

<Steps>

1. Add a kind with `pnpm fw add window <kind> --base child`. It writes the spec, a view, and the desktop capability entry.
2. Open it from a command: `const win = await ctx.windows.open("app.export", { doc: id })`.
3. Inside the window's view, `useWindow().close(value)` closes it and hands `value` back to the opener.

</Steps>

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

## Windows with their own layout

A kind can name a layout <Term name="preset" /> with `layout = "<preset id>"`. The window then runs a full workbench on its own layout document, saved as `<kind>.layout.toml` and kept separate from the workspace. On the web such a window opens as a browser tab, since it needs its own kernel. The Manual window works this way:

```ts
windows: [{ kind: "manual", base: "aux", layout: "manual", title: "Manual", size: [1180, 800], instance: "single" }]
```

<Check question="You need a confirmation dialog that blocks its parent window until answered. Which base and focus?" options={["aux with focus: lock", "child with focus: lock (its defaults already lock)", "panel with alwaysOnTop"]} answer={1}>

`lock` needs an owner, and an aux window has none, so `lock` does nothing for it. A child is owned by its opener and locks by default; on the web it becomes a modal.

</Check>

## Pitfalls

- **Checking the platform.** Don't branch on "am I in Tauri". Set the options you want and let the host apply what it can (`ctx.host.caps` says what is possible).
- **Many kinds that differ only in options.** If two kinds share a base and differ in size or title, keep one kind and pass props.
- **Forgetting `close(value)`.** The opener's `result` resolves with `undefined` when the user just closes the window. Handle that case.
