---
title: The core module
section: "Rebuild: the window"
order: 1
summary: FaNWiT's own features declared the way any module declares them. About 120 commands with their default keys, the built in settings, menu locations and items, translations, the palette's providers, and the bridge that turns a terminal command line into a command run.
---
# The core module

The kernel and the services are machinery. On their own they do nothing a person can see: no command is registered, no key bound, no menu has items. This stage builds the window people use. It starts with `core/`, the module that declares FaNWiT's own features.

<Callout kind="why">

FaNWiT's own features are declared with `defineModule`, the same API your modules use (chapter 13). There is no back door. That keeps the core honest: anything it can do, an app module can do too, by the same route. The palette, the CLI, the keyboard shortcut editor and the reference pages all read core commands exactly as they read yours. And when the docs site removes most commands, nothing else needs to know.

</Callout>

The core is split into files by kind of contribution. This chapter covers the **declarations**: data, no behaviour.

| File | Declares |
|---|---|
| `core/commands.ts` | About 120 commands and their default keys |
| `core/settings.ts` | The built in settings: language, theme, UI, editor, files, privacy, developer |
| `core/menus.ts` | Menu locations and their items |
| `i18n/catalogs.ts` | German and Hindi translations of all of the above |
| `core/palette.ts` | Palette providers: commands, quick open, help, windows |
| `core/cli.ts` | The command line, mapped onto commands |

Chapter 25 writes the **handlers** that make the commands do something. `core/index.ts`, which gathers everything into `coreModule`, imports views and menu components that only exist by the end of this stage, so it is written in chapter 30.

## Commands and keys

A small helper keeps the list readable: id, title, category, then whatever else the command needs:

<Source path="src/fanwit/core/commands.ts" from="const c = (id" until="Switch window" />

Read the whole list once. It is the best map of what FaNWiT can do. Notice the patterns from chapter 9:

- `when` greys a command out until it makes sense (`tab.close` needs `activeTab`). `visibleWhen` hides it entirely (`window.cycle` only exists on the web).
- `toggled` names a context key, so menus show a check mark (`layout.toggleZen` is checked while `layout.zen` is true).
- `args` with a `ref` type (`ref: "theme"`) make the palette offer a list of themes when the argument is missing.
- `cli: true` exposes a command to the terminal, `uri: true` to `fanwit://` links, and `palette: false` keeps internal commands out of the palette.
- `confirm` on `menus.resetAll` makes the pipeline ask before running (chapter 10).

<Source path="src/fanwit/core/commands.ts" from="export const coreKeybindings" until="mod+shift+p" />

Default bindings follow VS Code where an equivalent exists, so people's hands already know them. Browsers reserve some keys: Ctrl+W closes the tab and Ctrl+Q quits. A binding can therefore carry a `web` override, which is a different key or `""` for none. Chapter 11's keybinding service picks it when `host.caps.nativeWindows` is false.

<Source path="src/fanwit/core/commands.ts" />

## Settings

Built in settings use chapter 16's builders. Each one has a title, a category for the settings window, a widget, and sometimes the scopes where it may be set: `theme.mode` can differ per window, and `autostart` only makes sense globally:

<Source path="src/fanwit/core/settings.ts" from="export const coreSettings" until="startup.restoreVault" />

`language` lists only languages that have a catalog. Its options are computed from `Object.keys(catalogs)`, so adding a catalog adds a language, and the catalog test checks that it is complete.

<Source path="src/fanwit/core/settings.ts" />

## Menus

Chapter 22's service starts empty. The core declares where menus appear (`coreLocations`) and fills them (`coreMenus`). Each location has a description and a sample target, so the Context Menu Editor can preview it:

<Source path="src/fanwit/core/menus.ts" from="const cmd = (command" until="tab.closeOthers" />

<Source path="src/fanwit/core/menus.ts" />

## Translations

Every user visible string in the core has a key: `command.<id>`, `category.<name>`, `setting.<key>`, `view.<id>`, `menu.<id>`, `ui.<...>`. Chapter 14's i18n service looks a key up in the current language and falls back to the English text written in the declaration, so English needs no catalog at all:

<Source path="src/fanwit/i18n/catalogs.ts" from="export const catalogs" until="category.Window" />

The test that keeps every shipped language complete:

<Source path="src/fanwit/i18n/catalogs.test.ts" />

<Source path="src/fanwit/i18n/catalogs.ts" />

## Palette providers

Chapter 23's palette has no providers of its own. The core supplies them. The commands provider (`>`) is the one most people use:

<Source path="src/fanwit/core/palette.ts" from="export const commandsProvider" to="};" />

