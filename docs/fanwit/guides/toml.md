---
title: TOML files
section: Guides
order: 17
summary: Every file the app keeps live, where it lives, and why it is TOML.
---
# TOML files

State is data. Everything a user can configure lives in a TOML file they can read, edit, back up and share, and every file is live in both directions: edit it and the app follows, change the app and it rewrites the file with your comments kept.

<Callout kind="why">

TOML is readable by people (unlike JSON, it has comments and no trailing comma traps), strict enough to validate, and diff friendly. Files rather than a database mean the user owns their configuration: they can put it under version control, copy it to another machine, or fix a broken layout in a text editor. "Live in both directions" removes the usual gap where a config file and the running app disagree.

</Callout>

| File | Where | Holds |
|---|---|---|
| `fanwit.app.toml` | repository | App identity |
| `workspace.toml` | app data or vault | The layout |
| `settings.toml` | app config or vault | Settings |
| `keys.toml` | app config | Keybindings |
| `menus.toml` | app config | Menu patches |
| `commands.toml` | app config | User commands and macros |
| `windows.toml` | app config | Window state by identity |
| `plugin.toml` | plugin folder | Plugin manifest |

Each has a generated reference with every key, type and default (see **TOML files** under Reference). `pnpm fw schema` emits JSON schemas (and `.taplo.toml`, which maps them to `workspace.toml`, `keys.toml`, `menus.toml` and `settings.toml`), so editors like VS Code with Taplo give completion and validation. The settings schema is built from the registered definitions, so it knows every type, range, enum and default, and flags unknown keys in a namespace the app defines; a test fails when it falls behind. Keys, menus and layout entries reject unknown fields too.

```fanwit-run
layout.openToml
```

<Callout kind="under-the-hood">

Each file is a `TomlFile`: it validates on load, debounces writes (about 150 ms), and watches the disk. An invalid edit keeps the last good value and reports the problem with a line number, so a typo never takes the app down. Writes go through `toml_edit`, which preserves comments and formatting: linked into the desktop app, and compiled to WebAssembly (`packages/toml-merge`) for the web host, so both behave the same.

</Callout>

## Pitfalls

- **Editing while the app writes.** Both directions are live, and the last save wins. Save your edit, and the app picks it up.
- **Copying whole files to customise.** For menus and keys, add your changes (patches, bindings); don't copy the defaults, or you stop receiving updates to them.
