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

The chips in the title bar switch between docsets, and between **Manual** (guides, explanations, tutorials) and **Reference** (generated pages and lookup tables). Search covers the current docset; tick **All docsets** to widen it.

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

### Svelte in Markdown

Pages are compiled by [mdsvex](https://mdsvex.pngwn.io), so a page can use Svelte components next to the prose: a live diagram, a small demo, a chart. Code blocks are highlighted at build time by [Shiki](https://shiki.style) and follow the reading theme.

## Components for pages

These work in any page without an import. Leave a blank line inside a component's tags when its content is Markdown.

| Component | What it is for |
|---|---|
| `<Callout kind="why">` | The reason behind a design. Kinds: `why`, `tip`, `note`, `warn`, `under-the-hood`. *Why* and *under the hood* fold away when the reader picks **Expert** |
| `<Steps>` | An ordered list drawn as numbered steps |
| `<Tabs labels="TS, TOML">` | One block per label, shown one at a time. Tabs with the same labels switch together |
| `<FileTree>` | A nested list drawn as folders and files |
| `<Keys command="palette.open" />` | The key bound to a command right now, including the reader's own changes |
| `<Term name="vault">` | A glossary word with its definition on hover |
| `<Api symbol="defineModule" />` | An API name with its signature on hover, linking to its reference page |
| `<Diagram steps={[...]}>` | An SVG you step through: parts marked `data-step="2"` light up on step 2 |
| `<LayoutPreview preset="vscode" editable />` | A layout drawn as a miniature window from its TOML; `editable` redraws it as you type |
| `<LiveToml file="settings" />` | One of the app's TOML files as it is right now (`settings`, `keys`, `menus`, `workspace`) |
| `<Playground mode="module">` | One code block becomes an editor. **module**: a module that joins the running app on Run and is removed on Stop. **svelte**: a component compiled in the browser and rendered beside the code |
| `<Check question options answer>` | A question answered in place, with the explanation (its content) shown after |

Playgrounds run code, so they run only in development builds, on the docs site, or with developer mode on. In a production manual they show the code read only.

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
| `:` | settings | toggles a switch, or opens it in Settings |
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
