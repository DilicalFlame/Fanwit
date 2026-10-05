# Files and editors

From here on, the rebuild adds **features**. Each is a module, a view, or both, and each uses only the APIs built so far. That is the test of the core: if a feature needs to reach around it, the core is missing something. This chapter builds what you use to work with files: the explorer and its commands, the text and TOML editors, search, the outline, properties and quick capture.

<Callout kind="why">

Files are the first feature because they exercise almost everything. Opening a file is a layout action, renaming one is an undoable command with a menu entry, a keyboard shortcut and a palette entry, a dirty editor vetoes quitting, and the tree follows changes made in another program through the watcher. If these feel right, the core is right.

</Callout>

## File commands

The explorer's view does not rename or delete anything itself. The commands do, in a small module of their own:

<Source path="src/fanwit/core/explorer.ts" from="	activate(ctx) {" />

- **`explorer.open`** asks chapter 24's `viewForPath` which view opens the file's extension, and opens it there.
- **`explorer.newFile`** adds `.md` when no extension is given, writes a heading, opens it, and returns an **undo record** (chapter 10): undo moves the new file to the trash.
- **`explorer.rename`** refuses to overwrite, and moves the file together with every open tab showing it. Undo and redo do the same move the other way, so tabs never point at a file that is gone. Rename with F2, press Ctrl+Z, and the old name comes back in the tree and on the tab.
- **`explorer.delete`** asks first (a `warning` dialog, chapter 29), closes tabs showing the file or anything inside the folder, and moves it to the trash, never deleting outright.
- **`capture.append`** adds a timestamped line to `Inbox.md`. It is `cli: true`, so `fanwit-cli capture append --text "call Ana"` works from a terminal (chapter 35).

The module also contributes the `explorer/item` and `explorer/empty` menus. Every item passes `${target.path}` or `${target.dir}`, so the commands receive the file that was right clicked (chapter 22).

<Source path="src/fanwit/core/explorer.ts" />

## The explorer

<Source path="src/fanwit/views/Explorer.svelte" from="	const visible = $derived.by" to="	});" />

The tree is a flat list of every file in the vault (`vault.fs.list("", { recursive: true })`), turned into the visible rows by `visible`: children grouped by parent, folders first, names compared with `numeric: true` (so `note 2` comes before `note 10`), and only open folders walked into. Expanding a folder just changes `open`, and `$derived.by` recomputes the rows. The watcher (`vault.fs.watch("**")`) refreshes the list when files change on disk, from this app or any other.

The ARIA **tree** pattern makes it keyboard complete:

- Up and Down move between rows. Right opens a folder or moves into it, and Left closes it or moves to its parent.
- Enter opens a file in a normal tab, and a single click opens it as a **preview** tab (chapter 19).
- F2 renames inline: the name is selected without its extension, as in VS Code. Delete moves to the trash.
- Only the selected row has `tabindex="0"` (a **roving tabindex**), so Tab moves past the tree instead of through every row.

Drag a row onto a folder to move it, which runs `explorer.rename`, and so is undoable too. Each row sets the context keys `resource.path`, `resource.ext` and `explorer.isDir` with `use:ctxkeys` (chapter 8), which is what lets **Open** be hidden for folders in the context menu.

<Callout kind="new" title="New here: HTML drag and drop with a custom type, and the comma operator in handlers">

`e.dataTransfer.setData("text/x-fw-path", n.path)` puts data on a drag under a **custom type**. Dropping files from the OS, or text from another app, carries other types, so `getData("text/x-fw-path")` only finds rows dragged from this tree. A drop target must call `preventDefault()` in `dragover`, or the browser refuses the drop.

`(e.preventDefault(), go(i + 1))` evaluates both expressions in order: a compact way to write two statements where one expression is expected.

</Callout>

<Source path="src/fanwit/views/Explorer.svelte" />

## The text editor

<Source path="src/fanwit/views/TextEditor.svelte" from="<script lang=" />

A small file, but every rule of a well behaved editor is in it:

