# Storage, live TOML files and the database

Three ways to keep data, for three kinds of data:

- **Storage** (`data/storage.svelte.ts`): small values the app remembers for you, a panel's width, the last search, a list of recent vaults. You never edit these by hand.
- **TOML files** (`data/toml-file.svelte.ts`): state that is yours to read and change, settings, keybindings, menus, layouts. The app writes them and watches them, and an edit you make in another editor flows straight back in.
- **The database** (`data/db.ts`): structured data in SQLite, an index of a vault's links, a plugin's records.

<Callout kind="why">

"Where do I keep this?" is a question every feature asks, and wrong answers are expensive: a panel width in a file users read is noise, a setting hidden in a database cannot be backed up or fixed by hand, and per-vault data in a global store leaks between projects. The specification's answer (Section 12.5) is one API per kind of data, with explicit **scopes**, so the answer is a choice in a parameter, not a new storage system per feature.

</Callout>

## Storage in five scopes

<Source path="src/fanwit/data/storage.svelte.ts" from=" *   memory   lost on reload" until=" *   vault    <vault>" />

Every scope is a `KvStore`, the same four methods. Behind them: a `Map` for memory, `sessionStorage` for session, and for global and vault data, either SQLite (`state.db`, on the desktop) or a JSON file (`state.json`, on the web and in tests). Keys are namespaced by owner (`notes/sort`), so modules never collide, and `window` keys add the window's identity, so two windows of the same kind can remember different things.

<Source path="src/fanwit/data/storage.svelte.ts" from="class SqlKv implements KvStore" to="}" />

<Callout kind="new" title="New here: UPSERT and LIKE with ESCAPE">

`INSERT ... ON CONFLICT(key) DO UPDATE SET value = excluded.value` is an **upsert**: insert the row, or update it if the key exists, in one statement (`excluded` is the row that failed to insert). `LIKE ? ESCAPE '\'` finds keys by prefix; the prefix's own `%`, `_` and `\` are escaped first so a key containing them is matched literally.

</Callout>

### persisted: state that remembers itself

<Source path="src/fanwit/data/storage.svelte.ts" from="export function createPersisted" />

```ts
const width = ctx.persisted("sidebarWidth", 280);
width.value = 320; // saved a moment later
```

`createPersisted` returns an object with a `value` that is reactive state: bind it to a slider and the slider moves; set it and it is saved, debounced. It starts with the initial value and switches to the stored one when it loads (`loaded` says when). This is the one-line answer to "where do I keep this?".

<Callout kind="new" title="New here: getters and setters, and runes in plain functions">

`get value() { ... }` and `set value(v) { ... }` make `width.value` look like a property while running code on read and write. The `$state` variables inside `createPersisted` are local to the call, and the getter reads them, so a component that reads `width.value` subscribes to them. Runes work in any function in a `.svelte.ts` file, not just in components and classes.

</Callout>

<Source path="src/fanwit/data/storage.svelte.ts" />

## Live TOML files

A `TomlFile` is one file the app both writes and watches, the heart of FaNWiT's "state is data" principle:

<Source path="src/fanwit/data/toml-file.svelte.ts" from="	async load(): Promise<T>" until="	/** Start watching" />

- **Load**: read it; if it is missing, write the template (a header comment explaining the file) first.
- **Accept**: parse the text. If it parses and the optional `validate` finds no errors, it becomes the value; if not, the **last good value stays** and the problems become `diagnostics` (with line numbers), so a typo in your file never breaks the running app.
- **Write**: `set(value)` updates at once and writes 150 ms later through `writeToml`, the format-preserving merge from the foundations stage.
- **Watch**: a change on disk that is not the app's own write is accepted and announced on `onDidChangeFromDisk`.

<Source path="src/fanwit/data/toml-file.svelte.ts" from="	async watch(): Promise<void>" to="	}" />

The trick is **echo suppression**: the app remembers the exact text it last wrote, and when the watcher reports a change whose text equals it, that change is the app hearing its own write, and is ignored. Without it, every save would be read back as an external edit.

<Callout kind="new" title="New here: $state.raw">

`value = $state.raw<T>({} as T)` is state that is **not** deeply reactive: Svelte tracks when `value` is replaced, but not changes inside it. A parsed TOML document is replaced as a whole on every change, so deep tracking would be wasted work. Use `$state.raw` for large values you always replace.

</Callout>

<Source path="src/fanwit/data/toml-file.svelte.ts" />

## The database

### Queries that cannot be injected

<Source path="src/fanwit/data/db.ts" from="export function sql(strings: TemplateStringsArray" to="}" />

```ts
db.query(sql`SELECT * FROM notes__links WHERE target = ${path}`);
```

`sql` is a **tagged template**: the function receives the literal parts and the values separately, and turns each value into a `?` parameter. A value can never become SQL text, however it is spelled. A nested `sql` fragment is spliced in with its own parameters, and `sql.raw` is the explicit escape hatch for identifiers you control (a table name built from your module id), never for user input.

<Callout kind="new" title="New here: tagged templates">

``sql`... ${x} ...` `` calls `sql(strings, x)`, where `strings` holds the text around each `${}`. The function decides what to do with them; here, it builds a query and a parameter list instead of a string. Styled components and GraphQL clients use the same feature.

</Callout>

### SqlHandle: serial statements, transactions, migrations

<Source path="src/fanwit/data/db.ts" from="	async migrate(list: Migration[])" to="	}" />

- `serial` queues statements from one window so a transaction is never interleaved with another call.
- `transaction(fn)` collects statements and sends them as one `batch`, which the host commits atomically.
- `migrate(list)` brings a module's tables up to date: each migration runs once, in version order, recorded with a **checksum** in `_fanwit_migrations`. Editing a migration that already ran is refused (add a new one instead), and a database newer than the app is refused rather than damaged.

<Callout kind="new" title="New here: crypto.subtle and padStart">

`crypto.subtle.digest("SHA-256", bytes)` hashes data with the browser's built-in cryptography, returning an `ArrayBuffer`. `[...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")` turns its first eight bytes into hex text: `toString(16)` writes a number in base 16 and `padStart(2, "0")` makes `"a"` into `"0a"`.

</Callout>

`collection<T>(name)` stores JSON documents in a table `<owner>__<name>`, for data that has no fixed columns; `find({ tag: "x" })` filters with SQLite's `json_extract`. Every module owns the table prefix `<id>__`, and for runtime plugins the host enforces it (the authorizer from the browser host chapter, and the same check in Rust).

<Source path="src/fanwit/data/db.ts" />

## Checkpoint

Add `src/fanwit/data/data.test.ts`:

<Source path="src/fanwit/data/data.test.ts" />

```sh
pnpm vitest run src/fanwit/data
```

Writing this very test found a real bug: a file holding only a header comment (every template) got its first keys written above the comment. The fix is in `packages/toml-merge`, with its own test, and the WebAssembly file was rebuilt. Tests earn their keep.

<Check question="You edit settings.toml in another editor and make a typo. What does the running app do?" options={["Crashes on the next read", "Keeps the last good settings, and reports the error with its line number", "Overwrites your file with the old version"]} answer={1}>

`accept` only adopts text that parses and validates. Otherwise the previous value stays in force and `diagnostics` describes the problem, which the Problems view and a notification show.

</Check>
