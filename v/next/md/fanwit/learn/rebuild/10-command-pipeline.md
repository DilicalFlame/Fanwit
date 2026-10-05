# Commands II: the pipeline

With commands described as data, this chapter builds what runs them: `commands/registry.svelte.ts`, the **command service**, and `commands/history.svelte.ts`, undo and redo. Whatever triggers a command, a key, a menu, the palette, the CLI, a test, the call goes through one function, `run`, and the same seven steps.

<Callout kind="why">

If every caller checked `when`, validated arguments and recorded undo on its own, the palette would forget one check and the CLI another. One pipeline means every guarantee holds everywhere: a disabled command is disabled for keys and scripts alike, every run is logged, and anything undoable from a menu is undoable from a shortcut.

</Callout>

## The steps

Step through it; each stage lights up the part of the code that does it:

<CommandPipeline />

## Declaring and handling

<Source path="src/fanwit/commands/registry.svelte.ts" from="	declare(def: CommandDefinition, owner: string)" until="	/** Drop every command" />

`declare` stores the definition with its **owner** (the module id) and returns a disposable that removes it again; a different module declaring the same id is an error, with a hint about prefixing ids. `handle` attaches the code later. Keeping the two apart is what lets FaNWiT list every command at startup while loading each module's code only when one of its commands is first used. `version` is bumped on every change, the same reactive counter pattern as context keys, so an open palette updates when a module registers a command.

`prune` removes commands outright (the docs site uses it to drop app commands), and `intercept` registers a function that wraps every run whose id matches a pattern:

<Source path="src/fanwit/commands/registry.svelte.ts" from="function globToRegExp" to="}" />

<Callout kind="new" title="New here: escaping text for a RegExp">

To turn a glob like `notes.*` into a regular expression, every character that means something in a regex (`.`, `+`, `(`, ...) must be escaped first, so `.` matches a literal dot: that is the `replace(/[.+^${}()|[\]\\]/g, "\\$&")` (`$&` is "the whole match"). Only then does `*` become `.*`, "anything". The `^...$` anchors make the pattern match the whole id.

</Callout>

## run

<Source path="src/fanwit/commands/registry.svelte.ts" from="	async run<R = unknown>" until="		// 2. enablement" />

**1. Resolve.** Find the entry (following deprecated aliases). If it has no handler yet, fire the activation event `onCommand:<id>`: the module that owns it loads and registers its handler, and the lookup is tried again.

<Source path="src/fanwit/commands/registry.svelte.ts" from="		// 2. enablement" until="		// 3. arguments" />

**2. Check `when`.** Against a snapshot of the context keys taken now, from the focused element (or the menu's target). A failing clause becomes an error that says which part failed.

**3. Arguments.** Coerce strings, and if something required is missing: when the call is **interactive** (it came from the palette, a menu or a key, so a person is there), ask for it through the palette's prompt; otherwise fail with the flags to pass. Then validate.

**4. Confirm.** Commands with `confirm` ask first, styled as destructive with `danger`.

<Source path="src/fanwit/commands/registry.svelte.ts" from="		// 5. interceptors, then the handler" until="		// 6. history" />

**5. Interceptors, then the handler.** The matching interceptors form a chain: each receives the call and a `next` function, and may change the arguments, log, refuse, or call `next()` to continue. The last `next` calls the handler. This is the same middleware pattern as in web servers, and it is how the docs site, a macro recorder or a plugin can observe or veto commands without touching any of them.

<Callout kind="new" title="New here: a recursive dispatch chain">

`const dispatch = (i) => i >= chain.length ? callHandler() : chain[i].fn(call, () => dispatch(i + 1))` builds the chain without a loop: interceptor `i` gets a `next` that dispatches to `i + 1`, and past the end is the handler. If an interceptor never calls `next`, nothing after it runs.

</Callout>

**6. History.** If the result is an undo record, push it. Without its own `redo`, redo runs the handler again with the same arguments.

**7. Record.** Every run, successful or not, is logged, counted for ranking and announced on `onDidExecute`, which the command log and the macro recorder listen to.

### Ranking by use

The palette lists commands you use often first. A plain counter would favour what you used a lot a year ago, so the score **decays**: it halves every week without use.

<Source path="src/fanwit/commands/registry.svelte.ts" from="	frecencyScore(id: string" to="	}" />

The whole service:

<Source path="src/fanwit/commands/registry.svelte.ts" />

## Undo and redo

<Source path="src/fanwit/commands/history.svelte.ts" from="	push(rec: UndoRecord" until="	canUndo(scope?: string)" />

Two stacks, undo and redo, per **scope** (each document can have its own history; otherwise one per window). A new action clears the redo stack, as in every editor. `transaction(label, fn)` collects everything pushed while `fn` runs into one step: renaming a note and fixing the links to it is one undo, not twenty.

<Callout kind="new" title="New here: try ... finally with await">

In `transaction`, the `finally` block runs whether `fn` succeeded or threw, so the transaction is always closed. `return await fn()` (rather than `return fn()`) matters here: it keeps the function inside the `try` until the promise settles, so `finally` runs after the work is done, not before.

</Callout>

<Source path="src/fanwit/commands/history.svelte.ts" />

## Checkpoint

The repository's own command tests need the kernel (two chapters away). This test builds the service from its parts; add `src/fanwit/commands/registry.test.ts`:

<Source path="src/fanwit/commands/registry.test.ts" />

```sh
pnpm vitest run src/fanwit/commands
```

<Check question="A key press runs a command whose argument is missing. What happens?" options={["The handler runs with undefined", "A key press is interactive, so the palette asks for the argument; a script would get CMD_ARGS_MISSING instead", "The key is ignored"]} answer={1}>

Interactive sources (palette, menu, key, toolbar, notification) may prompt. Scripts, the CLI and code fail with an error that lists the missing flags.

</Check>
