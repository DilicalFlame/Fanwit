---
title: Vaults
section: Guides
order: 10
---
# Vaults

A vault is a folder the user picked. Its `.fanwit` folder holds `vault.toml` (identity), settings, workspace, keys, menus, plugins and data. A generated `.gitignore` keeps volatile files out of version control.

- Paths through `ctx.vault.fs` are relative; escapes are rejected (in Rust on the desktop).
- A lock file with a heartbeat keeps two instances from writing the same vault.
- `.fanwitignore` (gitignore syntax) hides folders from listing and watching.

```fanwit-run
vault.switch
```
