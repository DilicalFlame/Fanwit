# Vaults

Many desktop apps work on "a project": a folder of your files plus the app's own notes about them. FaNWiT calls it a **vault**, after Obsidian. This chapter builds `data/vault.svelte.ts`, the service that opens, closes, sandboxes and indexes one.

<Callout kind="why">

Your files must stay yours: plain files in a folder you picked, readable without the app, easy to back up and sync. The app's own state about them (settings for this project, the layout, an index, plugin data) must live next to them, so it moves with the folder, but separate from them, so it never gets in the way. And two windows, or two copies of the app, must never write to the same vault at once (Sections 12.3 and 12.4).

</Callout>

## Anatomy

<FileTree>

- my-notes/ (the folder you picked)
  - Daily/
  - Projects/
  - Welcome.md
  - .fanwit/ (the app's folder, named after your app's slug)
    - vault.toml (identity: a uuid, so a moved or renamed vault is still recognised)
    - settings.toml (vault settings: override your user settings here)
    - workspace.toml (this vault's layout)
    - data/ (key value storage, databases, index.db)
    - lock (held by the window that owns the vault)
    - .gitignore (keeps the volatile files out of git)

</FileTree>

## Opening a vault

<Source path="src/fanwit/data/vault.svelte.ts" from="	async open(path?: string" until="	/** onVaultFile:" />

In order:

1. No path given: ask with the folder picker.
2. A non-main window (Settings, the Vault Manager) never opens a vault itself: it asks its main window to, over an app-scoped event, and waits for the answer. One main window owns one vault.
3. Allow the folder in the host's sandbox (on the desktop, the Rust core now accepts paths inside it), and create `.fanwit/` and `data/`.
4. Read `vault.toml`, or create it with a fresh uuid.
5. Take the **lock**. If another window of this app has the vault, the host has already focused that window, and this open is cancelled. If another copy of the app has it, ask whether to open it read only.
6. Close the current vault (which may be vetoed), then make this one current: set context keys (`vault.open`, `vault.name`, `vault.readonly`), point storage and settings at the vault's folder, announce it, index it, and fire the `onVault` activation event so vault features load.

<Callout kind="new" title="New here: sequencing with await, and cancellation as an error">

Each step `await`s the one before, so a failure stops everything after it, and the error explains where. A user cancelling (closing the picker, saying no to read only) is a `FanwitError("CANCELLED")`: callers handle it like any error, and `notify.error` deliberately shows nothing for it.

</Callout>

## A file system that cannot escape

<Source path="src/fanwit/data/vault.svelte.ts" from="	private abs(rel: string)" to="	}" />

`vault.fs` takes paths **relative** to the vault root. `abs` refuses any path with a `..` segment, so code (and plugins) can only reach files inside. On the desktop, the Rust sandbox checks the resolved path again; on the web, the vault is a handle the browser scoped to that folder. Two checks, by design.

`list` also hides ignored paths: `.git`, `node_modules`, `.trash`, the app's own folder, and anything in a `.fanwitignore` file, written like `.gitignore`. `trash` moves to the OS trash where the host has one, and otherwise to the vault's own `.trash` folder, numbering duplicates, so "move to trash" never means "delete".

<Source path="src/fanwit/data/vault.svelte.ts" from="export function globToRegExp" to="}" />

<Callout kind="new" title="New here: translating globs character by character">

`globToRegExp` walks the glob once and translates each piece: `**/` to "any folders, or none", `*` to "anything but a slash", `?` to one character, and every other character escaped. Doing it in one pass matters: replacing `**` first and then `*` with string replacements would rewrite the output of the first replacement, a classic bug that `glob.test.ts` pins.

</Callout>

## Indexes

<Source path="src/fanwit/data/vault.svelte.ts" from="	readonly index = {" until="	private indexWatch" />

An **indexer** is a glob and a function that extracts data from a file: the links in a note, its tags, its front matter. FaNWiT runs every indexer over the vault when it opens (as a background job, with progress when the vault is large), stores the results in `index.db` in the vault's data folder, and updates single files as the watcher reports changes. `vault.index.query("links", "$.target", "b.md")` then answers *"which notes link to b.md?"* with one SQL query, using SQLite's JSON functions.

<Callout kind="new" title="New here: NonNullable and ReturnType together">

`db: NonNullable<ReturnType<VaultService["indexDb"]>>` is "whatever `indexDb` returns, minus `null`". `indexDb()` returns `null` when no vault is open, but `indexFile` is only ever called with a real database, and the type says so without writing the database type out.

</Callout>

<Source path="src/fanwit/data/vault.svelte.ts" />

## Checkpoint

The repository's tests for the glob translation and the trash fallback:

<Source path="src/fanwit/data/glob.test.ts" />

<Source path="src/fanwit/data/trash.test.ts" />

```sh
pnpm vitest run src/fanwit/data
```

Note how `trash.test.ts` builds a fake kernel with only the parts the vault needs (`as unknown as Kernel`): services depend on `k.sys`, which boot fills in for real.

<Check question="A plugin calls vault.fs.readText(&quot;../../.ssh/id_rsa&quot;). What happens?" options={["It reads the file", "abs refuses any path with a .. segment; on the desktop the Rust sandbox would refuse it too", "It reads the file only on the web"]} answer={1}>

Vault paths are relative and may not climb out. The Rust core checks every resolved path against the allowed folders as a second, independent wall.

</Check>
