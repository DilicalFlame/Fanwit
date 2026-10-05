# Your app: modules and showcases

Everything so far lives in `src/fanwit`: the template. Your app lives in `src/app`. This last feature chapter builds what ships there as examples: two sample modules and eleven **showcases**, layouts that rebuild the look of well known apps. They are the proof that everything in this rebuild composes, and the starting point for your own features.

<Callout kind="why">

The template and your app are kept in separate folders so FaNWiT can be updated without touching your code, and your code never needs to edit the template. Your features are modules, found by a glob, so adding one never means editing a list. The samples and showcases are **parts**: each folder has a `part.toml`, and `pnpm fw strip` removes them (with their tests) when you no longer want them, and `pnpm fw restore` brings them back.

</Callout>

## Found by glob

<Source path="src/app/modules/index.ts" />

`app.config.ts` (chapter 23) passes `appModules` to boot. The glob finds every `modules/<id>/module.ts` and `showcase/<part>/module.ts` at build time (chapter 23's `import.meta.glob`, here with `eager: true` and `import: "default"`), so `pnpm fw add module <id>` only has to write a folder.

<Source path="app.config.ts" />

## Hello: a module in fifteen lines

<Source path="src/app/modules/hello/module.ts" />

One module, and the command is in the palette, bound to Ctrl+Alt+H, in a view's title menu, runnable from the terminal as `fanwit-cli hello greet --name Asha`, with a lazy view. Nothing here is special to hello: each line is a contribution point from chapter 30.

<Source path="src/app/modules/hello/activate.ts" />

`activate` is a separate file, imported only when `hello.greet` runs or the view opens (chapter 13). The handler returns a value, which the palette ignores, the CLI prints (as JSON with `--json`) and a test can check:

<Source path="src/app/modules/hello/hello.test.ts" />

<Source path="src/app/modules/hello/views/HelloView.svelte" />

<Source path="src/app/modules/hello/part.toml" />

## Notes: a real feature

The notes sample is what most FaNWiT apps start from: a Markdown editor, a live preview, daily notes and backlinks.

<Source path="src/app/modules/notes/module.ts" from="export default defineModule" until="		menus: {" />

- **Views** declare `opens: ["md", "markdown", "txt"]`, which makes them the editor for those files everywhere: the explorer, quick open and file associations (chapters 24 and 37). `identity` is the path, so opening a note twice focuses one tab.
- **Commands** use `when` clauses on context keys set by earlier chapters: `focusedView`, `resource.ext`, `vault.open`.
- **Settings** include `daily.folder`, settable per vault, and `editor.wrapColumn`, which is only shown when wrapping is `bounded` (a `when` on a setting, chapter 16).
- **Translations** travel with the module (`i18n`), with English kept in the definitions.
- **`activationEvents: ["onVault"]`** starts it when a vault opens, since its index has to be registered before notes are read.

<Source path="src/app/modules/notes/activate.ts" />

Backlinks are an **indexer** (chapter 17): a function from a file's text to data, here the links it contains. The vault runs it on every Markdown file and keeps the results current as files change, and the Backlinks view asks it which notes link to the open one. The `notes:changed` event the editor emits is what plugins like Word Count listen to (chapter 41).

<Source path="src/app/modules/notes/views/NoteEditor.svelte" />

<Source path="src/app/modules/notes/views/NotePreview.svelte" />

<Source path="src/app/modules/notes/views/Backlinks.svelte" />

<Source path="src/app/modules/notes/notes.test.ts" />

<Source path="src/app/modules/notes/notes.e2e.ts" />

## Showcases

Each showcase rebuilds the look and layout of a well known app as a **layout preset** plus a few mock views: Blender, a web browser, a dashboard, Discord, Excel, Figma, Notion, Obsidian, Photoshop and a terminal. They exist to show the layout system's range. Every one is the same workbench, from chapters 19 to 30, with a different `workspace.toml`.

<Source path="src/app/showcase/_shared/contrib.ts" />

The shared part gives every showcase the same small helpers, and `TitlebarTabs.svelte` for apps whose tabs live in the title bar.

<Source path="src/app/showcase/_shared/TitlebarTabs.svelte" />

### Blender, read closely

<Source path="src/app/showcase/blender/module.ts" />

<Source path="src/app/showcase/blender/presets/blender.toml" />

Blender's screen is split into **areas**, and each area can switch which editor it shows. The preset is a tree of splits with one `showcase.blender.area` pane per area, each with an `editor` prop. The pane's title comes from the editor it shows, through a computed `title` (chapter 19). The title bar is a custom node across the whole bar (chapter 28).

<Source path="src/app/showcase/blender/views/Area.svelte" />

`Area` reads its `editor` prop and draws the matching mock (viewport, outliner, properties, timeline, shader nodes). Switching editors is a `setAttrs` action on its own pane's props, so the switch is saved in `workspace.toml` and can be undone, like every other layout change.

<Source path="src/app/showcase/blender/blender.e2e.ts" />

### The others

Each showcase folder has the same shape: `module.ts`, `presets/<name>.toml`, `views/`, a README, a `part.toml` and an end to end test. Read any of them with what you know now:

| Showcase | What its layout demonstrates |
|---|---|
| Discord | a server rail, a channel list, a chat and a member list: fixed sidebars around one main view |
| Figma | a canvas between two property panels, with a toolbar title bar |
| Excel | a grid view with a formula bar header and sheet tabs at the bottom (`strip = "bottom"`) |
| Notion | a page view with its own title bar and a collapsible sidebar |
| Obsidian | files, a graph and notes, with tabs in the title bar |
| Photoshop | a canvas surrounded by docked panels (stacks) |
| Dashboard | a grid node of cards (chapter 27's `GridView`) |
| Browser | tabs in the title bar and a toolbar header |
| Terminal | a single view filling the window |

Apply any of them with **Apply layout preset** from the palette, and your open files come along (chapter 19's `mergePreset`).

## Parts

```sh
pnpm fw parts                   # list them, present or stripped
pnpm fw strip showcase-blender  # move one (and its tests) to .trash/
pnpm fw strip                   # strip every sample and showcase, and turn Labs off
pnpm fw restore showcase-blender
pnpm fw strip --undo            # undo the last strip
```

A part is any folder with a `part.toml`: its id, title, kind, and the parts it `requires`. Because each part's tests live inside it (AGENTS.md), stripping a part takes its tests along, and the suite stays green. Because modules are found by glob, nothing else has to be edited. The `fw` CLI itself is built in "Rebuild: tools and shipping".

## Checkpoint

```sh
pnpm vitest run src/app
pnpm exec playwright test src/app --project app
```

This is the end of the features stage, and of the code that runs in the app. What remains is the tooling around it: the `fw` CLI, schemas, CI, and the installer.

<Check question="You add src/app/modules/todo/module.ts with a defineModule default export. What else must you edit for it to load?" options={["app.config.ts, to add it to modules", "src/app/modules/index.ts, to import it", "Nothing: the glob in index.ts finds it at build time"]} answer={2}>

`import.meta.glob("./*/module.ts")` matches the new file when Vite builds, so the module is registered with the others. That is also why `fw add module` and `fw strip` never edit a list.

</Check>
