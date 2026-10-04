---
title: Vaults
section: Guides
order: 10
summary: A folder the user chose, holding their files and the app's per project state.
---
# Vaults

A <Term name="vault" /> is a folder the user picked. Their files stay ordinary files in it. Next to them, a `.fanwit` folder holds the app's state for that project: `vault.toml` (identity), settings, the workspace layout, keys, menus, plugins and data. A generated `.gitignore` keeps volatile files out of version control.

<Callout kind="why">

Apps that keep user data in a hidden database lock the user in: their notes can't be backed up with their other files, synced with the tools they already use, or opened in another editor. A vault keeps the data in plain files in a folder the user controls, and keeps the app's per project state beside it, so a project carries its layout and settings to another machine. The app reaches only the folders the user chose: on the desktop, Rust checks every path.

</Callout>

## Working with files

```ts
await ctx.vault.fs.write("Daily/2026-10-04.md", "# Today\n");
const text = await ctx.vault.fs.readText("Daily/2026-10-04.md");
```

- Paths through `ctx.vault.fs` are relative to the vault, and paths that escape it are rejected (in Rust on the desktop).
- `.fanwitignore` (gitignore syntax) hides folders from listing and watching.
- On the web, a vault is a folder in the browser's private storage, or a real folder through the File System Access API where the browser supports it.

## One vault, one window

A vault lives in one window: opening it again brings that window to the front. An OS file lock, released even if the app crashes, keeps another app instance from writing to it; that instance may open it read only.

```fanwit-run
vault.switch
```

<Callout kind="under-the-hood">

Settings, the workspace and data can each be per vault or global (`data` in `app.config.ts`). The template uses "hybrid": it works without a vault, and opening one adds project scoped state on top. Child windows open with their opener's vault, so they see the same workspace.

</Callout>

## Pitfalls

- **Absolute paths.** Store paths relative to the vault, so they survive moving or syncing it.
- **Assuming a vault is open.** In hybrid mode it may not be. Guard commands with `when: "vault.open"`.
- **Writing the user's files on a timer.** Write in response to the user, and debounce. Their sync tools see every write.
