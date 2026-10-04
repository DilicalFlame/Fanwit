---
title: Manual and docs
section: Guides
order: 25
summary: How the manual works, and how to write your app's own.
---
# Manual and docs

The manual you are reading is part of the app. Press **F1** anywhere and the page for the focused view opens; press **/** in this window to search everything.

## Why the manual lives in the app

Documentation kept on a separate website drifts. The site describes last month's commands, and its examples can't touch the running app. FaNWiT makes the manual part of the build instead:

- **It can't go stale where it matters.** The command, setting, keybinding and view references are generated from the live registries. The API reference is generated from the source by TypeDoc. Each time you look, you see what the running build actually contains.
- **It can act.** A code block marked `fanwit-run` gets a **Run** button that executes a real command, so a guide can say "try it" and mean it.
- **It is one source with several outputs.** The same Markdown renders in this window, on the docs site (`fw docs build`), and later as `llms.txt` for AI assistants.
- **It is checked.** `fw docs check` fails CI on broken links and missing anchors, on public API without a doc comment and an `@example`, on learning paths that list missing pages, on guides that never say why, and on drift: a repo path in backticks that no longer exists, or a `pnpm fw` command the CLI does not have.

## Two docsets, one window

A **docset** is a folder under `docs/` with a `docset.toml`. FaNWiT ships two:

| Docset | Folder | Who reads it | `ship` |
|---|---|---|---|
| FaNWiT | `docs/fanwit` | you, while building | `dev`: development builds only |
| Your app | `docs/app` | your users | `prod`: production builds too |

The chips in the title bar switch between docsets, and between **Manual** (guides, explanations, tutorials) and **Reference** (generated pages and lookup tables). A docset with reading levels shows its levels instead of Manual: this one has **Beginner**, **Intermediate** and **Expert**. Search covers the current docset; tick **All docsets** to widen it.

`ship = "dev"` docsets are never imported by a production build, so the FaNWiT manual costs your users nothing. `web = true` adds a docset to the static docs site.

```toml
# docs/app/docset.toml
title = "My app"
version = "app"          # the version in fanwit.app.toml
ship = "prod"            # your users get it (F1)
web = false              # true: part of fw docs build
sections = ["Getting started", "Guides", "Reference"]
reference = ["commands", "keybindings", "settings"]
# api = "src/app/api.ts" # exports become an API reference
```

Add another docset with `pnpm fw docs new user-guide`.

### Reading levels

A docset can be written for more than one reader. Each `[[levels]]` entry owns some of its sections; the title bar switches between levels, the contents show only that level's sections (plus sections no level lists, like a home page), and prev and next links stay within the level. Opening a page from a link or search switches to its level. A written `index.md` is the docset's home; `<Levels />` on it draws a card per level with the reader's progress.

```toml
[[levels]]
id = "beginner"
title = "Beginner"
summary = "No Svelte or Rust yet? Start here."
sections = ["Start here", "Svelte basics", "Rust basics"]
```

On Beginner pages, *why* and *under the hood* callouts stay open whatever the reading settings say.

## Writing a page

A page is a Markdown file with a little front matter:

```md
---
title: Sync
section: Guides        # navigation group, ordered by the docset's sections
order: 3               # position within the section
kind: reference        # optional: list it under Reference instead of Manual
since: 1.2.0           # optional: "Since 1.2.0" badge
---
# Sync

Why sync exists, then how to use it, then how it works.
```

A guide is easiest to learn from when it answers three questions in order: **why** the feature exists and when to reach for it, **how** to use it step by step, and **what** happens underneath, so the reader can predict it next time. Lead with the reason; a reader who knows why can work out the details on their own.

### Links

| Write | Opens |
|---|---|
| `manual://app/guides/sync` | a page in a docset |
| `manual://app/guides/sync#conflicts` | a heading on it |
| `manual://layout#views` | a bare id: the linking docset first, then FaNWiT's |

Heading anchors are the heading text in lower case with dashes: `## Conflict rules` becomes `#conflict-rules`. Hover a heading and click **#** to copy its link.

### Runnable examples

```fanwit-run
theme.select
```

The fence is `fanwit-run`, then a command id and optional JSON arguments: `layout.applyPreset {"preset": "browser"}`.

### Diagrams in TikZ

A fence named `tikz` draws a figure with LaTeX. Options after the name give it a caption and a description for screen readers:

```tikz caption="A command runs through its pipeline" alt="Three boxes: palette, command, handler, joined by arrows"
\node[fwuser] (p) {Palette};
\node[fwcore, right=12mm of p] (c) {Command};
\node[fwhost, right=22mm of c] (h) {Handler};
\draw[fwarrow] (p) -- (c);
\draw[fwarrow] (c) -- node[fwlabel, above] {when, args} (h);
```

The body above is just TikZ commands, so it is wrapped in a `tikzpicture`; a body that starts its own environment (`\begin{tikzpicture}[...]`, `\begin{wf}`, `\begin{forest}`) is used as it is. Every diagram can use the specification's styles (`fwnode`, `fwcore`, `fwhost`, `fwwarm`, `fwuser`, `fwgrey`, `fwarrow`, `fwdash`, `fwlabel`, `layer`), colours (`fwInk`, `fwBrand`, `fwAccent`, ...), macros (`\key`, `\pill`, `\cd`) and its wireframe kit, all in `docs/_tex/fanwit-diagrams.sty`.

Clicking a diagram opens it large in a lightbox (the `manual.figure` view, opened as a layout overlay): wheel or pinch to zoom where the pointer is, drag to move, double click to zoom in, and **+**, **-**, **0** (fit), **1** (actual size) and the arrow keys from the keyboard.

#### Animation

A diagram comes alive when it scrolls into view, if parts of it are marked with scopes. The picture looks the same without them; [GSAP](https://gsap.com) plays them in the page.

| Scope | What it does |
|---|---|
| `\begin{scope}[reveal=2]` | appears at step 2: fades and rises in, and its lines draw themselves. Steps play in order; equal numbers arrive together |
| `\begin{scope}[flow]` | particles stream along its lines, the way data moves through them |
| `\begin{scope}[packet]` | a glowing dot travels along its first line, again and again |
| `\begin{scope}[pulse]` | breathes gently, to point at it |

Combine them by nesting (`\begin{scope}[reveal=3]\begin{scope}[pulse]`). Endless parts start once every step has arrived, pause while the diagram is off screen, and nothing moves for readers who asked for reduced motion. **Play again** (on hover) replays a diagram. Two things to know: a line drawn with `draw=none` produces nothing to follow, so put `packet` on a visible line; and `drop shadow` does not survive the conversion to SVG, so draw a shadow as an offset shape instead.

<Callout kind="under-the-hood">

A diagram compiles once (`latex` then `dvisvgm`, about a second) into `docs/_diagrams/<hash>.svg`, keyed by its source and the style package. Commit those files: readers, CI and contributors without TeX get the picture from the cache, and only an edited diagram compiles again. `pnpm fw docs check` renders missing diagrams, fails on one that does not compile, and deletes SVGs no page uses any more. Dark reading themes invert the colours and turn the hues back.

</Callout>

### Svelte in Markdown

Pages are compiled by [mdsvex](https://mdsvex.pngwn.io), so a page can use Svelte components next to the prose: a live diagram, a small demo, a chart. Code blocks are highlighted at build time by [Shiki](https://shiki.style) and follow the reading theme.

## Components for pages

These work in any page without an import. Leave a blank line inside a component's tags when its content is Markdown.

| Component | What it is for |
|---|---|
| `<Callout kind="why">` | The reason behind a design. Kinds: `why`, `tip`, `note`, `warn`, `under-the-hood`, `learn-more` (links to a tool's official docs). *Why* and *under the hood* fold away when the reader picks **Expert** |
| `<Steps>` | An ordered list drawn as numbered steps |
| `<Tabs labels="TS, TOML">` | One block per label, shown one at a time. Tabs with the same labels switch together |
| `<FileTree>` | A nested list drawn as folders and files |
| `<Keys command="palette.open" />` | The key bound to a command right now, including the reader's own changes |
| `<Term name="vault">` | A glossary word with its definition on hover |
| `<Api symbol="defineModule" />` | An API name with its signature on hover, linking to its reference page |
| `<Diagram steps={[...]}>` | An SVG you step through: parts marked `data-step="2"` light up on step 2 |
| `<LayoutPreview preset="vscode" editable />` | A layout drawn as a miniature window from its TOML; `editable` redraws it as you type |
| `<LiveToml file="settings" />` | One of the app's TOML files as it is right now (`settings`, `keys`, `menus`, `workspace`) |
| `<Playground mode="module" id="...">` | One code block becomes an editor. **module**: a module that joins the running app on Run and is removed on Stop. **kernel**: the same module in a sandbox kernel, with its commands, context keys and a trace of every event and run. **svelte**: a component compiled in the browser and rendered beside the code. **rust**: Rust compiled and run on the Rust Playground. `id` keeps the reader's edits when the title changes |
| `<Check question options answer>` | A question answered in place, with the explanation (its content) shown after |
| `<Levels />` | A card per reading level with the reader's progress and where to continue |
| `<Lab id title expect>` | A goal, steps and a playground. With `expect`, it completes by itself when the playground's output contains that text; without it, the reader marks it done. Completed labs are remembered |

Module playgrounds put code into the running app, so they run only in development builds, on the docs site, or with developer mode on; in a production manual they show the code read only. The other three cannot touch the app and always run: a sandbox kernel lives only inside its playground, Svelte compiles in the page, and Rust compiles on [play.rust-lang.org](https://play.rust-lang.org), which needs the internet and has the standard library only.

A lab wraps a playground with a goal. This one checks itself: make the button count to 3 (or change the code so it starts at 3).

<Lab id="manual-lab-demo" title="Count to three" expect="Count: 3">

Click the button until it says **Count: 3**, or change `$state(0)` so it starts there.

<Playground mode="svelte" id="manual-lab-demo" title="Counter" height={180}>

```svelte
<script>
	let count = $state(0);
</script>

<button onclick={() => count++}>Count: {count}</button>
```

</Playground>

</Lab>

<Playground mode="rust" id="manual-rust-demo" title="Rust, run from the page" height={200}>

```rust
fn main() {
    let layers = ["Platform", "Host", "Kernel", "Systems", "UI kit", "Features"];
    for (i, name) in layers.iter().enumerate() {
        println!("{} {}", i + 1, name);
    }
}
```

</Playground>

<Playground mode="kernel" id="manual-kernel-demo" title="A module in a sandbox kernel" height={240}>

```js
export default defineModule({
	id: "counter",
	contributes: { commands: [{ id: "counter.add", title: "Add one" }] },
	activate(ctx) {
		let n = 0;
		ctx.commands.handle("counter.add", () => {
			n++;
			ctx.context.set("counter.value", n);
			ctx.events.emit("counter.changed", n);
			return n;
		});
	}
});
```

</Playground>

Each one, live:

<Callout kind="tip">

The palette is <Keys command="palette.open" /> and this manual is <Keys command="manual.open" />. Change either in the key editor and this sentence changes with it.

</Callout>

<Steps>

1. Write the page in `docs/app/`.
2. Run `pnpm fw docs check`.
3. Open it with **F1**, from the <Term name="view">view</Term> whose `help` points to it.

</Steps>

<FileTree>

- docs/
  - app/
    - docset.toml
    - glossary.toml
    - welcome.md
  - fanwit/

</FileTree>

<Tabs labels="Markdown, Result">

```md
<Callout kind="why">

Why the feature exists, in two sentences.

</Callout>
```

<p>A purple box titled <em>Why it is like this</em>, open in Guided mode and folded in Expert mode.</p>

</Tabs>

Diagrams are plain SVG with parts marked by step. The [Commands](manual://fanwit/guides/commands) guide steps through the command pipeline this way. Colour them with theme tokens (`currentColor`, `var(--primary)`, `var(--muted)`) and they follow every reading theme.

### A glossary

`docs/<set>/glossary.toml` lists `[[term]]` entries (`name`, optional `aka`, `text`). They become the Glossary page, and `<Term>` looks words up there.

### Learning paths

`docs/<set>/paths.toml` lists `[[path]]` entries: an `id`, a `title`, a `description`, `minutes`, and the `pages` to read in order. The docset then opens on a **Learning paths** page showing each path with your progress. Every page in a path ends with a link to the next one. A page counts as read when you scroll to its end, and you can tick it off or untick it by hand with the circle next to its reading time. Read pages are ticked in the contents too.

```toml
[[path]]
id = "first-hour"
title = "The first hour"
description = "From a fresh clone to your own command, view and plugin."
minutes = 60
pages = ["getting-started", "concepts", "guides/commands", "guides/layout"]
```

## Generated reference

| Page | Built from |
|---|---|
| API | TypeDoc, run on the docset's `api` entry. Doc comments become the text; `@example`, `@since` and `@deprecated` tags are shown |
| Commands, settings, keybindings, views, window kinds, menu locations, context keys | the live registries |
| Error codes | every `FanwitError` code in `src/`, with its hint and docs link |
| TOML files | the JSON schemas in `schemas/` |

In docsets other than FaNWiT's, the registry pages list only your app's own contributions.

## Search

The search box (**/** or **Ctrl+K**) searches pages, sections, the API, commands, settings and error codes at once. A prefix narrows it:

