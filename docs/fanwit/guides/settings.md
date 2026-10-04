---
title: Settings
section: Guides
order: 12
---
# Settings

Declare settings with schemas; the Settings window, search, TOML key, CLI flag and documentation row are generated.

```ts
export default defineSettings("notes", {
	"editor.fontSize": s.number(15, { title: "Editor font size", min: 10, max: 32, widget: "slider", unit: "px" }),
	"sync.token": s.secret({ title: "Sync token" }) // OS keychain, never in files
});
```

Layers: default, app (`app.config.ts`), user (`settings.toml`), vault, window, CLI (`--set key=value` or `FANWIT_NOTES_EDITOR_FONTSIZE=18`). Invalid values fall back to the next layer.

```fanwit-run
app.settings
```