- **Ranking** combines the fuzzy score with **frecency** (how often and how recently you ran it, from chapter 10's command log), plus a bonus for commands about the focused view.
- **Disabled commands stay out of the way.** They appear only when you type their exact title, and then with the reason they are disabled, so "why can't I find Close tab?" has an answer.
- `positions` are shifted past the `Category: ` prefix, so the bold letters land on the title.

Quick open (no prefix) lists open tabs, then vault files from a five second cache, and opens a file with the first view that declares its extension in `opens` (chapter 19). The `@`, `:` and `#` prefixes delegate to the focused view, which registers how to list its symbols, go to a line, or list tags.

<Source path="src/fanwit/core/palette.ts" />

## The command line

`myapp notes rename-file a.md --to b.md --json` runs `notes.renameFile` in the running app, and prints the result. The mapping is mechanical: the first segment of the id is the group, and the rest becomes kebab case:

<Source path="src/fanwit/core/cli.ts" from="export function cliName" to="}" />

```tikz caption="A terminal command reaches the running app's command pipeline" alt="The terminal runs the fanwit-cli binary, which connects to the app's local socket. Rust forwards the request to the main window as the fw://cli event. runCli parses argv into arguments, runs the command, and sends progress and the result back to the terminal."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=10mm,font=\scriptsize,text width=25mm}]
\node[b,fwuser] (term) at (0,0) {terminal\\\texttt{myapp notes}\\\texttt{rename-file a.md}};
\node[b,fwwarm] (bin) at (40,0) {\texttt{fanwit-cli}\\binary};
\node[b,fwwarm] (rust) at (80,0) {app process\\(Rust)};
\node[b,fwcore] (win) at (120,0) {main window\\\texttt{runCli}};
\node[b,fwcore] (pipe) at (160,0) {\texttt{commands.run}\\\texttt{source: "cli"}};
\draw[fwarrow] (term) -- (bin);
\draw[fwarrow] (bin) -- node[fwlabel,above]{socket} (rust);
\draw[fwarrow] (rust) -- node[fwlabel,above]{\texttt{fw://cli}} (win);
\draw[fwarrow] (win) -- (pipe);
\draw[fwarrow,dashed] (win.south) to[bend left=18] node[fwlabel,below]{progress, result, exit code} (term.south);
\end{tikzpicture}
```

`runCli` does the parsing a CLI library would do, from the command's own argument schema:

- `--to b.md` and `--to=b.md` set `to`. `--force` sets a boolean, and `--no-force` clears it. Kebab case flags become camel case arguments.
- Arguments of type `path` are **positional** by default and are resolved against the terminal's working directory, since the app's own directory means nothing to the user.
- `--json` prints the result as JSON. Otherwise objects print as `key: value`, and lists of objects as an aligned table.
- `help`, `commands list` and `completions bash|zsh|fish|powershell` come for free from the declarations.
- Errors become **exit codes** via chapter 6's `exitCodeFor`: 2 for bad arguments, 4 for an unknown command, 5 for a command that is not exposed. Scripts can tell the failures apart.
- The run uses `interactive: false`, so a missing argument fails instead of opening a palette prompt nobody can see.

<Callout kind="new" title="New here: rest elements and split with a capture group">

`const [first, second, ...rest] = args` takes the first two items and collects the remainder into `rest`. `"--size=3".slice(2).split(/=(.*)/s)` splits on the **first** `=` only. When the pattern has a capture group, `split` includes what it captured in the result. `(.*)` captures everything after the first `=` (the `s` flag lets `.` match newlines too). `--data=a=b` therefore gives `["data", "a=b", ""]`, keeping the value whole.

</Callout>

<Source path="src/fanwit/core/cli.ts" from="export function attachCliBridge" to="}" />

The bridge is the web side of the arrow above. Rust receives requests from the `fanwit-cli` binary and emits them as `fw://cli`. The main window answers through `fw_cli_send`, and `fw_cli_ready` tells Rust it may start forwarding. The Rust half is built in "Rebuild: the Rust core".

<Source path="src/fanwit/core/cli.ts" />

## Checkpoint

<Source path="src/fanwit/core/cli.test.ts" />

```sh
pnpm vitest run src/fanwit/core src/fanwit/i18n
```

<Check question="You add a French catalog to catalogs.ts with only half the keys translated. What happens?" options={["French appears in the Language setting, and untranslated keys show their English text", "French appears in the Language setting, and catalogs.test.ts fails until every key the core asks for is translated", "Nothing: languages must be registered separately"]} answer={1}>

The Language setting lists every catalog key, so French appears. A listed language must be complete, though, and the catalog test checks every key the core frame asks for. At run time the fallback to English would hide the gaps; the test is what makes them visible.

</Check>
