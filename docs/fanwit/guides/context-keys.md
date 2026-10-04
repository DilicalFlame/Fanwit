---
title: Context keys
section: Guides
order: 4
---
# Context keys

Context keys describe the current situation; `when` clauses combine them.

## Grammar

```
expr := or
or   := and ( "||" and )*
and  := not ( "&&" not )*
not  := "!" not | cmp
cmp  := atom ( "==" | "!=" | ">" | ">=" | "<" | "<=" | "=~" | "in" | "not in" ) atom
atom := key | string | number | true | false | regex | ( expr ) | [ list ]
```

Examples: `inputFocus && !textSelected`, `resource.ext in ['md', 'txt'] && vault.open`, `resource.path =~ /^daily/`.

Scope keys to a subtree with `use:ctxkeys={{ focusedView: "notes.list" }}`. Settings are readable as `config.<key>`. See [every key](manual://reference/context-keys).

```fanwit-run
dev.contextKeys
```
