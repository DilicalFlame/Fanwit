# The manual: the reading app

Chapter 42 turned Markdown into components and data. This chapter builds what shows them: the Manual window. It is made entirely of the pieces built in this rebuild, a module, a layout preset, views, commands and settings. Look around the window as you read: every part described here is on your screen.

<Callout kind="why">

Most apps send people to a website for help. FaNWiT keeps the manual **in** the app (development builds only, for FaNWiT's own manual), opened with F1 on whatever view has focus. And because the Manual window is just a layout preset of ordinary views, everything you learned applies to it: pages are tabs you can split, the outline is a panel you can move, and the reading settings are settings. The public docs site is the very same window on the web host, with everything a reader should not touch removed.

</Callout>

## The module

<Source path="src/fanwit/core/manual.ts" from="export const manualModule" to="});" />

The `manual` window kind has `layout: "manual"` (chapter 21): it runs its own workbench with the `manual` preset, saved to `manual.layout.toml` instead of the workspace (chapter 30). The preset puts the title bar, navigation, pages and outline in their regions:

<Source path="src/fanwit/manual/presets/manual.toml" />

Pages are `manual.page` panes with an `identity` of their page key, so opening a page that is already open focuses its tab (chapter 19). The navigation, outline and title bar are `closable = false` and `locked`, so they cannot be closed or dragged away by accident.

The reading settings belong to the manual: theme (nine reading themes, or follow the app), font (including Atkinson Hyperlegible for low vision and OpenDyslexic, downloaded only when chosen), text size, line height and length, spacing, justification, hyphenation, code size and wrapping, bionic reading, focus mode, a reading ruler, read aloud speed, and how much explanation to show. They apply to the Manual window only.

<Source path="src/fanwit/core/manual.ts" />

## Activation

<Source path="src/fanwit/manual/activate.svelte.ts" />

Activation sets `manual.window` (a context key many things depend on), wires the manual commands, applies the reading settings as CSS variables and classes on the window, and follows `manual.open` and `manual.search` sent from other windows. F1 in the main window therefore opens the right page here (chapter 25).

## Shared state

<Source path="src/fanwit/manual/state.svelte.ts" />

`ManualState` holds what the views share: the docset, the **reading level**, the outline the active page publishes, scroll and search requests, and the pages read and labs completed, saved across sessions. Levels come from `docset.toml` (chapter 42): the navigation shows only the chosen level's sections, and opening a page from another level (a link, a search result) switches to that level, so you are never looking at a page your navigation does not list.

<Source path="src/fanwit/manual/docs.ts" />

`docs.ts` turns the build time model into what the views need: the page catalog (written pages, generated reference pages and API symbols), titles, ordering, neighbours for Previous and Next, and each page's level.

## The views

<Source path="src/fanwit/views/manual/ManualTitlebar.svelte" />

The **title bar** has the level switcher (a select on narrow windows), search, reading settings, and the docs site's version picker. It is a layout node across the whole title bar (chapter 28's custom title bars), so it carries the window controls itself.

<Source path="src/fanwit/views/manual/ManualNav.svelte" />

The **navigation** lists sections and pages for the current level, with a tick on pages you have read, and keeps the current page in view.

<Source path="src/fanwit/views/manual/ManualPage.svelte" />

The **page** is the most involved view. It:

- loads the page's component lazily, and shows its level, reading time and summary;
- wires the code blocks' **Copy** buttons, and the **Run** buttons that run a real command (on the docs site, commands that only exist in the desktop app say so instead of failing);
- resolves `manual://` links, and scrolls to anchors;
- publishes the **outline**: which sections are on screen, which are read, and how far down you are;
- marks the page read when you reach its end;
- plays a diagram's animation when it scrolls into view (with a replay button), and opens it **large** when clicked;
- offers Previous and Next within the level.

<Source path="src/fanwit/views/manual/ManualOutline.svelte" />

<Source path="src/fanwit/views/manual/ReadingPanel.svelte" />

<Source path="src/fanwit/views/manual/SearchBox.svelte" />

<Source path="src/fanwit/views/manual/LearningPaths.svelte" />

<Source path="src/fanwit/views/manual/ApiSymbol.svelte" />

<Source path="src/fanwit/views/ManualToc.svelte" />

`ManualToc` is the main window's sidebar entry: it lists the manual and opens pages in the Manual window.

## Search

<Source path="src/fanwit/manual/search.ts" />

<Source path="src/fanwit/manual/search-options.ts" />

Search combines the MiniSearch index built at build time (pages and their sections) with what only exists at run time: API symbols, commands, settings and error codes. Prefixes narrow it, as in the palette: `/` pages, `#` sections, `@` API, `>` commands, `:` settings, `!` errors. Results from the index are ranked by MiniSearch, with fuzzy and prefix matching and titles boosted. The run time kinds use chapter 23's fuzzy matcher. `SEARCH_OPTIONS` is one file shared by the build and the app, since an index loaded with different options than it was built with returns nothing.

