---
title: Settings
section: Guides
order: 12
summary: Declare a setting once; its UI, file key, CLI flag and docs are generated.
---
# Settings

A setting is declared once, with a type and a little metadata. From that one declaration FaNWiT generates its row in the Settings window, its search entry, its key in `settings.toml`, its CLI flag and its line in the [Settings reference](manual://fanwit/reference/settings).

<Callout kind="why">

Hand-built settings screens drift from the code that reads them: a slider allows 50 while the code assumes 32 at most, or a setting exists in the file but never in the UI. With a declared schema, the type, range and default are written once and checked everywhere, including in the TOML file a user edits by hand. Because settings are TOML, they can be backed up, compared and shared like any other file.

</Callout>

## Declaring

```ts
export default defineSettings("notes", {
	"editor.fontSize": s.number(15, { title: "Editor font size", min: 10, max: 32, widget: "slider", unit: "px" }),
	"editor.wrap": s.enum("soft", ["off", "soft", "bounded"], { title: "Line wrapping" }),
	"sync.token": s.secret({ title: "Sync token" }) // OS keychain, never in files
});
```

Contribute it as `contributes.settings`, or add one to an existing module with `pnpm fw add setting notes.editor.fontSize`. Builders: <Api symbol="s" />. Read a value with `ctx.settings.get("notes.editor.fontSize")`. In a view the read is reactive, so the view updates when the value changes.

## Layers

A value is resolved through layers, and the later layer wins:

<Steps>

1. **Default**: from the declaration.
2. **App**: `settings` in `app.config.ts`, for your app's own defaults.
3. **User**: the user's `settings.toml`.
4. **Vault**: the open vault's settings, for project specific values.
5. **Window**: one window only, for this session.
6. **CLI**: `--set key=value`, or an environment variable such as `FANWIT_NOTES_EDITOR_FONTSIZE=18`.

</Steps>

An invalid value in a layer (wrong type, out of range) is skipped, and the next layer down is used. A typo in a file can't break the app.

This is your `settings.toml` right now. Change something in **Settings** or in this manual's **Aa** panel and watch it update:

<LiveToml file="settings" />

```fanwit-run
app.settings
```

## Pitfalls

- **Reading once at activation.** In a module, read the setting when you need it, or listen with `ctx.settings.onDidChange`. A value copied into a variable at startup won't follow changes.
- **Secrets in settings.** Use `s.secret`: it is stored in the OS keychain and never written to TOML.
- **Settings for state.** A sidebar width or the last opened file is state, not a preference. Use `ctx.persisted` for it (see [Data](manual://fanwit/guides/data)).
