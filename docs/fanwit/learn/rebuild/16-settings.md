---
title: Settings
section: "Rebuild: services"
order: 3
summary: Settings as declared data with types and limits, resolved through six layers from defaults to the command line, stored in settings.toml that you can edit, with secrets kept in the OS keychain.
---
# Settings

Every app has preferences. In FaNWiT a setting is **declared** once, with its type, default, limits and description, and that one declaration drives validation, the Settings window's controls, the generated reference, a JSON Schema for your editor, and `settings.toml`. This chapter builds the declarations (`settings/define.ts`), the service that resolves values (`settings/settings.svelte.ts`) and the schema generator (`settings/schema.ts`).

<Callout kind="why">

The same font size can come from many places: the module's default, the app's own choice (`app.config.ts`), your `settings.toml`, a vault that overrides it for one project, a single window, or `--set editor.fontSize=18` on the command line. Instead of each feature merging those, FaNWiT defines the **layers** once (Section 13.2) and every `get` walks them. And an invalid value in a file never breaks the app: it is reported and skipped, and the next layer down applies.

</Callout>

```tikz caption="Six layers: the highest one that has a valid value wins" alt="Six stacked layers from default at the bottom to cli at the top; a value in the vault layer wins over global, app and default, while window and cli are empty"
\begin{tikzpicture}[x=1mm,y=1mm,
  layer/.style={fwnode,text width=56mm,minimum height=8mm,font=\small,align=left},
  val/.style={font=\small\ttfamily,anchor=west}]
\node[layer,fill=fwPaper,draw=fwSlate] at (0,0) {\textbf{default}\quad the declaration};
\node[layer,fill=fwPaper,draw=fwSlate] at (0,10) {\textbf{app}\quad app.config.ts};
\node[layer,fwwarm] at (0,20) {\textbf{global}\quad settings.toml};
\node[layer,fwcore] at (0,30) {\textbf{vault}\quad .fanwit/settings.toml};
\node[layer,fill=fwPaper,draw=fwSlate] at (0,40) {\textbf{window}\quad this window only};
\node[layer,fill=fwPaper,draw=fwSlate] at (0,50) {\textbf{cli}\quad --set, environment};
\node[val,text=fwSlate] at (31,0) {15};
\node[val,text=fwSlate] at (31,10) {13};
\node[val,text=fwSlate] at (31,20) {14};
\node[val,text=fwBrand,font=\small\ttfamily\bfseries] at (31,30) {16 \faIcon{check}};
\node[val,text=fwSlate] at (31,40) {--};
\node[val,text=fwSlate] at (31,50) {--};
\draw[fwarrow,fwBrand] (52,55) -- node[fwlabel,right,text width=26mm,align=left]{\texttt{get} walks down from the top; the first valid value wins} (52,-3);
\node[font=\scriptsize\ttfamily,text=fwInk,anchor=south] at (0,56) {notes.editor.fontSize};
\end{tikzpicture}
```

## Declaring settings

<Source path="src/fanwit/settings/define.ts" from="export const s = {" to="};" />

`s.number(15, { min: 10, max: 32, widget: "slider", unit: "px" })` is a whole setting: a type, a default and metadata. `defineSettings("notes", {...})` gives each key its namespace (`notes.editor.fontSize`) and its order, and a module contributes the result. `checkSetting` validates a value against its definition, returning a message rather than throwing, because one bad value in a file must not stop the others from loading.

<Callout kind="new" title="New here: readonly arrays and copying them">

`s.enum<T extends string>(def: T, options: readonly T[])` accepts a `readonly` array, so you can pass a constant list (`as const`); `options: [...options]` copies it into a normal array for the definition. `T extends string` makes TypeScript check that the default is one of the options.

</Callout>

<Source path="src/fanwit/settings/define.ts" />

## Resolving values

<Source path="src/fanwit/settings/settings.svelte.ts" from="	get<T = unknown>(key: string): T {" to="	}" />

`get` walks the layers from the top (`cli`) down, skipping layers with no value and values that fail their definition, and returns the first that is left. It reads `version` first, so a component that shows a setting updates when it changes, by any route: the Settings window, the command line, or you editing the file.

`inspect(key)` returns every layer's value and which one won: the Settings window uses it to show *"Overridden by this vault"* next to a value.

### Writing values

<Source path="src/fanwit/settings/settings.svelte.ts" from="	async set(key: string" until="	reset(key: string" />

`set` checks the scope is allowed and the value valid, then writes to the right layer: a window value in memory, a global or vault value into its `TomlFile` (the live TOML file from the last chapter), so the change lands in `settings.toml` with your comments intact. `reset` is `set` with `undefined`, which removes the key and any table it leaves empty.

<Callout kind="new" title="New here: structuredClone">

`setPath` starts with `structuredClone(obj)`, a built-in deep copy (objects, arrays, dates, maps, nested any depth). The new value is a fresh object, so the file's previous value is never modified in place, which matters because Svelte and the TOML file compare old and new.

</Callout>

### The file, the environment and secrets

- **The file.** `settings.toml` is validated as it loads: unknown keys are kept (they may belong to a plugin that is switched off) but flagged as warnings; invalid values are flagged and skipped. The Problems view will list them with their line numbers.
- **The environment.** `FANWIT_NOTES_EDITOR_FONTSIZE=18` is matched to `notes.editor.fontSize` and coerced to its type, the same as `--set notes.editor.fontSize=18`; both go into the `cli` layer, which wins over everything.
- **Secrets.** `s.secret()` settings (an API token) are never written to TOML: they go to the OS keychain through the host (in Rust, the `keyring` crate), and are cached in memory for synchronous `get`.

<Source path="src/fanwit/settings/settings.svelte.ts" />

## A schema for your editor

`settingsJsonSchema(defs)` turns the definitions into a JSON Schema, which `pnpm fw schema` writes to `schemas/settings.schema.json`. With the Even Better TOML extension in VS Code, editing `settings.toml` then completes keys, shows descriptions on hover and underlines a font size of 99. A namespace the app defines rejects unknown keys (typos); unknown namespaces stay open for plugins.

<Source path="src/fanwit/settings/schema.ts" />

## Checkpoint

<Source path="src/fanwit/settings/settings.test.ts" />

```sh
pnpm vitest run src/fanwit/settings/settings
```

`schema.test.ts` checks that the committed schema matches every registered setting, including the core ones; it passes once the core module exists, in stage 5.

<Check question="settings.toml says notes.editor.wrap = &quot;nope&quot;, which is not an allowed value. What does get(&quot;notes.editor.wrap&quot;) return?" options={['"nope"', "The value from the next layer down, here the default, with a warning listed for the file", "undefined"]} answer={1}>

Invalid values are skipped, so the next layer applies, and the file's diagnostics say which line is wrong. A typo can never break the app.

</Check>