| Prefix | Searches | Selecting a hit |
|---|---|---|
| `/` | pages | opens it |
| `#` | sections | opens the page at that heading |
| `@` | API symbols and members | opens the reference |
| `>` | commands | runs it |
| `:` | settings | toggles a switch, or opens it in Settings (on the docs site: opens the settings reference) |
| `!` | error codes | opens the page that explains it |

Pages opened from search highlight the words you searched for. **Ctrl+Enter** opens a result in a new tab. In any window, `?` in the command palette searches the manual too.

## Reading settings

The **Aa** button holds the reading settings. They are ordinary `manual.*` settings: they live in `settings.toml`, can differ per vault, and apply to this window only.

- **Theme**: follow the app, or Light, Paper, Solarized, Dark, Coal, Navy, Ayu and High contrast.
- **Type**: font (including Atkinson Hyperlegible for low vision and OpenDyslexic), size, line height, line length, paragraph, letter and word spacing, justification, hyphenation.
- **Code**: size, wrapping, ligatures.
- **Assistive reading**: *bionic reading* bolds the start of each word to guide the eye; *focus mode* dims everything but the paragraph you are on; the *reading ruler* follows the pointer; *read aloud* uses the system voice, from where you are.

## The window is a layout

The Manual window is not a special screen. It is the layout preset `manual` (in `src/fanwit/manual/presets/manual.toml`), made of ordinary views: `manual.titlebar`, `manual.nav`, `manual.page` and `manual.outline`. That has three consequences:

