---
title: Vaults
section: Guides
order: 10
---
# Vaults

A vault is a folder the user picked. Its `.fanwit` folder holds `vault.toml` (identity), settings, workspace, keys, menus, plugins and data. A generated `.gitignore` keeps volatile files out of version control.

- Paths through `ctx.vault.fs` are relative; escapes are rejected (in Rust on the desktop).
- A vault lives in one window: opening it again brings that window to the front. An OS file lock (released even on a crash) keeps another app instance from writing it; that one may open it read only.
- `.fanwitignore` (gitignore syntax) hides folders from listing and watching.

```fanwit-run
vault.switch
```
