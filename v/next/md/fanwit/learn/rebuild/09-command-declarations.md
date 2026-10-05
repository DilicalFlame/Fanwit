# Commands I: declarations and arguments

"Everything is a command" is FaNWiT's first principle. Before building the machinery that runs commands, this chapter defines what one *is*, as plain data: `commands/types.ts`, and the argument schemas in `commands/args.ts`.

<Callout kind="why">

A feature reachable from a menu, a shortcut, the palette, a toolbar, the CLI, a deep link and a test would otherwise be wired up seven times, and the copies drift. In FaNWiT it is one command: an id, a title, the arguments it takes and when it applies, declared as **data** so every one of those surfaces can list it, even before the code that implements it has loaded. The implementation, the **handler**, is registered separately and only when needed.

</Callout>

## The declaration

<Source path="src/fanwit/commands/types.ts" from="export interface CommandDefinition" to="}" />

Every field answers a question one of the surfaces asks:

| Asked by | Field |
|---|---|
| the palette: what is it called, how is it grouped? | `title`, `category`, `icon`, `description`, `palette` |
| menus: is it available here, is it checked? | `when`, `toggled` |
| the palette: should it even be listed now? | `visibleWhen` |
| the CLI: can a script call it, how? | `cli` |
| deep links: may a `fanwit://` link trigger it? | `uri` |
| the pipeline: must the user confirm first? | `confirm` |
| everyone: what arguments does it take? | `args` |

Ids follow `<module>.<verbObject>` in camel case (`notes.newDaily`, `layout.splitRight`), so the owner is visible in the id and names never collide across modules. `deprecatedAliases` keeps old ids working after a rename, so keybindings and scripts users wrote do not break.

## How a call arrives

A handler receives the arguments and an **invocation**: how it was called.

<Source path="src/fanwit/commands/types.ts" from="export interface Invocation" to="}" />

Most handlers ignore it. It is there for the ones that need it: `signal` to stop long work when the user cancels, `progress` to report how far along it is, `target` to know what a context menu was opened on, and `source` for the rare command that behaves differently from a key than from a script.

<Callout kind="new" title="New here: AbortSignal">

An `AbortSignal` is the web platform's standard way to say "stop". Whoever started the work holds an `AbortController` and calls `abort()`; the work checks `signal.aborted` (or listens for its `abort` event). `fetch` accepts one too, so a command can pass its signal straight to a download.

</Callout>

<Source path="src/fanwit/commands/types.ts" from="export interface UndoRecord" to="}" />

A handler that returns an **undo record** joins the undo history automatically. Undo is decided by what the handler returns, not by a flag, so a command that sometimes changes nothing simply returns nothing that time.

<Source path="src/fanwit/commands/types.ts" from="export type CommandHandler" until="export type Interceptor" />

<Callout kind="new" title="New here: generic defaults and R | Promise<R>">

`CommandHandler<A = any, R = unknown>` has type parameters with defaults: write `CommandHandler` alone and `A` is `any`. The result type `R | Promise<R>` accepts both a value and a promise of one, so a handler can be `async` or not; the pipeline will `await` either. The `eslint-disable` comment above it marks the one place FaNWiT allows `any` on purpose: handlers are registered from many modules with many argument shapes.

</Callout>

The whole file:

<Source path="src/fanwit/commands/types.ts" />

## Arguments: one schema, many uses

An argument schema can be a plain object, which is easy to write in a manifest or TOML:

```ts
args: {
	size: { type: "number", min: 8, max: 72, default: 14 },
	mode: { type: "enum", options: ["split", "replace"] },
	file: { type: "path", kind: "file", positional: true }
}
```

or a **Valibot** schema, for code that wants richer validation. `args.ts` turns either into the same normalised description, an `ArgSpec` per argument, which three different places read:

- **validation**, before the handler runs: types, ranges, allowed values, defaults;
- **the palette**, which prompts for a missing argument with the right control (a number field, a list of options, a file picker);
- **the CLI**, which turns `--size 20` and positional values into arguments.

```sh
pnpm add valibot
```

<Callout kind="new" title="New here: Valibot">

[Valibot](https://valibot.dev) describes data with small composable functions: `v.object({ name: v.string(), count: v.optional(v.number(), 1) })`. `v.safeParse(schema, value)` checks a value and returns either the typed output or a list of issues. It is small because each function is imported separately, so an app pays only for what it uses.

</Callout>

`specOf` reads a Valibot schema's structure to build the `ArgSpec`: unwrapping `optional` (not required, maybe a default), reading `min_value`/`max_value` from a number's pipe, options from a picklist, and any `argMeta(...)` metadata a command attached for the palette:

<Source path="src/fanwit/commands/args.ts" from="function specOf(schema: AnySchema)" to="}" />

Strings arrive from places that only have strings (the command line, a `fanwit://` link, a TOML file), so `coerceArgs` converts them first: `"20"` becomes `20` for a number, `"no"` becomes `false` for a boolean, JSON is parsed:

<Source path="src/fanwit/commands/args.ts" from="export function coerceArgs" to="}" />

Then `validateArgs` checks and fills in defaults, and throws a `FanwitError` that names the argument and what was wrong: *Invalid argument "size" for editor.zoom: must be at most 72.*

<Callout kind="new" title="New here: Object.entries and Object.fromEntries">

`Object.entries(obj)` gives an array of `[key, value]` pairs; `Object.fromEntries(pairs)` builds an object back from them. Together they are the way to map over an object's values: `Object.fromEntries(Object.entries(s.entries).map(([k, e]) => [k, specOf(e)]))` turns every entry of a Valibot object into its `ArgSpec`.

</Callout>

The whole file:

<Source path="src/fanwit/commands/args.ts" />

## Checkpoint

Add `src/fanwit/commands/args.test.ts`:

<Source path="src/fanwit/commands/args.test.ts" />

```sh
pnpm vitest run src/fanwit/commands/args
```

<Check question="The CLI runs editor.zoom --size 20. What reaches the handler?" options={['The string "20"', "The number 20, coerced from the string and checked against min and max", "Nothing: the CLI cannot pass arguments"]} answer={1}>

`coerceArgs` turns the string into the declared type, `validateArgs` checks the range and applies defaults, and only then does the handler run.

</Check>
