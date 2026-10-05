# Data

FaNWiT gives a module three ways to keep data, from small to large. **Persisted values** are single reactive values. **Storage** is key value data. **SQLite** handles tables and queries. Each one takes a <Term name="scope" /> that says where the data lives.

<Callout kind="why">

"Where does this live?" decides what users experience. A sidebar width should follow the project, a recent searches list should follow the user, and a draft should vanish with the window. Making the scope an explicit argument, rather than a choice buried in each feature, keeps those decisions visible and consistent. Fixed table prefixes and checked migrations keep many modules and plugins from damaging each other's data.

</Callout>

## Scopes

| Scope | Lives | Use it for |
|---|---|---|
| `memory` | until the window reloads | caches |
| `session` | until the window closes (it survives reloads) | drafts, temporary state |
| `window` | saved per window (by its label), across restarts | that window's own UI state |
| `global` | on this computer, for this user | preferences that follow the user |
| `vault` | in the open vault's `.fanwit` folder | state that follows the project |

Settings resolve vault over global over defaults (see [Settings](manual://fanwit/guides/settings)).

## Small values

```ts
const width = ctx.persisted("sidebarWidth", 280, { scope: "vault" });
width.value = 320; // saved, debounced
```

## Tables

```ts
const db = ctx.db.sql({ scope: "vault" });
await db.migrate([{ version: 1, up: sql`CREATE TABLE notes__links (src TEXT, dst TEXT)` }]);
const rows = await db.query(sql`SELECT src FROM notes__links WHERE dst = ${path}`);
```

Interpolations in <Api symbol="sql" /> become parameters, so values can't inject SQL.

## Migrations

Migrations are idempotent and checksummed: editing a migration that has already run is a startup error, and downgrades are refused. Every module owns the table prefix `<id>__`; runtime plugins are held to it by SQLite's authorizer.

## Engines

On the desktop the engine is bundled SQLite through rusqlite (WAL, one writer). On the web, key value data uses browser storage, and the SQLite WASM worker is the planned engine for tables.

<Check question="A list of recently opened files should follow the user across projects. Which scope?" options={["vault", "global", "window"]} answer={1}>

`global` follows the user on this computer whatever vault is open. `vault` would give each project its own list, and `window` would lose it when the window closes.

</Check>

## Pitfalls

- **Editing an applied migration.** Add a new version instead. The checksum catches edits, and the app refuses to start.
- **Tables without your prefix.** Name them `<module id>__name`. Plugins can't touch other modules' tables, and your own code shouldn't either.
- **Vault scope with no vault open.** It throws `STORAGE_NO_VAULT`. Check `ctx.vault.current`, or fall back to `global`.
- **Big values in settings.** Settings are for preferences people edit. Keep lists, caches and documents in storage or tables.
