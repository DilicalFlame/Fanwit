---
title: Logging
section: Guides
order: 16
summary: Structured, scoped logs from the frontend and Rust in one viewer.
---
# Logging

`ctx.log` is a logger scoped to your module: every record carries the module id, so the Log Viewer can filter by it. Fields stay structured instead of being glued into a string:

```ts
ctx.log.info("saved", { path, ms });
ctx.log.warn("index is stale", { files: stale.length });
```

<Callout kind="why">

`console.log` output vanishes with the devtools, has no owner, and can't be searched by field. Scoped, structured records answer the questions you actually have when something goes wrong: which module, which file, how long it took. The frontend and Rust write to the same stream, so one view shows the whole story.

</Callout>

The last 5000 records from the frontend and Rust stay in memory for the Log Viewer, and secrets are redacted before they are stored.

```fanwit-run
dev.logs
```

## Pitfalls

- **Logging values that may be secret.** Redaction catches known secrets, not every token you put in a message. Log ids, not credentials.
- **Logging in a hot loop.** Each record costs memory in a ring of 5000. Log summaries, not every iteration.
