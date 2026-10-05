# Troubleshooting

Each problem below has a way back that doesn't involve deleting files. The app is designed so that a bad plugin, a broken file or a lost shortcut never leaves you stuck.

- **A plugin breaks the app.** Start with `--safe-mode`: code plugins stay off for that session. To keep them off, turn on **Safe mode** in Settings, Plugins.
- **My layout is broken.** The last valid layout stays on screen while the file has errors. Fix the reported line in `workspace.toml`, or run **Reset layout** (`layout.reset`). The Manual window has its own layout and resets the same way.
- **A shortcut does nothing.** Open the keyboard overlay (<Keys command="keys.showOverlay" />) to see what is bound where you are, or search the Shortcuts editor with the keys you pressed. A `when` clause may be false here, or a later binding may win.
- **A setting doesn't take effect.** A higher layer may override it: Settings shows where the value comes from (default, app, user, vault, window or CLI).
- **The manual looks wrong after an upgrade.** Run **Reset layout** in the Manual window.
- **I need diagnostics for a bug report.** Run **Create diagnostics bundle**.

```fanwit-run
app.diagnostics
```
