---
title: Troubleshooting
section: Operations
order: 2
---
# Troubleshooting

- **A plugin breaks the app**: start with `--safe-mode`.
- **My layout is broken**: the last valid layout stays on screen; fix the reported line or run `layout.reset`.
- **A shortcut does nothing**: open the keyboard overlay (Ctrl+/) or search the Shortcuts editor with recorded keys.
- **Diagnostics for a bug report**: run Create diagnostics bundle.

```fanwit-run
app.diagnostics
```