- **Dirty tracking** is one `$derived`: the text differs from what was last loaded or saved. It is reported to the layout (`layout.dirty[paneId]`), which draws the dot on the tab and asks before closing it (chapters 20 and 25).
- **A dirty editor vetoes quitting** through `lifecycle.onWillShutdown` (chapter 12), with a reason that names the file.
- **Saving** (Ctrl+S) writes, then pushes an undo step that restores the previous contents. Saving by mistake is reversible too.
- **Following the outline.** It listens for `editor:reveal` and scrolls to the line, which is how clicking a heading in the outline or a search result jumps there.
- **Read only vaults** (open in another instance, chapter 32) show a banner and disable editing.
- **Errors** (a missing file, a permission problem) show `ErrorCard` with a retry button.

`CodeArea` is the editing surface: a textarea with a line number gutter that scrolls with it, Tab inserting a tab, and diagnostic markers on lines:

<Source path="src/fanwit/views/CodeArea.svelte" from="<script lang=" />

<Callout kind="new" title="New here: $bindable and export function in a component">

`value = $bindable("")` declares a prop the parent can bind to: `<CodeArea bind:value={text} />` keeps `text` and the textarea's contents in sync both ways. Without `$bindable`, `bind:value` on the component is an error, since Svelte 5 makes two-way binding opt-in.

`export function reveal(line)` inside a component's script makes it callable from outside: the parent keeps a reference with `bind:this={area}` and calls `area.reveal(12)`.

</Callout>

The `ponytail:` comment in `CodeArea` is honest about a limit: a textarea has no syntax highlighting or completion. The manual's playgrounds already use CodeMirror (chapter 44), and swapping it in here is the upgrade path when an app needs it.

## The TOML editor

Every live TOML file (workspace, settings, keys, menus, commands) can be edited inside the app:

<Source path="src/fanwit/views/TomlEditor.svelte" />

It edits through the file's `TomlFile` (chapter 15), so a save is validated, and an invalid file keeps the previous good state while the problems show as markers in the gutter. If the file changes on disk while you have unsaved edits, a bar offers to reload or keep yours, instead of silently overwriting either.

## Search, outline, properties

<Source path="src/fanwit/views/Search.svelte" />

Search reads each text file and lists matching lines, at most 20 per file. Results appear **as they are found**, not when the whole vault is done, and a new query cancels the old one with the sequence number trick from chapter 23. Clicking a result opens the file as a preview and reveals the line.

<Source path="src/fanwit/views/Outline.svelte" />

<Source path="src/fanwit/views/Properties.svelte" />

The outline and properties views follow `layout.activeDocument` (chapter 20): the last focused pane in the **main** area. Clicking in the outline itself therefore does not make it outline itself.

## Quick capture

<Source path="src/fanwit/views/QuickCapture.svelte" from="<script lang=" />

Ctrl+Alt+Space, from anywhere in the OS, opens a small `palette` window at the pointer (chapters 21 and 34). Type a thought, press Enter, and it is appended to `Inbox.md` through `capture.append`. The window closes when it loses focus. The whole feature is a view, a window kind, a global keybinding and a command, with no new machinery.

## Checkpoint

```sh
pnpm exec playwright test e2e/flows.test.ts --project app -g "explorer"
pnpm exec playwright test src/app/modules/notes --project app
```

The explorer test creates a vault, creates a file, renames it with F2, checks that the tab followed, and undoes the rename:

<Source path="e2e/flows.test.ts" from="renames with F2" />

<Check question="You rename a file with F2 while it is open in a tab, then press Ctrl+Z. What happens?" options={["Only the file is renamed back; the tab still shows the new name", "The undo record moves the file back and retargets open tabs; the watcher refreshes the tree", "Nothing; renames cannot be undone"]} answer={1}>

`explorer.rename` returns an undo record, so the command pipeline records it like any other undoable command (chapter 10). Its undo runs the same `move` in reverse, renaming the file and updating each open tab's `path`. The watcher sees the change on disk, so the tree follows.

Writing this chapter's test found the version before that: undo renamed the file back, but left the tab pointing at the new name, a file that no longer existed. The test now checks the tab too.

</Check>
