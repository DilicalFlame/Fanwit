---
title: "The manual: from Markdown to pages"
section: "Rebuild: features"
order: 6
summary: How this manual is built. Docsets discovered from folders, Markdown compiled to Svelte components with code highlighted at build time, TikZ diagrams compiled once and cached, real repository files embedded and kept in sync, a search index built ahead of time, and a checker that fails the build on a broken link.
---
# The manual: from Markdown to pages

You are reading the output of this chapter. FaNWiT ships a manual system: any app built on it can document itself in Markdown, in a Manual window and on a static docs site. This chapter builds the **build time** half, in `src/fanwit/manual/`: everything that turns `docs/**/*.md` into components and data. Chapter 43 builds the app that shows them, and chapter 44 the playgrounds.

<Callout kind="why">

Documentation rots when it is far from the code and checked by nobody. So the manual is written next to the code, in Markdown that can embed live components, and compiled by the same Vite build as the app. It is checked by `fw docs check` in CI: a link to a missing page, an embedded file that moved, a `<Source>` slice whose marker disappeared, or a public function without an example fails the check. Expensive work (highlighting, diagrams, the search index) happens once, at build time, so pages open instantly.

</Callout>

```tikz caption="From a Markdown file to a page in the Manual window" alt="A Markdown page passes four preprocessors in order: Source embeds repository files, TikZ turns diagrams into cached SVGs, mdsvex turns Markdown into Svelte with Shiki highlighting, and auto import adds the manual components it uses. The result is a Svelte component. Separately, discovery reads docsets and front matter into virtual modules: the page list, the search index and the API reference. The Manual window loads both."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=10mm,font=\scriptsize,text width=24mm}]
\node[b,fwuser] (md) at (0,10) {\texttt{page.md}};
\node[b,fwwarm] (src) at (30,10) {\texttt{<Source>}\\repo files};
\node[b,fwwarm] (tikz) at (60,10) {TikZ\\cached SVG};
\node[b,fwwarm] (mds) at (90,10) {mdsvex\\Shiki};
\node[b,fwwarm] (imp) at (120,10) {auto import\\components};
\node[b,fwcore] (comp) at (150,10) {Svelte\\component};
\draw[fwarrow] (md) -- (src);
\draw[fwarrow] (src) -- (tikz);
\draw[fwarrow] (tikz) -- (mds);
\draw[fwarrow] (mds) -- (imp);
\draw[fwarrow] (imp) -- (comp);
\node[b,fwuser] (set) at (0,-12) {\texttt{docset.toml}\\front matter};
\node[b,fwcore,text width=40mm] (virt) at (60,-12) {\texttt{virtual:fw-docs}\\pages, search index, API};
\node[b,fwgrey] (win) at (150,-12) {Manual window\\docs site};
\draw[fwarrow] (set) -- node[fwlabel,above]{discover} (virt);
\draw[fwarrow] (virt) -- (win);
\draw[fwarrow] (comp) -- node[fwlabel,right]{lazy \texttt{import()}} (win);
\end{tikzpicture}
```

## Docsets

