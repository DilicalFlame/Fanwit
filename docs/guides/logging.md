---
title: Logging
section: Guides
order: 16
---
# Logging

`ctx.log` is scoped to your module. Fields stay structured: `ctx.log.info("saved", { path, ms })`. The last 5000 records from the frontend and Rust stay in memory for the Log Viewer; secrets are redacted.

```fanwit-run
dev.logs
```