The `?` palette mode searches the manual too, so help is one prefix away from anywhere in the app.

## Diagrams that open large

Clicking a diagram opens it in a lightbox overlay, `manual.figure`, which is a view like any other, opened with chapter 19's `openOverlay`. There you can zoom with the wheel or `+` and `-`, pan by dragging or with the arrow keys, fit with `0`, and close with Escape:

<Source path="src/fanwit/views/manual/FigureView.svelte" />

A few diagrams are animated. A TikZ scope can mark part of a figure to appear at a step, to show data flowing along its lines, or to pulse. `figure-anim.ts` plays those marks with GSAP's DrawSVG and MotionPath plugins, and with reduced motion on, shows the finished picture instead:

<Source path="src/fanwit/manual/figure-anim.ts" />

## Components for pages

Pages use these without importing them (chapter 42's auto import):

| Component | For |
|---|---|
| `Callout` | why, under the hood, new here, learn more, warnings. Why callouts stay open on Beginner pages |
| `Check` | a question with options and an explanation of the right answer |
| `Steps`, `Tabs`, `FileTree`, `Keys`, `Term` | step lists, tabbed alternatives, folder trees, key chords, glossary terms |
| `Diagram`, `CommandPipeline`, `LayoutPreview`, `LiveToml` | stepped and interactive figures: a diagram you step through, the command pipeline, a layout drawn from TOML, a live TOML file |
| `Api` | an API symbol's reference, inline |
| `Levels`, `SourceFile` | the level cards on the home page; a whole embedded file |
| `Lab`, `Playground` | exercises and live editors (chapter 44) |

<Source path="src/fanwit/manual/components/index.ts" />

<Source path="src/fanwit/manual/components/Callout.svelte" />

<Source path="src/fanwit/manual/components/Check.svelte" />

<Source path="src/fanwit/manual/components/Steps.svelte" />

<Source path="src/fanwit/manual/components/Tabs.svelte" />

<Source path="src/fanwit/manual/components/FileTree.svelte" />

<Source path="src/fanwit/manual/components/Keys.svelte" />

<Source path="src/fanwit/manual/components/Term.svelte" />

<Source path="src/fanwit/manual/components/Diagram.svelte" />

<Source path="src/fanwit/manual/components/CommandPipeline.svelte" />

<Source path="src/fanwit/manual/components/LayoutPreview.svelte" />

<Source path="src/fanwit/manual/components/LiveToml.svelte" />

<Source path="src/fanwit/manual/components/Api.svelte" />

<Source path="src/fanwit/manual/components/Levels.svelte" />

<Source path="src/fanwit/manual/components/SourceFile.svelte" />

The reading styles, including the nine reading themes, focus mode, the ruler and the diagram colours for light and dark:

<Source path="src/fanwit/manual/reading.css" />

## The docs site

`vite --mode docs` (`pnpm run docs`, or `pnpm fw docs build` for the static site) boots the same app on the web host with the docs configuration from chapter 30: no app modules, the manual layout, nothing persisted. `docsSite` then removes what a reader must not reach:

<Source path="src/fanwit/manual/docs-site.ts" from="export function docsSite" to="}" />

- **One allowlist of commands** survives: reading, tabs, splitting, undo, theme, and copy. The rest are pruned from the registry (chapter 10's `prune`), so the palette, keys, menus and Run buttons cannot reach them, whichever way they are tried.
- **Ctrl+P and Ctrl+Shift+P search the manual** instead of opening a palette full of app commands.
- **A layout interceptor** (chapter 20) refuses pop outs and floating panes, since the docs site never starts the windows they need.

Elsewhere, the docs site hides "All settings" in the reading panel, never offers to open a vault when files are dropped, and an empty page area offers the home page instead of the palette (chapter 27).

<Source path="src/fanwit/manual/docs-site.ts" />

## Checkpoint

```sh
pnpm run docs
pnpm exec playwright test --project docs
```

The docs site tests check that the palette exposes no app commands, that closing every page offers the home page, that levels filter the navigation, and that a diagram opens large, zooms and closes with Escape:

<Source path="src/fanwit/manual/docs-site.docs.e2e.ts" />

<Check question="On the docs site, a page has a Run button for vault.open. What does the reader see?" options={["The button opens a folder picker", "The button is replaced by a note that it runs in the desktop app, because vault.open was pruned", "An error toast"]} answer={1}>

`docsSite` pruned `vault.open` from the registry. The page view checks whether a Run button's command exists before drawing it, and shows a "desktop app" note instead of a button that would fail.

</Check>
