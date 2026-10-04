---
title: Tests and the first file
section: "Rebuild: the project"
order: 2
summary: Set up Vitest, agree on the code style, and write FaNWiT's first real file, disposable.ts: the small idea of "something to undo later" that every other file relies on.
---
# Tests and the first file

The first file of FaNWiT's core is 125 lines long and has no visible effect at all. Every other file uses it. It answers one question that a long-running desktop app must get right: when something is set up (a listener, a timer, a registered command), how does it get torn down again?

<Callout kind="why">

FaNWiT loads modules and plugins at run time and can unload them again: turn a plugin off and every command, menu item, key and listener it added must disappear, with no restart. If each kind of registration had its own way of being undone, unloading would be a list of special cases that grows with every feature. Instead, everything that sets something up returns a **disposable**, an object with one method, `dispose()`. Undoing a whole module is then: dispose everything it collected. The specification calls this out as the rule for every API.

</Callout>

## Tests first

The foundation and kernel chapters build code you cannot see yet, so you check it with tests, the way FaNWiT does in CI. Add the test section to `vite.config.ts`:

```ts
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// ...
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		setupFiles: ["vitest.setup.ts"]
	}
});
```

`vitest.setup.ts` runs before the tests. FaNWiT's lets code that fetches its own files (WebAssembly and workers, later) do so under Node:

<Source path="vitest.setup.ts" />

A test file sits next to the code it tests, named `<file>.test.ts`. `pnpm test` runs them all; `pnpm vitest run src/fanwit/kernel` runs one folder; `pnpm vitest` watches and re-runs on save.

## The code style

FaNWiT's conventions (from `AGENTS.md`), which every file in the rebuild follows:

- Tabs for indentation, double quotes, semicolons.
- Explicit types on everything a module exports; let TypeScript infer the rest.
- Svelte 5 runes everywhere. Services are classes with `$state` fields in `.svelte.ts` files.
- Comments say *why*, not *what*. Public API gets a doc comment with an `@example`.
- Errors are `FanwitError(code, { message, hint, docs })` (the errors chapter).

## disposable.ts

Create `src/fanwit/kernel/disposable.ts`. It holds four things.

### Disposable and toDisposable

<Source path="src/fanwit/kernel/disposable.ts" from="export interface Disposable" to="}" />

An interface with one method. Anything with `dispose()` qualifies: TypeScript checks shapes, not names, so a plain object literal is a `Disposable` as much as a class instance is.

<Source path="src/fanwit/kernel/disposable.ts" from="export function toDisposable" to="}" />

`toDisposable` wraps a cleanup function. The `done` flag makes disposing twice harmless, which matters because in a big app something will always dispose twice (a module that unloads while the window that held its view is closing).

<Callout kind="new" title="New here: closures that keep state">

`done` is a local variable of `toDisposable`, yet the returned object keeps using it after `toDisposable` has returned. Each call gets its own `done`, captured by the `dispose` function. This is a **closure** (the same idea as in Rust basics), and it is how JavaScript gives an object private state without a class.

</Callout>

### DisposableStore

<Source path="src/fanwit/kernel/disposable.ts" from="export class DisposableStore" to="}" />

A store collects disposables and disposes them together, **newest first**: what was set up last is torn down first, the way you would take apart a stack. Adding to a store that is already disposed disposes the item at once, so late registrations (a callback that fires after its module stopped) cannot leak. Each module gets one of these as `ctx.subscriptions`.

<Callout kind="new" title="New here: generics that return what they were given">

`add<T extends Disposable>(d: T): T` takes any disposable and returns it **with its own type**, not as a plain `Disposable`. So `const watcher = store.add(new Watcher())` still knows `watcher` is a `Watcher`. `T extends Disposable` is a bound, like `T: Trait` in Rust: anything, as long as it has `dispose()`.

</Callout>

### Emitter

<Source path="src/fanwit/kernel/disposable.ts" from="export type Listener<T>" to="}" />

An **emitter** is the smallest event system: listeners subscribe with `on` and get a disposable back; `fire` calls them all. FaNWiT services use emitters for things like "the settings changed" (`onDidChange`). Two details are deliberate:

- `fire` loops over a copy (`[...this.listeners]`), so a listener that unsubscribes itself while being called (as `once` does) does not upset the loop.
- A listener that throws is logged and the rest still run: one broken plugin's listener must not stop the app's own.

<Callout kind="new" title="New here: an arrow function as a class field">

`on = (fn) => { ... }` is a field holding an arrow function, not a method. Arrow functions keep `this` from where they are written, so `emitter.on` can be passed around on its own (`const subscribe = settings.onDidChange.on`) and still work. A normal method would lose its `this` when detached like that.

</Callout>

### debounce

<Source path="src/fanwit/kernel/disposable.ts" from="export function debounce" />

`debounce(fn, ms)` returns a function that waits until calls stop for `ms` milliseconds, then calls `fn` once with the last arguments. FaNWiT saves files this way: typing in a settings field calls `save` on every key, the disk sees one write. `flush()` runs a pending call now (on shutdown, nothing may be lost) and `cancel()` drops it.

<Callout kind="new" title="New here: functions with properties, rest parameters and ReturnType">

- `call.flush = ...` adds a property to a function. Functions are objects in JavaScript, so the returned `call` is both callable and has methods.
- `...a: A` is a **rest parameter**: any number of arguments, collected into an array. With `A extends unknown[]`, the debounced function keeps the exact parameter types of `fn`.
- `ReturnType<typeof setTimeout>` asks TypeScript for the type `setTimeout` returns. It differs between browsers (`number`) and Node (a `Timeout` object), and this works in both.

</Callout>

The whole file:

<Source path="src/fanwit/kernel/disposable.ts" />

## The test

Create `src/fanwit/kernel/disposable.test.ts`:

<Source path="src/fanwit/kernel/disposable.test.ts" />

Note `vi.useFakeTimers()`: the debounce test does not wait 100 real milliseconds, it moves a fake clock forward. Tests stay fast and never flaky.

## Checkpoint

```sh
pnpm vitest run src/fanwit/kernel
```

Five tests pass. You have the pattern every later chapter uses: set something up, get a disposable back, and trust that disposing it undoes it completely.

<Check question="A module registers three commands and a listener, then is turned off. How does FaNWiT remove all four?" options={["It keeps a list per kind of thing and removes each kind separately", "Each registration returned a disposable, collected in the module's store; disposing the store undoes all of them, newest first", "It reloads the page"]} answer={1}>

That is the whole design: every setup returns a disposable, a module's disposables live in its `DisposableStore` (`ctx.subscriptions`), and turning the module off disposes the store.

</Check>
