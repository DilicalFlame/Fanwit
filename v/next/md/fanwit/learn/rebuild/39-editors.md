# Settings, keys, menus and themes

FaNWiT keeps the user's choices in TOML files: `settings.toml`, `keys.toml`, `menus.toml` and themes. Each one can be edited by hand. Each also has an editor in the app, and every editor writes the same file you could have written yourself. This chapter builds those four editors.

<Callout kind="why">

A settings window drawn by hand goes out of date the day someone adds a setting. These editors are **generated**. The settings window draws whatever chapter 16's registry holds, the shortcut editor lists every command, and the menu editor lists every location. A module's new setting, command or menu therefore appears in the right editor with no UI work. And because the editors write the TOML files through the same services, there is one source of truth: hand edits show up in the editor, and editor changes show up in the file.

</Callout>

## The settings window

<Source path="src/fanwit/views/settings/Settings.svelte" from="	function matches(" to="	}" />

The window is a category list, a search box and rows. Each row has a title, a description, a control, and a bar in the margin when the value differs from its default. Search accepts filters as well as words:

- `@modified` shows what you changed, in the scope you are looking at;
- `@vault` shows settings that can be set per vault;
- `@experimental`, `@plugin:<id>` and `@id:<key prefix>` narrow further;
- plain words match titles, descriptions (translated too), keys and values.

Scope tabs switch between **global**, **vault** and **window** (chapter 16's layers). The gear menu on a row resets it, copies its id or its TOML line, or shows **all layers**, the answer to "where does this value come from?". A setting marked `restart: true` offers a restart after it changes, rather than pretending it applied.

Each control is chosen from the setting's type, or from its `widget` override:

<Source path="src/fanwit/views/settings/SettingControl.svelte" from="<script lang=" />

Booleans become switches. Enums become a segmented control for up to three options, and a select beyond that. Numbers with a range can be sliders. `path` gets a Browse button, `secret` a password field whose value goes to the OS keychain (chapter 31), and `json` a small editor that refuses invalid JSON instead of saving it.

<Callout kind="new" title="New here: role=switch and role=radiogroup">

A switch is a `<button role="switch" aria-checked>`. It reads as "on, off" rather than "pressed, not pressed", and Space toggles it like any button. A segmented control is a `radiogroup` of `radio` buttons with `aria-checked`. Both are plain buttons with ARIA roles, so they need no special keyboard code: Tab reaches them and Enter or Space activates them. [ARIA Authoring Practices: switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)

</Callout>

<Source path="src/fanwit/views/settings/Settings.svelte" />

## The keyboard shortcuts editor

The editor is a table of every command with its bindings, its `when` clause and where the binding comes from (core, a module, a plugin, or you). Search works like settings, with `@source:user`, `@conflict` and `@unbound`, and **Record** filters by pressing keys instead of typing their names.

<Source path="src/fanwit/views/settings/KeybindingsEditor.svelte" from="	function startRecording" to="	}" />

Recording uses chapter 11's `keys.recorder` hook. While it is set, the keyboard service hands each key to the editor instead of running bindings. A step is committed after a 700 ms pause, or at once when it cannot start a chord (anything but Ctrl+K), so `Ctrl+K Ctrl+S` can be recorded as two steps. Escape cancels at any point.

<Source path="src/fanwit/views/settings/KeybindingsEditor.svelte" from="	function commit(command" to="	}" />

If the new key is already bound, a banner names the other commands and offers **Keep both** (the `when` clauses decide), **Replace** (writes `-command` entries that remove the others for this key), or **Cancel**. A user binding also removes the command's default bindings, so "change the shortcut" never quietly leaves the old one working. All of it is written to `keys.toml` as `[[bind]]` entries, and the key service reloads them at once (chapter 11).

<Source path="src/fanwit/views/settings/KeybindingsEditor.svelte" />

Writing this chapter's test found two bugs here. Escape was only a cancel before the first key: after it, Escape became the next step of the chord, so the binding was saved as "Alt+Shift+9, Esc, …". And editing a `when` clause used `window.prompt`, which is unthemed and does nothing in some webviews. It now asks through a palette step (chapter 23).

## The context menu editor

The menu editor shows every location, grouped by owner (core, modules, plugins, yours). For the selected location, it shows the items with their origin and a live **preview**: the real `MenuSurface` (chapter 29), drawn inert so clicks don't run anything, against a sample target and simulated context keys. You can see how the menu looks "with two items selected in developer mode" without arranging that.

<Source path="src/fanwit/views/menu-editor/MenuEditor.svelte" from="	function edit(field" to="	}" />

The editor never changes a contribution. It writes **patches** (chapter 22): renaming a core item adds a `rename` patch, and hiding one adds a `hide` patch. An item you inserted yourself is different, since it is a patch already: editing it rewrites that `insert` patch. The commands of contributed items cannot be changed, only hidden and replaced with your own item, so an update to a module can never be silently redirected. The editor keeps its own undo and redo stacks of patch lists, can import patches from TOML, and shows the patch file it will write.

<Source path="src/fanwit/views/menu-editor/MenuEditor.svelte" />

## Theme Studio

<Source path="src/fanwit/views/ThemeStudio.svelte" from="	const tokens = $derived" to="	});" />

Theme Studio edits a theme on top of an existing one (`extends`, chapter 18), and previews **the whole app** while you edit. It sets `themes.preview` and re-applies, so the real title bar, tabs and status bar change under your cursor, and on close the preview is dropped. It can:

- **generate** both modes from one brand colour (`paletteFromBrand`, chapter 18's colour maths);
- show a **WCAG badge** for every text and background pair (AA, AAA or fail), with one click fixes that nudge the text colour until it passes;
- **import** a shadcn CSS block;
- **save** to `<config>/themes/<id>/theme.toml`, where the boot sequence loads user themes (chapter 30);
- **export** as TOML, CSS, or a data only theme plugin ready to share.

<Source path="src/fanwit/views/ThemeStudio.svelte" />

## Checkpoint

```sh
pnpm exec playwright test e2e/flows.test.ts --project app -g "settings window|keyboard editor"
```

The settings test switches to dark mode from the Appearance page and finds it with `@modified`. The keyboard test records a shortcut, checks that Escape cancels a second recording, and uses the new shortcut at once:

<Source path="e2e/flows.test.ts" from="recorded in the keyboard editor" />

<Check question="You hide the Copy path item in the tab menu with the menu editor. The next app update renames that item's command. What happens?" options={["The item comes back, because the contribution changed", "The item stays hidden: the patch refers to the item id, and contributions are never edited", "The update fails"]} answer={1}>

The editor wrote `{ op = "hide", item = "tab.copyPath" }` to `menus.toml`. Patches refer to item ids, which are stable across updates, and they are applied over whatever the contributions are now.

</Check>
