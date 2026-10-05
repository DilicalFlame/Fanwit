# Command line

The app binary has a command line. It exposes every command marked `cli: true`, with flags generated from the command's argument schema:

```
fanwit-cli hello greet --name Asha --json
fanwit-cli layout open-view --view fanwit.logs --region panel
fanwit-cli commands list
fanwit-cli completions bash
```

<Callout kind="why">

A command line that runs the same commands as the menus lets users script the app, lets other tools drive it, and lets you test it from CI without a UI. Because the CLI is generated from the command registry, it can't fall behind: a new command with `cli: true` is a new subcommand, with `--help`, completion and validation included.

</Callout>

## How it reaches the app

The client talks to the running app over a local socket (a named pipe on Windows). If the app isn't running, it starts it headless. The command runs through the normal pipeline (source `cli`), and progress and output stream back to the terminal.

| Exit code | Meaning |
|---|---|
| 0 | success |
| 1 | failed |
| 2 | usage error |
| 3 | disabled (the command's `when` is false) |
| 4 | unknown command |
| 5 | permission denied |
| 130 | cancelled |

## Deep links

`fanwit://run/<command>?arg=value` runs a command from a link, a browser or another app. Deep links reach only commands marked `uri: true`, and commands with `confirm` always ask first, so a link can't do something destructive behind the user's back.

## Pitfalls

- **Marking everything `cli: true`.** Expose what makes sense to script. A command that needs a selection in a view won't make sense from a terminal.
- **`uri: true` on destructive commands.** Any web page can open a link. Pair it with `confirm`.

The developer CLI (`pnpm fw ...`) is separate: see the [fw reference](manual://fanwit/reference/fw-cli).