A **docset** is a folder under `docs/` with a `docset.toml`. FaNWiT has two: `docs/fanwit` (this manual, development builds only) and `docs/app` (your app's documentation, which ships to your users). `pnpm fw docs new <id>` makes another.

<Source path="docs/fanwit/docset.toml" />

- `ship = "dev"` keeps a docset out of production builds entirely. Its pages are never even imported, so your users never download FaNWiT's manual.
- `sections` orders the navigation, and `[[levels]]` (Beginner, Intermediate, Expert) say which sections each reading level shows (chapter 43).
- `api`, `schemas`, `rust` and `reference` name what to **generate**: the API reference from a TypeScript entry, the TOML reference from JSON schemas, the Rust command reference from `#[tauri::command]` functions, and pages listing live registries (commands, settings, keybindings, error codes).

Each page is a `.md` file with flat front matter: `title`, `section`, `order` and an optional `summary`.

## Discovery

<Source path="src/fanwit/manual/discover.mjs" />

`discover.mjs` is plain Node JavaScript, shared by the Vite plugin and the `fw` CLI, so the app, the docs site and CI agree on exactly which pages exist. It reads docsets and their pages, extracts headings (with the same ids the page view gives them), counts words, finds error codes in the source, reads the glossary, lists the `fw` CLI's commands and Rust's commands, and writes `llms.txt`: a plain index of the docs, meant for AI assistants.

<Source path="src/fanwit/manual/links.mjs" />

`links.mjs` holds what also runs in the browser: slugs, front matter, and `manual://` links. `manual://fanwit/guides/layout#views` names a docset, a page and a heading, and a bare `manual://layout` resolves in the linking page's own docset first, then in FaNWiT's. Links therefore keep working when a page is shown in the app, on the docs site, or in another docset.

## Four preprocessors

Svelte lets a project add **preprocessors**, functions that rewrite a file before the compiler sees it. `svelte.config.js` registers the manual's four, in order:

<Source path="src/fanwit/manual/mdsvex.mjs" />

1. **`<Source>`** (`source.mjs`) replaces each `<Source path="..." />` line with the real file from the repository, highlighted. A `from`/`to`/`until` slice is shown inline. A whole file becomes a collapsed block that loads on demand from `virtual:fw-source/<path>`, so a chapter that embeds twenty files stays light. Every chapter of this rebuild is written this way, so its code can never drift from the repository: if the file changes, the chapter shows the change. If a slice marker disappears, `fw docs check` fails.
2. **TikZ** (`tikz.mjs`) compiles each `tikz` fence with LaTeX and `dvisvgm` into an SVG, cached in `docs/_diagrams/` by a hash of the diagram and the style file. Only a changed diagram is compiled again, and since the SVGs are committed, contributors without TeX still see every picture. Colours become CSS variables, so diagrams follow the reading theme and dark mode.
3. **mdsvex** turns Markdown into Svelte markup. Code fences are highlighted by **Shiki** at build time, with both light and dark colours as CSS variables, so no highlighter runs in the browser.
4. **Auto import** adds `import { Callout, Check, ... } from "$fanwit/manual/components"` for the components a page uses, so pages never write imports.

<Callout kind="new" title="New here: escaping highlighted code for @html">

Highlighted code reaches Svelte as `{@html \`...\`}`, a template literal inside markup. Two characters are dangerous there. Braces would be read as Svelte expressions, and mdsvex's `escapeSvelte` handles those. Backslashes would be eaten by the template literal: a Rust example containing `"\""` lost its escapes. `inLiteral` turns every remaining backslash into the HTML entity `&#92;`, which the browser shows as a backslash and the template literal leaves alone. It is a one line fix, found because a Rust chapter rendered wrongly.

</Callout>

<Source path="src/fanwit/manual/source.mjs" />

<Source path="src/fanwit/manual/tikz.mjs" />

## The Vite plugin

<Source path="src/fanwit/manual/vite-plugin.ts" />

`fanwitDocs()` serves everything else as **virtual modules**, imports that exist only inside the build:

- `virtual:fw-docs`: the docsets, every page's metadata and headings, a lazy `import()` per page, error codes, schemas, the glossary and the generated reference data. The manual app imports this one module.
- `virtual:fw-docs/search`: a **MiniSearch** index of every page and section, built at build time, so searching needs no indexing in the browser.
- `virtual:fw-docs/api`: the API reference, made by running **TypeDoc** in process on `src/fanwit/index.ts` (`api.mjs`), lazily and cached.
- `virtual:fw-source/<path>.fwsrc.js`: one embedded file each, highlighted, loaded when its block is opened.

It also watches the docs folders: in development a new page or a changed `docset.toml` updates the model without restarting Vite. The `.fwsrc.js` suffix exists for an obscure reason: without it, Vite's JSON plugin claimed `virtual:fw-source/foo.json` before this plugin could.

<Callout kind="new" title="New here: virtual modules in Vite">

A Vite plugin can answer imports that match no file. `resolveId(id)` claims an id (returning it, usually prefixed with `\0`, so no other plugin touches it), and `load(id)` returns the JavaScript source for it. To the app, `import { pages } from "virtual:fw-docs"` looks like any import, but its contents are computed at build time from the repository. TypeScript needs a declaration for it, which `virtual.d.ts` provides. [Vite: Virtual Modules Convention](https://vite.dev/guide/api-plugin#virtual-modules-convention)

</Callout>

<Source path="src/fanwit/manual/virtual.d.ts" />

<Source path="src/fanwit/manual/api.mjs" />

`markdown.ts` is a small runtime Markdown renderer for text that only exists at run time, such as setting descriptions and API doc comments shown in reference pages. It escapes everything and allows no raw HTML:

<Source path="src/fanwit/manual/markdown.ts" />

## Checks

`pnpm fw docs check` runs the same discovery and fails on:

- a `manual://` link to a page or heading that does not exist;
- a `<Source>` whose file or slice marker is missing;
- a braced attribute that Svelte would read as code (the reason this manual writes `&#123;` in some titles);
- a diagram that cannot be rendered;
- a guide without a why callout;
- a public export from `src/fanwit/index.ts` without a doc comment and an `@example`.

It also prints how many of the source files the Rebuild chapters show in full, which is how this rebuild tracks what is still to write.

## Checkpoint

<Source path="src/fanwit/manual/manual.test.ts" />

<Source path="src/fanwit/manual/source.test.ts" />

```sh
pnpm vitest run src/fanwit/manual
pnpm fw docs check
```

<Check question="A function this chapter embeds with a Source slice is renamed, and its from marker no longer matches. What happens?" options={["The chapter silently shows the wrong lines", "The page shows an error box where the slice was, and fw docs check fails until the marker is updated", "The build crashes"]} answer={1}>

`readSource` reports a missing marker instead of guessing. The page shows the problem in place, and `fw docs check`, which runs in CI, fails with the file and the marker, so a chapter cannot quietly drift from the code it explains.

</Check>