- Pages are tabs. Drag one to an edge to read two pages side by side, or pop it out.
- Your arrangement is saved to `manual.layout.toml`. **Reset layout** brings back the preset.
- A window kind can name its own preset (`layout = "manual"` on the kind), so any window you design can work the same way.

The **docs site** is this same window on the web host: `pnpm fw docs serve` runs it, and `pnpm fw docs build` writes a static site to `build-docs/`. Building it also exercises the web build of the app.

## Versions and publishing

The docs site is versioned like the code. `fw docs build --version 1.2.0 --base /my-app/docs/v/1.2.0` builds one version into `build-docs/`. `fw docs publish site --version 1.2.0` then adds it to a folder holding every version:

<FileTree>

- site/
  - index.html  (redirects to the latest release)
  - versions.json
  - llms.txt
  - v/
    - next/
    - 1.2.0/
    - 1.1.0/

</FileTree>

On a published site, the title bar has a version picker, and pages of an older version (or of `next`) say so with a link to the latest. The `web` workflow (`.github/workflows/web.yml`) runs this on GitHub Pages. Every push to `main` publishes `next`, and every `v*` tag (from `pnpm fw release`) publishes a release. Earlier versions are kept on a `docs-site` branch.

Inside the app there is no picker: the manual always matches the build it ships in.

