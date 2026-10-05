---
title: Palette, status bar, icons and app config
section: "Rebuild: services"
order: 10
summary: The last services before the window. A fuzzy matcher, the command palette as a set of prefix providers that also asks for missing arguments, status bar items, icons loaded one at a time, and the app config that ties the build together.
---
# Palette, status bar, icons and app config

Four small services finish the "services" stage:

- `workbench/fuzzy.ts` and `workbench/palette-service.svelte.ts`: Ctrl+P and Ctrl+Shift+P.
- `workbench/status.svelte.ts`: the items along the bottom of the window.
- `icons/registry.svelte.ts` and `icons/all.ts`: every icon by name, loaded on demand.
- `config.ts`: `app.config.ts`, where an app picks its modules and features.

After this chapter every service the workbench needs exists. The next stage draws them.

<Callout kind="why">

The palette is how people reach a command without knowing where its menu is. In FaNWiT it is also how every command gets a UI for free: a command that needs a font size and was run with none (from a key, say) asks for it in the palette, with steps generated from its argument schema (chapter 9). Nobody writes a dialog for it.

</Callout>

## Fuzzy matching

Typing `ts` should find **T**oggle **S**idebar before Inser**t** table row**s**. Both contain the letters in order, but in the first they start words. `fuzzy` scores a match by how it was made:

```tikz caption="The same query, three scores: word starts and early matches win" alt="Query ts. Toggle Sidebar scores 20.5 with matches at the starts of both words. Tabs: close others scores 13.2 with T at a word start and s in the middle. Insert table rows scores 6.7 with t at the start of table and s at the end of rows."
\begin{tikzpicture}[x=1mm,y=1mm,r/.style={fwnode,anchor=west,text width=48mm,align=left,minimum height=7mm,font=\small\ttfamily},s/.style={font=\small,anchor=west}]
\newcommand{\hit}[1]{\textbf{\textcolor{fwBrand}{\underline{#1}}}}
\node[font=\small] at (-14,12) {\texttt{ts}};
\node[r,fill=fwBrandSoft,draw=fwBrand] at (0,12) {\hit{T}oggle \hit{S}idebar};
\node[s] at (52,12) {20.5\quad two word starts, T is first};
\node[r,fill=fwPaper,draw=fwSlate] at (0,3) {\hit{T}ab\hit{s}: close others};
\node[s] at (52,3) {13.2\quad one start, then consecutive};
\node[r,fill=fwPaper,draw=fwSlate] at (0,-6) {Insert \hit{t}able row\hit{s}};
\node[s] at (52,-6) {6.7\quad late, s in mid word};
\end{tikzpicture}
```

<Source path="src/fanwit/workbench/fuzzy.ts" />

The algorithm, in order:

1. **Fast reject.** One pass checks that the query's letters appear in order at all, so most items fail cheaply.
2. **Greedy, but picky.** For each query letter, take the next occurrence that starts a word (after a space, `-`, `_`, `.`, `/`, `:`, or a lower to upper case change in `openFile`) or directly follows the previous match. Otherwise, take the first occurrence.
3. **Score.** Each matched letter scores 1. A letter directly after the previous match adds 5, a word start adds 8, and a match at the very start adds 4. Skipping ahead costs a little, an exact or prefix match earns a lot, and long texts lose a little.

`positions` is returned so the palette can bold the matched letters.

<Callout kind="new" title="New here: character classes and comparing case">

`/[\s\-_./:]/.test(ch)` checks one character against a **character class**: whitespace (`\s`), a hyphen (escaped as `\-`, since it would mean a range), underscore, dot, slash or colon. `text[j] !== t[j]` compares the original text with its lowercase copy. If they differ, the letter is upper case, and when the previous letter was not, this is a camel hump.

</Callout>

## The palette

The palette is a text box and a list, and **providers** fill the list. The first characters of the query pick the provider: nothing for quick open, `>` for commands, `@` for symbols, `:` for go to line, `?` for help. The longest matching prefix wins, so `>>` can be a different provider from `>`:

<Source path="src/fanwit/workbench/palette-service.svelte.ts" from="export interface PaletteProvider" to="}" />

<Source path="src/fanwit/workbench/palette-service.svelte.ts" from="	get mode(): PaletteProvider" to="	}" />

<Callout kind="new" title="New here: getters">

`get mode()` defines a property computed when read: `palette.mode` looks like a field but runs the function each time. Because it reads `this.query`, a `$state` field, a component that shows `palette.mode.title` updates whenever the query changes, with no extra wiring.

</Callout>

