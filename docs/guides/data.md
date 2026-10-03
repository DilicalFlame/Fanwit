---
title: Data
section: Guides
order: 11
---
# Data

## Scopes

memory, session, window, global, vault. Settings resolve vault over global over defaults.

```ts
const width = ctx.persisted("sidebarWidth", 280, { scope: "vault" });
width.value = 320; // saved, debounced
```

## Migrations

```ts
const db = ctx.db.sql({ scope: "vault" });
await db.migrate([{ version: 1, up: sql`CREATE TABLE notes__links (src TEXT, dst TEXT)` }]);
```

Migrations are idempotent and checksummed; editing an applied one is a startup error and downgrades are refused. Every module owns the table prefix `<id>__`; runtime plugins are held to it by SQLite's authorizer.

## Engines

Desktop: bundled SQLite through rusqlite (WAL, one writer). Web: browser storage for key value data; the SQLite WASM worker is the planned engine.
