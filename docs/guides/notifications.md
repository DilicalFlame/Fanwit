---
title: Notifications
section: Guides
order: 8
---
# Notifications

One API, many surfaces: toast, OS notification, centre, banner, status item, badge, taskbar progress, attention.

```ts
ctx.notify.send({ title: "Export finished", body: "**report.pdf** saved", kind: "success" });
const p = ctx.notify.progress({ title: "Indexing", cancellable: true });
```

Routing is automatic: Do not disturb sends to the centre, a focused window gets a toast, otherwise an OS notification. Channels let users tune each category.

```fanwit-run
notify.send {"title": "Hello from the manual", "kind": "success"}
```
