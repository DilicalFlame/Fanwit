---
title: Overlays
section: "Rebuild: the window"
order: 6
summary: Everything that floats above a window. The palette, context menus that stay on screen and forgive diagonal mouse moves, rich menu items, toasts you can swipe away, dialogs with buttons in the platform's order, popovers, virtual windows on the web, and the developer overlays.
---
# Overlays

The services of chapters 14, 21, 22 and 23 decide **what** floats above the window: the open menu, the toasts, the palette's results, the virtual windows. This chapter draws them. Each overlay is a component that reads one service's state and calls back into it. `Overlays.svelte` gathers them, so every kind of window (the workbench, a settings window, a popped out view) gets the same set:

<Source path="src/fanwit/workbench/Overlays.svelte" from="<script lang=" />

<Callout kind="why">

Overlays are where small details decide whether an app feels native or like a web page. A menu should open where it fits, and not run off the screen. Moving diagonally toward a submenu should not close it. A dialog's buttons should be in the order your OS uses. These details are hard to get right, and almost every app needs them, which is why they belong in the template, done once.

</Callout>

## The palette

<Source path="src/fanwit/workbench/Palette.svelte" from="	function keys(e: KeyboardEvent)" to="	}" />

The palette component is the view of chapter 23's service. It draws the input and the rows. Arrow keys, Page Up and Page Down move the selection, and Enter runs the item. Ctrl+Enter runs it and keeps the palette open, for running several commands in a row. Backspace in an empty prompt step goes back a step, and Backspace on a lone prefix (`>`) leaves that mode.

<Source path="src/fanwit/workbench/Palette.svelte" from="	function highlight(" to="	}" />

`highlight` turns the fuzzy matcher's `positions` into runs of normal and bold text. The markup draws each run as a `<span>`, with bold ones in `<b>`. Building runs instead of raw HTML keeps it safe from labels containing `<`.

<Source path="src/fanwit/workbench/Palette.svelte" />

## Context menus

`MenuHost` watches `menus.open`, resolves the location (chapter 22) and draws a `MenuSurface`. In developer mode it appends a group with **Edit this menu**, **Inspect element**, **Open component source** and **Copy selector** to every menu. Right clicking something that has no menu at all opens just that group, which is how you create a menu for it.

<Source path="src/fanwit/workbench/menus/MenuHost.svelte" />

`MenuSurface` draws one level of a menu. Submenus are `MenuSurface` again, one level deeper. Three behaviours make it feel like a native menu.

### Staying on screen

<Source path="src/fanwit/workbench/menus/MenuSurface.svelte" from="	function place()" to="	}" />

A menu opens at the pointer. If it would cross the right edge, it opens to the left instead (a submenu flips to the other side of its parent). If it would cross the bottom, it flips above its anchor. Whatever is left is clamped 8 px inside the window, and a menu taller than the window scrolls. The size is read with `offsetWidth`, not `getBoundingClientRect`, because the menu is scaling in while it is measured (chapter 27 explains the difference). The `ui.zoom` setting is divided out at the end.

### The safe triangle

```tikz caption="Moving toward an open submenu crosses other rows; inside the triangle, the submenu stays" alt="A menu with rows New, Open Recent (highlighted, with its submenu open to the right), Save and Close. From the pointer on Open Recent, a shaded triangle reaches the top and bottom corners of the submenu's near edge. The pointer path crosses the Save row while staying inside the triangle, so the submenu stays open."
\begin{tikzpicture}[x=1mm,y=1mm]
\draw[fill=fwPaper,draw=fwSlate,rounded corners=1.5pt] (0,0) rectangle (40,32);
\fill[fwBrandSoft] (24,22) -- (41,30) -- (41,6) -- cycle;
\node[anchor=west,font=\scriptsize] at (3,28) {New};
\fill[fwBrandSoft] (1,20) rectangle (39,25);
\node[anchor=west,font=\scriptsize] at (3,22.5) {Open Recent};
\node[font=\scriptsize] at (36,22.5) {$\rangle$};
\node[anchor=west,font=\scriptsize] at (3,16) {Save};
\node[anchor=west,font=\scriptsize] at (3,10) {Close};
\draw[fill=fwPaper,draw=fwSlate,rounded corners=1.5pt] (41,6) rectangle (78,30);
\node[anchor=west,font=\scriptsize] at (44,26) {notes};
\node[anchor=west,font=\scriptsize] at (44,20) {journal};
\node[anchor=west,font=\scriptsize] at (44,14) {work};
\draw[fwBrand,dashed] (24,22) -- (41,30) (24,22) -- (41,6);
\draw[fwInk,line width=1.4pt,-{Stealth[length=2.2mm]}] (24,22) .. controls (30,18) and (36,15) .. (46,14);
\fill[fwInk] (24,22) circle (0.7);
\node[anchor=west,font=\scriptsize,text width=46mm] at (84,22) {The pointer crosses \textbf{Save} on its way to \textbf{work}. Inside the triangle, the switch to Save waits 300 ms, by which time the pointer has reached the submenu.};
\end{tikzpicture}
```

<Source path="src/fanwit/workbench/menus/MenuSurface.svelte" from="	function inTriangle" to="	}" />

When a submenu is open and the pointer moves onto another row, the surface checks whether the pointer is inside the triangle formed by its previous position and the submenu's near corners. If it is, the person is probably heading for the submenu, so switching rows waits 300 ms instead of closing the submenu at once. This is the technique Apple's menus use, and its absence is the classic "my submenu keeps closing" bug.

<Callout kind="new" title="New here: a point in a triangle with cross products">

`s(p1, p2, p3)` is the 2D cross product of `p1 - p3` and `p2 - p3`. Its sign says which side of the line through `p2` and `p3` the point `p1` lies on. A point is inside the triangle when all three signs agree: it is on the same side of every edge. The final expression is "not (some negative and some positive)", which also counts points exactly on an edge as inside.

