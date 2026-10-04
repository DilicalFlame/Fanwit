---
title: Errors that teach, and the logger
section: "Rebuild: foundations"
order: 4
summary: One error type with a stable code, a hint and a docs link, so every failure tells the reader what to do; and one logger with scopes, levels, structured fields and redaction.
---
# Errors that teach, and the logger

Two small files that every later file uses: `errors.ts`, which defines how FaNWiT fails, and `logger.ts`, which defines how it reports what it is doing. Both look trivial; both encode a decision that is expensive to change later.

<Callout kind="why">

"Something went wrong" helps nobody. The specification asks that every error FaNWiT raises answers three questions: **what** happened (a message), **what to do** about it (a hint), and **where to read more** (a docs link), plus a stable **code** that programs can test (`if (e.code === "CANCELLED")`) and the CLI can turn into an exit code. When every failure is the same shape, one notification can show any of them properly, with an "Open docs" button.

</Callout>

## FanwitError

Create `src/fanwit/kernel/errors.ts`:

<Source path="src/fanwit/kernel/errors.ts" from="export interface FanwitErrorInit" to="}" />

<Source path="src/fanwit/kernel/errors.ts" from="export class FanwitError extends Error" to="}" />

<Callout kind="new" title="New here: extending Error, readonly, and error causes">

- `class FanwitError extends Error` makes a subclass: it is an `Error` (it has a stack trace, `instanceof Error` is true) with more fields. `super(...)` calls the parent's constructor first.
- `readonly code: string` can be set in the constructor and never again.
- `super(message, { cause })` records the error that caused this one. Wrapping a low-level error (`ENOENT` from the disk) in a FanwitError keeps the original for debugging.
- `toJSON()` decides what `JSON.stringify(error)` produces. Plain errors serialise as `{}`; this one crosses windows, workers and the CLI with its code and hint intact.

</Callout>

An error that crosses into a worker or another window arrives as a copy: still named `"FanwitError"`, but no longer an instance of the class, so `instanceof` fails. `isFanwitError` checks the name too:

<Source path="src/fanwit/kernel/errors.ts" from="export function isFanwitError" to="}" />

<Callout kind="new" title="New here: type predicates">

`(e: unknown): e is FanwitError` is a **type predicate**: when the function returns `true`, TypeScript treats `e` as a `FanwitError` afterwards. So after `if (isFanwitError(e))`, `e.code` type-checks. It is how you write your own narrowing checks, like the built-in `typeof x === "string"`.

</Callout>

`toFanwitError` turns anything thrown (an `Error`, a string, a number) into a FanwitError, and `exitCodeFor` maps codes to the exit codes the CLI promises (2 for bad arguments, 3 for a disabled command, 130 for cancelled, like Ctrl+C in a shell).

<Source path="src/fanwit/kernel/errors.ts" />

## The logger

A desktop app runs for hours and fails on someone else's machine. Logs are how you find out what happened, so they must be structured enough to search, cheap when switched off, and safe to share.

<Source path="src/fanwit/kernel/logger.ts" from="export interface LogRecord" to="}" />

Every log line becomes a record: a level, a **scope** (`vault`, `layout`, `plugins.word-count`), a message, optional structured fields, and whether it came from the page or from Rust. The service keeps the last 5000 in memory (a **ring buffer**) for the Log Viewer, and forwards each to the host, which on the desktop writes them to a log file.

Three details matter:

- **Levels per scope.** `log.levels = { layout: "trace" }` turns on detail for one area without drowning in the rest. `enabled()` checks before any work is done, so disabled logging is nearly free.
- **Redaction.** Before a message is stored, the home folder becomes `~` and anything that looks like `token=...` or `password: ...` becomes `***`. Logs end up in bug reports; they must not leak secrets.
- **Fields.** `log.info("saved", { path, ms })`: a trailing plain object becomes fields, so the Log Viewer can show and filter them.

<Source path="src/fanwit/kernel/logger.ts" from="	private redact(t: string)" to="	}" />

<Callout kind="new" title="New here: Omit, Record and regex replacement groups">

- `Omit<LogRecord, "id" | "time">` is a built-in type: `LogRecord` without those fields. `push` takes everything except what it fills in itself.
- `Record<LogLevel, number>` is an object whose keys are exactly the log levels, each with a number: TypeScript complains if a level is missing.
- In `.replace(/\b(token|password|...)(["'\s:=]+)([^\s"',}]+)/gi, "$1$2***")`, `$1` and `$2` in the replacement put back what the first two groups matched; only the third group, the secret, is replaced. `\b` means a word boundary, and the `i` flag ignores case.

</Callout>

`ScopedLogger` is what code holds: `const log = logs.scoped("vault")`, then `log.warn(...)`. Its methods are arrow-function fields (like the emitter's `on`), so they can be passed around detached.

<Source path="src/fanwit/kernel/logger.ts" />

<Callout kind="new" title="New here: a module-level singleton">

The last lines create `logs` once, when the module first loads, and export it. Every file that imports it gets the same object. FaNWiT uses a few of these for things that are truly one per process (the log service); everything per window lives in the kernel instead, as you will see.

</Callout>

The logger uses `stacktrace-js` to find the calling file and line in development:

```sh
pnpm add -D stacktrace-js
```

## Checkpoint

Add `src/fanwit/kernel/errors.test.ts`:

<Source path="src/fanwit/kernel/errors.test.ts" />

```sh
pnpm vitest run src/fanwit/kernel
```

<Check question="An error thrown in a plugin worker reaches the main window. Why does FaNWiT check e.name as well as instanceof?" options={["instanceof is slow", "Messages between threads are copies: the copy is not an instance of the class, but its name survives", "Workers rename errors"]} answer={1}>

`postMessage` copies the data, not the class. `isFanwitError` recognises the copy by its name, and `toJSON` made sure its code and hint came along.

</Check>
