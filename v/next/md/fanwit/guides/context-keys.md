# Context keys

A <Term name="context key" /> is a named fact about what is happening right now: `vault.open`, `focusedView`, `resource.ext`, `inputFocus`. A `when` clause combines them, as in `vault.open && resource.ext == 'md'`, and decides whether a command can run, a menu item shows, or a key binding applies.

<Callout kind="why">

Without a shared vocabulary, every menu, shortcut and button checks the app's state its own way, and they disagree: the shortcut works where the menu item is greyed out. With context keys, a command states its condition once, in its `when`. The palette, the menus, the keys and the command pipeline all evaluate that same clause, so they can't disagree. A disabled item can also say *why* it is disabled, because the clause knows which part failed.

</Callout>

## Writing a when clause

| Clause | True when |
|---|---|
| `inputFocus && !textSelected` | Typing in a field with nothing selected |
| `resource.ext in ['md', 'txt'] && vault.open` | The active file is Markdown or text, in an open vault |
| `resource.path =~ /^daily/` | The active file's path starts with `daily` |
| `config.notes.editor.wrap == 'bounded'` | A setting has a value (settings read as `config.<key>`) |
| `selection.count > 1` | Your module set `selection.count` above 1 |

## Grammar

```
expr := or
or   := and ( "||" and )*
and  := not ( "&&" not )*
not  := "!" not | cmp
cmp  := atom ( "==" | "!=" | ">" | ">=" | "<" | "<=" | "=~" | "in" | "not in" ) atom
atom := key | string | number | true | false | regex | ( expr ) | [ list ]
```

<Callout kind="under-the-hood">

Clauses are compiled once and cached (<Api symbol="compileWhen" />), and each one records the keys it reads, so they stay cheap to evaluate on every key press.

</Callout>

## Setting your own keys

<Steps>

1. Declare the key in `contributes.contextKeys` with a type and a description. Declared keys appear in the reference and in the Context keys inspector.
2. Set it from code: `ctx.context.set("selection.count", 3)`.
3. Or scope it to one part of the page with the `ctxkeys` action. Keys pressed there, and menus opened there, see the value; the rest of the window does not.

</Steps>

```svelte
<ul use:ctxkeys={{ focusedView: "notes.list", "selection.count": selected.length }}>...</ul>
```

Open the inspector to watch every key change live as you click around the app:

```fanwit-run
dev.contextKeys
```

<Check question="A menu item's command has when: 'vault.open'. No vault is open. What does the user see?" options={["The item is missing", "The item is greyed out, and its tooltip says why", "The item runs and fails"]} answer={1}>

`when` decides whether it can *run*; the item stays visible and explains the failing part of the clause. To hide an item instead, use `visibleWhen`, on the command (everywhere) or on the menu item (in that menu only).

</Check>

## Pitfalls

- **Checking state in the handler instead.** A handler that returns early leaves the menu item enabled and the key "working" with no effect. Put the condition in `when`.
- **Undeclared keys.** They work, but nobody can discover them. Declare them in `contextKeys`.
- **Global keys for local state.** If a fact belongs to one list or panel, scope it with `ctxkeys` so it can't leak into the rest of the window.

See [every key](manual://fanwit/reference/context-keys) the app declares.
