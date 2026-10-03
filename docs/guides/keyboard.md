---
title: Keyboard
section: Guides
order: 3
---
# Keyboard

Bindings live in `keys.toml` and in module contributions. Precedence: user over plugin over module over core.

```toml
[[bind]]
key = "mod+e"
command = "notes.togglePreview"
when = "focusedView == 'notes.editor'"

[[bind]]
key = "mod+k mod+x"
command = "-layout.toggleZen"   # remove a default
```

- `mod` is Cmd on macOS and Ctrl elsewhere; chords are space separated (`mod+k mod+s`).
- Physical keys in brackets ignore the keyboard layout: `mod+[Backquote]`.
- While typing in an input, unmodified bindings never fire.
- `global = true` registers an OS wide shortcut on the desktop.

```fanwit-run
keys.showOverlay
```