## For AI assistants

The docs site also serves `llms.txt` (an index, see [llmstxt.org](https://llmstxt.org)), `llms-full.txt` (every page in one file) and each page as plain Markdown under `md/<set>/<page>.md`. The dev server serves them too: try `/llms.txt`. `AGENTS.md` in the repository root covers the conventions; these files cover the content.

## Under the hood

1. `src/fanwit/manual/discover.mjs` finds docsets and pages, reads front matter and headings, and resolves `manual://` links. The Vite plugin and `fw docs check` both use it, so they always agree.
2. The Vite plugin (`src/fanwit/manual/vite-plugin.ts`) decides which docsets a build includes. It then exposes them as `virtual:fw-docs`: page metadata, lazy page components, a MiniSearch index built at build time, and the TypeDoc API, which is extracted on first use and cached.
3. mdsvex turns each page into a Svelte component and Shiki highlights its code. The manual window imports a page only when you open it.
4. The page view assigns heading ids, then measures which sections are on screen as you scroll. The outline highlights all of them, not just one.

## Pitfalls

- **Curly braces in prose are Svelte.** Text such as `{name}` outside code is an expression. Put it in backticks or a code block, or write `&#123;`.
- **New pages need a reload.** Editing a page updates it in place, but adding or removing one reloads the window, because the navigation changes.
- **Stale window layout.** If the Manual window looks wrong after a FaNWiT upgrade, run **Reset layout** from the palette.
