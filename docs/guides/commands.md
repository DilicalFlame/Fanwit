---
title: Commands
section: Guides
order: 2
---
# Commands

Commands are the verbs of the app. Ids are `<module>.<verbObject>` in camel case; titles are sentence case.

## Ids

Command ids must be unique; prefix them with your module id. Old ids keep working through `deprecatedAliases`.

## Arguments

One schema powers validation, palette prompts for missing arguments, and CLI flags.

| Arg type | Palette prompt | CLI |
|---|---|---|
| string | text input | `--name value` |
| number | numeric input | `--size 12` |
| boolean | yes or no | `--force`, `--no-force` |
| enum | pick list | `--mode split` |
| path | picker | positional, resolved against cwd |
| ref | quick pick of commands, views, themes | `--theme nord-ish` |

## Pipeline

Resolve id and aliases, activate the owner, check `when`, parse and prompt arguments, confirm, interceptors, handler, history, log and recents.

## Undo

Undoable handlers return `{ undo, redo?, label }`. Group steps with `ctx.history.transaction(label, fn)`.

```fanwit-run
history.undo
```

## User commands and macros

`commands.toml` composes commands without code. Developer: Record Macro captures what you run and writes it there.