</Callout>

### The keyboard

<Source path="src/fanwit/workbench/menus/MenuSurface.svelte" from="	function keys(e: KeyboardEvent)" to="	}" />

This is the [WAI-ARIA menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/):

- Up, Down, Home and End move between rows, skipping separators and headers.
- Right opens a submenu, Left closes it, and the two swap in right to left languages.
- Escape closes one level.
- Typing letters jumps to the next row that starts with them (**typeahead**). The typed text resets after 600 ms.
- Tab moves into a rich item (a slider, swatches) and Shift+Tab moves back out to the row.

Groups become separators automatically. Contributors only name a `group`, and nobody ever adds a separator by hand (chapter 22).

<Source path="src/fanwit/workbench/menus/MenuSurface.svelte" />

### Rich items

Each kind from chapter 22 is a small component receiving `MenuKindProps`. The slider shows the pattern: it calls `emit` with `preview: true` while you drag (throttled to every 50 ms), and once more without it when you let go:

<Source path="src/fanwit/workbench/menus/kinds/Slider.svelte" from="<script lang=" />

The other built in kinds work the same way:

<Source path="src/fanwit/workbench/menus/kinds/Toggle.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/IconRow.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/Segmented.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/Stepper.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/Input.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/ColorSwatches.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/Progress.svelte" />

<Source path="src/fanwit/workbench/menus/kinds/List.svelte" />

## Toasts and the notification centre

`ToastStack` draws chapter 14's toasts. It shows at most three, with a "+n more" pill for the rest, and pauses their timers while hovered or focused. On a touch screen, you can dismiss a toast by swiping it more than 80 px:

<Source path="src/fanwit/workbench/ToastStack.svelte" from="	function down(e: PointerEvent, t: Toast)" to="	}" />

Notification bodies may use a tiny Markdown subset (`**bold**`, `*italic*`, `` `code` ``). `md` escapes the text **first**, then adds the few tags it allows, so a notification can never inject HTML:

<Source path="src/fanwit/workbench/ToastStack.svelte" from="	function md(" to="	}" />

<Callout kind="new" title="New here: animate:flip">

`animate:flip` on the items of a keyed `{#each}` animates them to their new positions when the list changes. When the middle toast is dismissed, the ones below slide up instead of jumping. FLIP stands for First, Last, Invert, Play: measure before, measure after, apply the difference as a transform, then animate the transform away. [Svelte docs: animate:](https://svelte.dev/docs/svelte/animate)

</Callout>

<Source path="src/fanwit/workbench/ToastStack.svelte" />

<Source path="src/fanwit/workbench/NotificationCenter.svelte" />

## Dialogs

On the desktop, `k.sys.dialog.ask(...)` shows the operating system's native dialog. In a browser, `window.confirm` would be ugly and unthemable, so `DialogHost` registers itself as the browser host's **dialog presenter** (chapter 5) and draws a styled one:

<Source path="src/fanwit/workbench/DialogHost.svelte" from="<script lang=" />

- **Roles, not positions.** Callers say which button confirms and which cancels, never "left" or "right". Windows puts the primary button first. macOS and most Linux desktops put it last, and `primaryFirst` follows the platform.
- **A dangerous action looks dangerous.** A `warning` dialog's confirm button uses the destructive style.
- **Focus and keys.** The confirm button gets focus on open, Enter presses it, Escape cancels, and `role="alertdialog"` with `aria-labelledby` and `aria-describedby` lets screen readers read the title and the message.

## Popovers and virtual windows

`PopoverLayer` draws views anchored to an element: a colour picker under its button, a flyout at the cursor. Popovers are another use of `WindowView` (chapter 28), so a popover is just a view with a position.

<Source path="src/fanwit/workbench/PopoverLayer.svelte" />

`VirtualWindows` is the web's window manager (chapter 21). It draws each virtual window as a card with a title bar, which can be dragged by its title and resized from its corner, raised on click, minimised to a strip along the bottom, and maximised to fill the page. A modal one gets a veil behind it, and clicking the veil triggers chapter 21's `blocked()` feedback. A window with its own layout (a popped out tab on the web) renders a whole `LayoutRoot` inside its card.

<Source path="src/fanwit/workbench/VirtualWindows.svelte" />

## Developer overlays

`DevOverlays` draws the tools a developer turns on:

- the **keyboard overlay** (Ctrl+/, or holding Ctrl for 800 ms), listing the bindings available right now, grouped by category;
- the **element inspector** (Ctrl+Alt+I in developer mode), which outlines what is under the pointer and shows its component file, line, view and menu location;
- the **docking preview** while a tab is dragged (chapter 27).

<Source path="src/fanwit/workbench/DevOverlays.svelte" />

## Checkpoint

```sh
pnpm check
```

All of these are exercised end to end once the app boots (next chapter):

- `e2e/smoke.test.ts` covers the palette, tab menus by mouse and keyboard, and a floating card.
- `e2e/flows.test.ts` covers rich menu items driving undoable commands, a confirm dialog (focus on the confirm button, Escape cancels), a toast, and the settings window, which is a virtual window on the web.

<Check question="A menu item's label contains &lt;img src=x onerror=alert(1)&gt;. The palette highlights matched letters in it. Is that a problem?" options={["Yes: the label is inserted as HTML", "No: highlight splits the label into text runs, and Svelte escapes text", "Only on the web build"]} answer={1}>

The palette never builds HTML from labels. It builds runs of plain text and lets Svelte render them as text, so markup in a label shows up as characters. Toasts are the one place with formatting, and `md` escapes the text before adding its few tags.

</Check>