Providers may be asynchronous: searching file names in a large vault takes time. If you type faster than results arrive, an old answer could land after a newer one and replace it. `refresh` numbers each request and drops answers that are no longer the latest:

<Source path="src/fanwit/workbench/palette-service.svelte.ts" from="	async refresh()" to="	}" />

This **sequence number** trick handles any "latest request wins" situation (search boxes, autocomplete) without cancelling anything. The providers themselves (files, commands, symbols) are registered by the core module in "Rebuild: the window".

### Asking for arguments

Chapter 10's command pipeline calls a **prompter** when a command is run without arguments it needs. The palette is that prompter. `ask` returns a promise and switches the palette into **prompt mode**: one step per missing argument, with choices for enums, booleans and references (a command, a view, a theme), free text for strings and numbers, and **Browse…** for paths:

<Source path="src/fanwit/workbench/palette-service.svelte.ts" from="	ask(title: string" to="	}" />

<Source path="src/fanwit/workbench/palette-service.svelte.ts" from="	submitStep(value" to="	}" />

`Number("abc")` is `NaN`, and `submitStep` refuses it, so the step stays put until you type a number. Pressing Escape calls `close`, which resolves the promise with `undefined`, and the command pipeline cancels the run.

<Source path="src/fanwit/workbench/palette-service.svelte.ts" />

## Status bar items

Modules put short facts in the status bar: the word count, the line and column, the sync state. An item has a side, a priority (higher sits closer to the outer edge), text or an icon, and usually a command run when clicked:

<Source path="src/fanwit/workbench/status.svelte.ts" />

`add` returns a handle that is also a `Disposable`, with `update` for changing the text later. `item(id)` returns the same thing with a setter, for the plugin SDK's `item.text = "12 words"` style.

<Callout kind="new" title="New here: const self = this, and getters and setters in object literals">

Inside `update(p) { ... }` written as a method of the returned object, `this` would be that object, not the service. `const self = this` captures the service first. An arrow function would also work, since arrows keep the outer `this`, but method syntax is needed for `get text()` and `set text(t)`. Those are accessors on a plain object: `handle.text = "12 words"` calls the setter.

</Callout>

## Icons

FaNWiT uses [Lucide](https://lucide.dev), about 1,600 icons, each a Svelte component:

```sh
pnpm add @lucide/svelte
```

Importing all of them would add hundreds of kilobytes to startup. Instead, icons are named by string (`icon: "file-text"`) and loaded the first time something shows them:

<Source path="src/fanwit/icons/all.ts" />

<Callout kind="new" title="New here: import.meta.glob">

`import.meta.glob("/node_modules/@lucide/svelte/dist/icons/*.svelte")` is a Vite feature. At build time it becomes an object with one entry per matching file, path to `() => import(path)`, and each file becomes its own small chunk. Nothing is downloaded until a loader is called. FaNWiT uses the same function to find app modules (`src/app/modules/*`) and showcase parts without listing them by hand. [Vite docs: Glob import](https://vite.dev/guide/features#glob-import)

</Callout>

<Source path="src/fanwit/icons/registry.svelte.ts" />

- `all.ts` is itself imported lazily, so even the map of loaders stays out of startup.
- Modules and plugins can `register` SVG icons by name. The SVG is cleaned first: no scripts, no `on...` handlers, no links outside the document. An icon is decoration and must never run code.
- **Icon themes** (`setTheme`) map names to other names or registered SVGs, so a theme can swap the whole icon set.
- `cached` lets the `Icon` component (next stage) draw a warm icon synchronously, without a flash of nothing.

## The app config

The last file of the stage is the one an app author edits first. `app.config.ts` says which modules are on, which built in features to keep, where data lives, the default layout and the plugin policy:

<Source path="src/fanwit/config.ts" />

`features: { labs: false }` does more than hide Labs. Boot (next stage) only imports a feature's module when it is on, so the bundler leaves the code out entirely. The docs site is the same app with a different config: no app modules and a pruned command set (chapter 1's `vite --mode docs`).

## Checkpoint

<Source path="src/fanwit/workbench/palette.test.ts" />

```sh
pnpm vitest run src/fanwit/workbench
```

The services stage is complete. Run everything so far:

```sh
pnpm vitest run src/fanwit
```

<Check question="A command needs a size argument and is run from a keyboard shortcut with no arguments. What happens?" options={["It fails with a missing argument error", "The palette opens in prompt mode and asks for the size, then the command runs", "It runs with size undefined"]} answer={1}>

The command pipeline finds the missing required argument and calls the prompter, which is the palette. The palette builds a step from the argument's spec (a number, with its min and max as the hint) and resolves with the value. Escape cancels the run.

</Check>
