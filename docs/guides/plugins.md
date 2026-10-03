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

## User scripts

For one off automation, drop a `.js` file in `.fanwit/scripts/` (in a vault) or `scripts/` in the
config folder. Each script is a tiny worker isolated plugin; header comments stand in for `plugin.toml`:

```js
// @command scripts.stats Show vault stats
// @key ctrl+alt+s scripts.stats
// @permission vault.read
export default (ctx) => {
	ctx.commands.handle("scripts.stats", async () => {
		const files = await ctx.vault.list("", { recursive: true });
		ctx.notify.toast(`${files.length} files`);
	});
};
```

Scripts show up in the Plugin Manager as "Script: name" and stay off until you enable them, so a
vault you receive from someone else cannot run code on open. Uninstall removes only that file.
