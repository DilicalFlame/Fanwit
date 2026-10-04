---
title: The keyboard
section: "Rebuild: foundations"
order: 9
summary: From a key press to a command. Key notation that works on every keyboard layout and platform, chords like Ctrl+K Ctrl+S, precedence between core, modules, plugins and the user, and keys.toml.
---
# The keyboard

A keyboard shortcut in FaNWiT is a binding from keys to a command, with an optional when clause: `{ key: "mod+shift+p", command: "palette.open" }`. This chapter builds the two files that turn a key press into a command run: `keys/notation.ts`, which understands how people write keys and how browsers report them, and `keys/keybindings.svelte.ts`, which decides which binding wins.

<Callout kind="why">

Keyboards are hard. "Ctrl" on Windows is "Cmd" on a Mac; Shift+1 is reported as `!`; on a German layout the key that prints `z` is where an American `y` is; Alt+K on a Mac types `˚`. A shortcut system that compares raw browser events gets each of these wrong for someone. FaNWiT writes bindings the way people read them (`mod+shift+p`), normalises both the binding and every key press to one **canonical** form, and compares those (Chapter 6 of the specification).

</Callout>

## Notation

<Source path="src/fanwit/keys/notation.ts" from="export function canonicalStep" to="}" />

A binding is one or more **steps** separated by spaces (`mod+k mod+s` is a chord of two). Each step is modifiers and a key, joined by `+`. `canonicalStep` lowercases everything, resolves `mod` to `meta` on macOS and `ctrl` elsewhere, maps aliases (`cmd`, `option`, `esc`, `up`, ...) and sorts modifiers in a fixed order: ctrl, alt, shift, meta. `Shift+Mod+P` on Windows and `mod+shift+p` both become `ctrl+shift+p`, so they compare equal.

<Callout kind="new" title="New here: lookahead in a regular expression">

`step.split(/\+(?!$)/)` splits on `+` except a `+` at the very end: `(?!$)` is a **negative lookahead**, "not followed by the end". So `ctrl++` (Ctrl and the plus key) splits into `ctrl` and `+`, instead of losing the key.

</Callout>

### Two readings of every key press

<Source path="src/fanwit/keys/notation.ts" from="export function eventToSteps" to="}" />

Every key press produces two steps:

- **logical**: from the character the key prints (`e.key`), so `mod+z` means "the key labelled Z" on any layout. When a modifier changed the character (Shift+1 gives `!`), it falls back to the unshifted character of the physical key, read from the OS keyboard layout where the browser exposes it.
- **physical**: from the key's position (`e.code`), written in brackets, `ctrl+[KeyZ]`. Bindings that should stay where they are regardless of layout (game-style keys, Vim-style movement) use this form.

A binding matches if either reading does.

<Source path="src/fanwit/keys/notation.ts" from="export function formatSteps" to="}" />

`formatSteps` goes the other way, for the key chips you see next to menu items: `Ctrl+Shift+P` on Windows, `⇧⌘P` on macOS.

<Source path="src/fanwit/keys/notation.ts" />

## Budgets

Handling a key press must be fast: it happens on every key, and any delay is felt. `kernel/budget.ts` names a time budget for the operations that matter and records each as a **User Timing** measure, visible in the browser's Performance panel and checked by an end-to-end test:

<Source path="src/fanwit/kernel/budget.ts" open="true" />

<Callout kind="new" title="New here: keyof typeof">

`type BudgetName = keyof typeof BUDGETS` gives the union of the object's keys, `"fw:module.activate" | "fw:keys.dispatch" | "fw:menus.resolve"`. `typeof` turns a value into its type; `keyof` takes a type's keys. Add a budget to the object, and `measure` accepts its name everywhere, with no separate list to keep in step.

</Callout>

## The keybinding service

### Bindings and precedence

<Source path="src/fanwit/keys/keybindings.svelte.ts" from="export interface Keybinding {" to="}" />

A binding can carry different keys per platform (`mac`, `win`, `linux`, `web`), arguments for the command, a when clause, and `global: true` for an OS-wide shortcut that works when the app is in the background (desktop only, through the Tauri global shortcut plugin).

Bindings come from four **tiers**: core, modules, plugins and the user. The user always wins; within a tier, the one registered last wins. A binding whose command starts with `-` is a **removal**: `{ key: "mod+k mod+t", command: "-theme.select" }` in your `keys.toml` deletes that default.

<Source path="src/fanwit/keys/keybindings.svelte.ts" from="	effective(): ResolvedBinding[] {" to="	}" />

### From key press to command

`handle` is attached to the document in the capture phase, so it sees keys before any component does:

<Source path="src/fanwit/keys/keybindings.svelte.ts" from="	handle = (e: KeyboardEvent): boolean => {" until="	onError?:" />

In order:

1. Ignore keys typed into an input method (`isComposing`: composing Japanese, for example) and lone modifier presses.
2. If the shortcut editor is recording, hand it the key and stop.
3. Find the bindings whose steps so far match the chord in progress plus this key (by either reading), whose when clause holds for the focused element, and whose command exists.
4. **Text input rule:** while you are typing in a field, an unmodified key (a plain letter) never triggers a shortcut, unless its clause explicitly mentions `inputFocus`.
5. If a binding is complete, run its command with `source: "key"`; if longer bindings start this way, remember the chord (shown in the status bar) and wait up to two seconds for the next step.

Note the call to `measure("fw:keys.dispatch", ...)`: the four millisecond budget from above.

<Callout kind="new" title="New here: the capture phase">

`addEventListener("keydown", h, true)`: the third argument registers the listener for the **capture** phase. DOM events travel from the document down to the target and then back up; capture listeners run on the way down, before the focused element sees the key. That is how a shortcut can claim a key before a text field types it.

</Callout>

### keys.toml

`loadUser` reads the user's `keys.toml` (`[[bind]]` tables), registers them in the user tier and reports entries it could not use; `userBindings` writes them back. The file is parsed with **smol-toml**, a small TOML parser:

```sh
pnpm add smol-toml
```

The whole service:

<Source path="src/fanwit/keys/keybindings.svelte.ts" />

## Checkpoint

The notation has tests in the repository; add `src/fanwit/keys/notation.test.ts`:

<Source path="src/fanwit/keys/notation.test.ts" />

and the service's, `src/fanwit/keys/keybindings.test.ts`:

<Source path="src/fanwit/keys/keybindings.test.ts" />

```sh
pnpm vitest run src/fanwit/keys
```

<Check question="You are typing in the search box and press the letter p, which some module bound to a command. What happens?" options={["The command runs", "Nothing special: an unmodified key never fires a shortcut while a text field has focus, unless the binding's when clause mentions inputFocus", "The search box loses focus"]} answer={1}>

The text input rule protects typing. Shortcuts with a modifier (Ctrl+P) still work in a field, and a binding that really wants a plain key in fields says so with `inputFocus` in its clause.

</Check>
