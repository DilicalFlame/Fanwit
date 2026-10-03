---
title: Plugins
section: Guides
order: 13
---
# Plugins

A plugin is a module that arrives at runtime with a manifest and permissions.

## Manifest

```toml
id = "word-count"
name = "Word Count"
version = "1.2.0"
entry = "main.js"
isolation = "worker"
activation = ["onStartupFinished"]
permissions = ["vault.read", "statusbar"]
```

## Isolation

- **worker**: a real boundary. The plugin runs in a Web Worker; every ctx call is checked against its permissions.
- **none**: same realm, full UI power; permissions are a contract, not a sandbox, and users must allow community code plugins.
- **data only**: no `entry`; themes, keymaps, presets. Always safe.

Start with `--safe-mode` to disable code plugins for one session. Develop with `pnpm fw plugin new <id>` and package with `pnpm fw plugin pack <id>`.

```fanwit-run
plugins.open
```
