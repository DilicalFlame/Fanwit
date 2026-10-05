---
title: The frame
section: "Rebuild: the window"
order: 5
summary: The chrome around the layout. The Workbench that holds a window together, a custom title bar with a menu bar, search and window controls, a status bar fed by modules, and the component that makes any view the root of a window.
---
# The frame

The layout renderer draws regions, splits and tabs. A window also needs **chrome**: a title bar you can drag, a menu bar, minimise, maximise and close buttons, and a status bar. This chapter builds those, plus `Workbench.svelte`, which puts a whole window together.

<Callout kind="why">

FaNWiT draws its own title bar instead of using the operating system's. That lets the search box, the menu bar and the layout toggles sit in the bar itself, and the theme colour it, as in VS Code, Figma or Discord. The cost is that the app must redo what the OS bar did for free: dragging the window, double click to maximise, the Windows system menu on right click, and the macOS traffic lights. This chapter does all of that, so app authors get a custom bar without the usual papercuts.

</Callout>

```tikz caption="The frame around the layout" alt="A window wireframe. The title bar holds the app button and menu bar, a search box in the centre, layout toggles and window controls. Below are the activity bar, sidebar, main tab set and panel, all drawn by LayoutRoot. The status bar at the bottom holds the vault, module items, problems, theme mode and the notification bell."
\begin{wf}[1.3]
\wfframe{0}{0}{120}{72}
\wfdark{0}{0}{120}{6}
\wfic{3}{3}{bars}
\wft{6}{3}{File\ \ Edit\ \ View\ \ Go\ \ Window\ \ Help}
\wfsearch{42}{0.5}{36}{Search or run a command}
\wficm{88}{3}{columns}
\wfic{104}{3}{window-minimize}
\wfic{110}{3}{square}
\wfic{116}{3}{times}
\wfrect{0}{6}{6}{60}
\wfic{3}{10}{copy}
\wfic{3}{16}{search}
\wfwhite{6}{6}{26}{60}
\wftb{8}{9}{EXPLORER}
\wftm{9}{14}{notes.md}
\wftm{9}{18}{todo.md}
\wfrect{32}{6}{88}{5}
\wfwhite{32}{6}{16}{5}
\wft{34}{8.5}{Welcome}
\wfarea{36}{14}{80}{30}{view (from the pane pool)}
\wfrect{32}{48}{88}{18}
\wftm{34}{51}{Problems\ \ \ Logs}
\filldraw[fill=fwBrand,draw=none] (0,66) rectangle ++(120,6);
\node[anchor=west,text=white] at (2,69) {my-vault};
\node[anchor=east,text=white] at (118,69) {12 words\ \ \faIcon{moon}\ \ \faIcon{bell}};
\draw[fwarrow] (136,3) -- (121,3);
\node[anchor=west,font=\sffamily\scriptsize] at (137,3) {\texttt{TitleBar}: \texttt{MenuBar}, search, \texttt{WindowControls}};
\draw[fwarrow] (136,30) -- (121,30);
\node[anchor=west,font=\sffamily\scriptsize] at (137,30) {\texttt{LayoutRoot} (chapter 27)};
\draw[fwarrow] (136,69) -- (121,69);
\node[anchor=west,font=\sffamily\scriptsize] at (137,69) {\texttt{StatusBar}: vault, items, problems, bell};
\end{wf}
```

## Workbench

<Source path="src/fanwit/workbench/Workbench.svelte" from="<script lang=" />

`Workbench` is small because everything it combines already exists:

- `LayoutRoot` for the regions, receiving the title bar and status bar as snippets (chapter 27).
- `Overlays`: the palette, menus, toasts, dialogs and virtual windows that float above everything (chapter 29).
- **The window title**, built from the layout's `title` template (`${vault.name} - ${app.name}`) and sent to the host. On the desktop that is the taskbar entry, and on the web the browser tab.
- **`inert`** on the whole frame while a modal virtual window is open (chapter 21). An inert element cannot be clicked, focused or read by a screen reader, which is exactly what "modal" means.
- **`data-preset` on `<html>`**, so appearance plugins and CSS snippets can restyle per layout: `html[data-preset="blender"] .fw-btn { ... }`.

<Callout kind="new" title="New here: the inert attribute">

`inert` is a plain HTML attribute: everything inside becomes non-interactive and hidden from assistive technology, without changing how it looks. Before it existed, modals had to trap focus with JavaScript and set `aria-hidden` on the rest of the page. Svelte passes `inert={locked}` through as a boolean attribute. [MDN: inert](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert)

</Callout>

## Title bar

<Source path="src/fanwit/workbench/TitleBar.svelte" from="<script lang=" />

