---
title: SQLite in Rust
section: "Rebuild: the Rust core"
order: 3
summary: The desktop side of ctx.db. Bundled SQLite with write ahead logging, one connection per file shared by every window, queries moved off Tauri's command threads, JSON values in and out, and an authorizer that keeps a plugin inside its own tables.
---
# SQLite in Rust

Chapter 15 built `ctx.db`: module scoped databases, collections and the `sql` template. In the browser, SQLite runs as WebAssembly in a worker. On the desktop, it is the real SQLite, inside the Rust process, reached through four commands: `fw_db_open`, `fw_db_exec`, `fw_db_query` and `fw_db_batch`. This chapter builds them.

<Callout kind="why">

Running SQLite in Rust, not in the webview, gives the desktop app three things. All windows share one connection per file, so there are no lock fights between windows. A query never blocks the UI thread. And Rust can enforce rules a plugin cannot get around, because the plugin's code never holds the connection, only a handle number.

</Callout>

<Source path="src-tauri/src/fanwit/db.rs" from="pub fn fw_db_open" to="}" />

**Opening** checks the path with the sandbox (chapter 32), then returns a small number, the **handle**, that later calls refer to. A file that is already open returns its existing handle, so every window and module shares one connection per database file. Each new connection is configured once:

- `journal_mode=WAL` (write ahead logging) lets readers keep reading while a write is in progress. It is the right mode for an app that reads constantly and writes in small bursts.
- `synchronous=NORMAL` is safe in WAL mode and much faster than the default, which syncs to disk on every commit.
- `foreign_keys=ON` makes SQLite enforce `REFERENCES` constraints, which it skips unless asked.
- A **busy timeout** of 5 seconds makes a write wait for a lock rather than fail at once.

`rusqlite` is built with the `bundled` feature (chapter 31), so every user gets the same SQLite version, with JSON functions and full text search (FTS5) included. The vault index from chapter 17 uses both.

## Queries

<Source path="src-tauri/src/fanwit/db.rs" from="pub async fn fw_db_query" to="}" />

- **Off the command threads.** The command is `async`, and the actual work runs in `spawn_blocking`, a thread pool meant for blocking work. A slow query therefore never holds up other commands such as window events.
- **One writer at a time.** The connection sits behind `Arc<Mutex<Connection>>`. `Arc` lets the blocking task own a reference to it, and `Mutex` makes queries on the same file take turns, which is how SQLite wants a single connection used.
- **JSON in, JSON out.** Parameters arrive as JSON values and are converted to SQLite values (`param`). Rows go back as JSON objects keyed by column name (`column`). Booleans become 0 and 1, and arrays or objects are stored as JSON text, which SQLite's JSON functions can query.
- **Read only mode.** The Database Explorer in Labs passes `readonly: true` unless developer mode is on. `stmt.readonly()` asks SQLite itself whether a statement writes, which is more reliable than guessing from the SQL text.

<Callout kind="new" title="New here: Arc, spawn_blocking and async commands">

`Arc<T>` is a reference counted pointer that can be shared across threads: `.clone()` makes another reference to the **same** value, and the value is freed when the last one goes away. `Arc<Mutex<T>>` is the standard way to share mutable data between threads.

An `async` Tauri command runs on Tauri's async runtime. Blocking calls (disk, SQLite) should not run there directly, since they would stall other tasks. `tauri::async_runtime::spawn_blocking(move || { ... })` moves the closure to a thread made for blocking work and returns a future of its result. `.await.map_err(err)?` waits for it and turns a crashed task into an error. The final `?` is there because the closure itself returns a `Result`.

`State<'_, State>` with a lifetime is required for `async` commands, since Tauri must know that the borrowed state lives long enough.

</Callout>

`fw_db_batch` runs several statements in one **transaction**: all of them are applied, or none are. Migrations (chapter 15) use it, so a migration that fails halfway leaves the database as it was.

## Keeping plugins in their own tables

Modules you compile into the app are trusted. Runtime **plugins**, installed by users from a registry, are not. A plugin that gets `ctx.db.sql()` should see its own tables and nothing else, not the notes module's data or another plugin's tokens. The boot sequence (chapter 30) passes `restrict` for plugin owners, and Rust enforces it with SQLite's **authorizer**:

<Source path="src-tauri/src/fanwit/db.rs" from="fn guard(owner: String)" to="}" />

SQLite calls the authorizer while compiling each statement, once per table and column it touches. The guard allows only tables named `<plugin id>__…`, plus the migration bookkeeping table and SQLite's own `sqlite_` tables. Reading schema information through a few harmless pragmas is allowed, and `ATTACH` (which would open another database file) is always denied. The check happens inside SQLite, on what the statement really touches, so no trick in the SQL text, such as a subquery, a view or a trigger, gets around it.

<Source path="src-tauri/src/fanwit/db.rs" from="fn with_guard<T>" to="}" />

`with_guard` installs the authorizer for one call and removes it afterwards, since the same connection also serves trusted modules. Denials are rewritten as `PERMISSION_DENIED: …`, with a hint that names the rule. The web side turns that prefix into the error's code (`toFanwitError`, chapter 6), so the CLI exits with code 5 and the error card shows the hint.

<Callout kind="new" title="New here: closures that return closures, and higher-ranked bounds">

`fn guard(owner: String) -> impl for<'r> FnMut(AuthContext<'r>) -> Authorization + Send + 'static` returns a closure. `impl Trait` in return position means "some type implementing this trait", which is how you return a closure, since every closure has its own unnamed type.

`for<'r>` is a **higher-ranked trait bound**: the closure must accept an `AuthContext` with **any** lifetime `'r`, because SQLite hands it a context that only lives for one call. `Send + 'static` says the closure can move between threads and borrows nothing short lived. It owns its `prefix` string, thanks to `move`.

`AuthAction::Insert { table_name } | AuthAction::Delete { table_name } | ...` is an or-pattern over enum variants that all bind `table_name`. One arm handles them all. `matches!(x, "a" | "b")` is a macro that returns `true` when the value matches the pattern.

</Callout>

<Source path="src-tauri/src/fanwit/db.rs" />

## Checkpoint

<Source path="src-tauri/src/fanwit/db.rs" from="#[cfg(test)]" />

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib db::
```

Writing this test found two gaps. SQLite reports a denied **read** as "access to … is prohibited", not "not authorized", so denied reads reached plugins without the hint. Batches were not rewritten at all. Both now go through one `denied` function. And on the web side, `toFanwitError` now reads a leading `CODE:` from Rust's error strings, so a denial really carries the `PERMISSION_DENIED` code.

<Check question="A plugin with id timer runs SELECT * FROM notes__items. Where is it stopped?" options={["In TypeScript, by checking the SQL text for other modules' table names", "In SQLite's authorizer, which denies reading any table not prefixed timer__", "Nowhere; plugins share the app database"]} answer={1}>

Checking SQL text in TypeScript would miss views, triggers and subqueries. The authorizer runs inside SQLite as it compiles the statement, and sees every table the statement actually touches.

</Check>
