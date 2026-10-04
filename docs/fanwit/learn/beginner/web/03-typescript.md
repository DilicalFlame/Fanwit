---
title: TypeScript
section: Web basics
order: 3
summary: JavaScript with types. How to read and write the types in FaNWiT's code, and why its modules spell them out.
---
# TypeScript

**TypeScript** is JavaScript plus **types**: notes in the code that say what kind of value each variable, parameter and result is. The types are checked before the program runs and then removed, so what runs is plain JavaScript. FaNWiT's `.ts` files and the `<script lang="ts">` of its components are TypeScript.

<Callout kind="why">

FaNWiT has hundreds of files that call each other. Without types, renaming a field or passing the wrong argument fails only when that line runs, maybe weeks later and in front of a user. With types, `pnpm check` lists every place the change breaks, at once, and your editor completes names and shows what a function expects as you type. The conventions ask for explicit types at module boundaries (what a file exports) for this reason: they are the contract other files are checked against.

</Callout>

## Writing types

A type follows a colon. Most of the time TypeScript works types out by itself (`const n = 3` is a `number`), so you write them where values enter or leave: parameters, results, and exported things.

<Playground mode="ts" id="web-3-basics" title="Types" height={260}>

```ts
const title: string = "Save note";
const count: number = 3;
const open: boolean = false;
const ids: string[] = ["notes.save", "notes.delete"];

function label(text: string, keys?: string): string {
	// keys? means it may be left out; then it is undefined
	return keys ? `${text} (${keys})` : text;
}

console.log(label(title, "Ctrl+S"));
console.log(label(title));
console.log(ids.length + count);
```

</Playground>

Try passing `label(42)`: your editor, and `pnpm check` in the project, would mark it as an error. (This playground only removes the types and runs the code, so it is your editor in the real project that catches mistakes.)

## Describing objects

An `interface` (or a `type`) names the shape of an object. FaNWiT describes every kind of data this way; here is a simplified version of how a command is described in `src/fanwit/commands/types.ts`:

<Playground mode="ts" id="web-3-shapes" title="Shapes" height={300}>

```ts
interface CommandDefinition {
	id: string;
	title: string;
	category?: string;          // optional
	when?: string;              // optional: when the command is available
}

type Source = "palette" | "key" | "menu";   // one of these three strings, nothing else

function describe(c: CommandDefinition, from: Source): string {
	return `${c.title} [${c.id}] from the ${from}${c.when ? `, only when ${c.when}` : ""}`;
}

const save: CommandDefinition = { id: "notes.save", title: "Save note", when: "editorFocus" };
console.log(describe(save, "key"));
console.log(describe({ id: "app.about", title: "About" }, "menu"));
```

</Playground>

`"palette" | "key" | "menu"` is a **union**: the value is one of those. Unions of strings replace error-prone magic strings: misspell `"pallete"` and the check fails.

## Generics: types with a blank

Some functions work for any type and keep track of which one. `Array<string>` is an array of strings; a function can take a type the same way. You will mostly *read* these, in signatures like `settings.get<number>("ui.fontSize")`, which means "this setting is a number".

<Playground mode="ts" id="web-3-generics" title="Generics" height={220}>

```ts
function first<T>(items: T[]): T | undefined {
	return items[0];
}

const n = first([3, 1, 2]);          // T is number, so n is number | undefined
const s = first(["a", "b"]);         // T is string
console.log(n, s, first([]));
```

</Playground>

<Lab id="web-3-setting" title="Type a setting" expect="ui.fontSize = 16 (number)">

Write an interface `Setting` with a `key` (string), a `value` that is a `number` or a `string`, and an optional `description`. Make `show` accept a `Setting` and return a line like the goal, using `typeof setting.value` for the kind. Then log `show` of a font size setting of 16.

<Playground mode="ts" id="web-3-setting" title="A setting" height={260}>

```ts
// interface Setting { ... }

function show(setting) {
	return "";
}

console.log(show({ key: "ui.fontSize", value: 16 }));
```

</Playground>

<details>
<summary>Show a solution</summary>

```ts
interface Setting {
	key: string;
	value: number | string;
	description?: string;
}

function show(setting: Setting): string {
	return `${setting.key} = ${setting.value} (${typeof setting.value})`;
}
```

</details>

</Lab>

## What you will see in FaNWiT

- `import type { Kernel } from "..."`: imports only a type, which disappears when the types are removed.
- `value as HTMLElement`: "trust me, it is this type". Use it rarely; it switches the check off for that value.
- `Record<string, number>`: an object whose keys are strings and values numbers.
- `unknown`: a value of no known type, which must be checked before use. Safer than `any`, which turns checking off.

<Check question="Why does FaNWiT ask for explicit types on what a module exports?" options={["The code runs faster with types", "Other files are checked against them, so a change that breaks a caller is found by pnpm check, not by a user", "Svelte cannot compile without them"]} answer={1}>

Types are removed before the code runs, so they do not change speed. Their value is the check: exported types are the contract every importing file is checked against.

</Check>

<Callout kind="learn-more">

The [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html), especially [everyday types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html), and the official [playground](https://www.typescriptlang.org/play) shows errors as you type. Svelte's own [TypeScript page](https://svelte.dev/docs/svelte/typescript) covers types in components.

</Callout>