What it takes to replace the OS title bar:

- **Dragging.** `data-tauri-drag-region` tells Tauri that pressing on this element drags the window. It applies to the element itself, not to its children, so every empty area that should drag carries the attribute too, and buttons don't (they would drag instead of click).
- **Double click** toggles maximise, but only on the drag region, so double clicking the search box does nothing unexpected.
- **Right click on Windows** shows the native system menu (Move, Size, Minimise...) through `host.windows.showSystemMenu`, like a native bar.
- **macOS** keeps its own traffic light buttons. The bar leaves 80 px free on the left (`pl-20`, and `--fw-titlebar-inset` for custom bars), and `WindowControls` draws nothing.
- **Narrow windows** collapse the menu bar into the app button and hide the layout toggles.
- **A layout can replace the whole bar.** `titlebar = { node = "..." }` renders a layout node across it. That is how the Discord and Figma showcases have bars that look nothing like VS Code's.

The toggles use `aria-pressed`, so screen readers announce "Toggle panel, pressed" or "not pressed", and their icons switch between solid and dashed.

<Source path="src/fanwit/workbench/WindowControls.svelte" from="<script lang=" />

Close runs `window.close`, not the host directly. That way it goes through chapter 25's unsaved work check, the same as Ctrl+Shift+W. The maximise icon keeps in sync with the window's real state through `onResized`, since the window can also be maximised by snapping it to a screen edge.

## Menu bar

<Source path="src/fanwit/workbench/MenuBar.svelte" from="<script lang=" />

The menu bar is six buttons that open the `menubar/*` locations of chapter 22. The behaviour people expect from a menu bar comes from a few details:

- When one menu is open, **hovering** another bar item switches to it, so you can sweep across the menus.
- **Arrow keys** move along the bar, and switch menus if one is open. Down or Enter opens one.
- `role="menubar"`, `aria-haspopup` and `aria-expanded` describe it to screen readers.
- **On macOS** the app's menu belongs in the system menu bar at the top of the screen, so only the app button is drawn here. The native menu is built from the same locations, in "Rebuild: the Rust core".

<Callout kind="new" title="New here: tuples with as const">

`const MENUS = [["menubar/file", "File"], ...] as const` makes each inner array a **readonly tuple** with exact literal types. `{#each MENUS as [loc, label]}` can then destructure it, with `loc` typed as `"menubar/file" | "menubar/edit" | ...`. Without `as const`, each item would be a `string[]`, and `label` could be `undefined` as far as TypeScript knows.

</Callout>

## Status bar

<Source path="src/fanwit/workbench/StatusBar.svelte" from="<script lang=" />

- **Contributed items** from chapter 23's status service, sorted by priority on each side. An item is shown only when its `when` clause holds, and runs its command when clicked.
- **Built in items**: the vault switcher on the left, and on the right the problem count (layout and settings diagnostics), the current layout preset, the light or dark toggle, and the notification bell with its unread count.
- **The chord hint.** After Ctrl+K, the bar shows "Ctrl+K … waiting for next key" (chapter 11). It sits in an `aria-live="polite"` region, so screen readers announce it too.
- **Right click** opens the `statusbar/item` menu, with the item under the pointer in the `statusItem` context key, so a module can add "Hide word count" to its own item only.

<Callout kind="new" title="New here: local snippets">

`{#snippet item(i: StatusItem)} ... {/snippet}` defines a piece of markup with a parameter, inside the component. `{@render item(i)}` draws it. It is like a small component that needs no file and can use the component's own variables, here `visible` and `run`. It is used twice, once per side.

</Callout>

## Windows that show one view

Not every window is a workbench. A settings window, an About box or an export dialog shows one view. `WindowView` is the root of such windows. It loads the view the way `ViewHost` does (chapter 27), with an error boundary, and makes the window available to it through `provideWindowSelf`, so `useWindow()` works inside (chapter 21):

<Source path="src/fanwit/workbench/WindowView.svelte" from="<script lang=" />

The route that decides between `Workbench` and `WindowView` for a given window is `/w/[kind]`, built in chapter 30.

## Checkpoint

```sh
pnpm check
```

The frame is tested end to end once the app boots (chapter 30). `e2e/smoke.test.ts` checks that the title bar, the palette from the search box and the context menus all work, in both the desktop and web layouts.

<Check question="Why does the title bar's search box not carry data-tauri-drag-region?" options={["It would look different", "Pressing on it would start dragging the window instead of focusing it", "Tauri forbids it on buttons"]} answer={1}>

The drag region is decided per element. Anything marked with it starts a window drag on press, so only empty space should carry it, and buttons and inputs must not.

</Check>
