# Keyboard

A key binding maps a key, or a chord of keys, to a <Term name="command" />, optionally with arguments and a `when` clause. Bindings come from four places: the core, modules, plugins and your own `keys.toml`.

<Callout kind="why">

Binding keys to commands rather than to code has three effects. The same key works wherever the command makes sense. The shortcut shown in menus and in the palette is always the real one, because it is read from the bindings. And a user can rebind anything without touching code. Precedence is fixed so you can predict the result: **user over plugin over module over core**. Your `keys.toml` always wins.

</Callout>

## Your keys

`keys.toml` lives in the app's config folder and is live: save it and the new keys apply at once.

```toml
[[bind]]
key = "mod+e"
command = "notes.togglePreview"
when = "focusedView == 'notes.editor'"

[[bind]]
key = "mod+k mod+x"
command = "-layout.toggleZen"   # a leading "-" removes a default binding
```

- `mod` is Cmd on macOS and Ctrl elsewhere. Chords are separated by a space (`mod+k mod+s`).
- Physical keys in brackets ignore the keyboard layout: `mod+[Backquote]` is the key left of 1 on any layout.
- While you type in an input, unmodified bindings never fire, so `/` types a slash in a text field.
- `global = true` registers an OS wide shortcut on the desktop, which works while the app is in the background.

## From a module

```ts
contributes: {
	keybindings: [{ key: "mod+alt+h", command: "hello.greet", args: { name: "you" } }]
}
```

## Seeing what is bound

The overlay shows every key that works where you are now, generated from the live bindings, so it is never out of date. Right now the palette is <Keys command="palette.open" /> and the overlay is <Keys command="keys.showOverlay" />.

```fanwit-run
keys.showOverlay
```

The [Keybindings reference](manual://fanwit/reference/keybindings) lists every binding with its source (core, module, plugin or user).

<Callout kind="under-the-hood">

When you press a key, the bindings for that key (or for the chord so far) are filtered by their `when` clauses, evaluated at the focused element. The winner is the one from the highest precedence source, and among equal sources the later one. During a chord, the status bar shows the keys pressed so far until the chord completes or times out.

</Callout>

## Pitfalls

- **Single keys in views with text.** An unmodified key like `n` is safe only where there is no text input, and only with a `when` that limits it to your view.
- **Editing the defaults instead of overriding them.** Don't change a module's `keybindings` to suit yourself. Add a line to `keys.toml`; it survives updates.
- **Global shortcuts.** They take the key from every other app. Use them sparingly, and only for actions such as "quick capture".
