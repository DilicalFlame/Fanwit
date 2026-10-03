---
title: TOML files
section: Guides
order: 17
---
# TOML files

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

All are live, validated, and written with comments preserved. `pnpm fw schema` emits JSON schemas for editor completion.

```fanwit-run
layout.openToml
```
