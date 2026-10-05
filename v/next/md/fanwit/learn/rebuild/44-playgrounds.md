# Playgrounds and labs

Every chapter of this manual with something to try has a playground: an editor and a **Run** button, with a result next to it. This chapter builds them: `manual/components/Playground.svelte`, the runners in `manual/playground/`, and `Lab.svelte`, the exercise around a playground.

<Callout kind="why">

Reading code teaches less than changing it. A playground in the page removes every step between "I wonder what happens if…" and the answer: no project to create, no install, no switching windows. Each runner uses what is already there: the Svelte compiler the app is built with, the kernel you rebuilt, and the Rust Playground the Rust project runs. Nothing extra has to be installed, and nothing typed into a playground can touch the app.

</Callout>

## The component

<Source path="src/fanwit/manual/components/Playground.svelte" />

A playground is written in a page as fenced code blocks inside `<Playground>`. Each block is a file, named with `file="Name.svelte"` after the language, and the `mode` picks the runner. The component:

- shows the files as tabs in a **CodeMirror 6** editor, loaded only when a playground scrolls into view;
- runs on **Run** or Ctrl+Enter, with **Reset** back to the original code;
- keeps your edits under the playground's stable `id`, so they survive a reload or a retitled page;
- reports each run's output to the surrounding lab, if there is one.

<Source path="src/fanwit/manual/playground/editor.ts" />

The editor's colours are CSS variables from `reading.css`, so code reads well in all nine reading themes, and Tab indents (`indentWithTab`) instead of leaving the editor. Escape then Tab leaves it, the CodeMirror convention for keyboard users.

## Runners

### Svelte

<Source path="src/fanwit/manual/playground/run-svelte.ts" />

The Svelte runner compiles every file with `svelte/compiler`, **in the browser**, the same compiler Vite uses at build time. `.svelte` files go through `compile`, and `.svelte.js` and `.svelte.ts` files (runes outside components) through `compileModule`. Each compiled file becomes a module behind a `blob:` URL, and imports between them (`./Badge.svelte`) are rewritten to those URLs. Imports of `svelte` itself point at the app's own copy, so the component shares the app's Svelte runtime. The first file is mounted into the preview.

<Callout kind="new" title="New here: blob URLs and dynamic import">

`URL.createObjectURL(new Blob([code], { type: "text/javascript" }))` turns a string into a URL like `blob:http://localhost:3001/…`, and `await import(url)` runs it as a real ES module. That is how code typed into a page becomes something the browser can import, with no server. Each URL is revoked after use with `URL.revokeObjectURL`, so repeated runs do not leak memory. The content security policy allows `blob:` scripts for exactly this (chapter 31).

</Callout>

### JavaScript and TypeScript

<Source path="src/fanwit/manual/playground/run-script.ts" />

JavaScript and TypeScript run as the script of an invisible Svelte component. That is a shortcut: the Svelte compiler strips TypeScript types, so no TypeScript compiler has to be downloaded. `console.log` inside it is captured and shown in the output, values are printed as JSON (with `undefined` and `BigInt` handled), and top level `await` works.

<Playground mode="ts" id="rebuild-44-ts" title="TypeScript in the page" height={200}>

```ts
type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };

const area = (s: Shape): number => (s.kind === "circle" ? Math.PI * s.r ** 2 : s.side ** 2);

console.log(area({ kind: "circle", r: 2 }).toFixed(2));
console.log(area({ kind: "square", side: 3 }));
```

</Playground>

### Rust

<Source path="src/fanwit/manual/playground/run-rust.ts" />

Rust cannot compile in the browser without downloading a whole toolchain. Instead, the code is sent to the official **Rust Playground** (`play.rust-lang.org`), which accepts calls from any page, and its output comes back. Code with `#[test]` functions and no `main` runs its tests, as `cargo test` would. Cargo's own progress lines are filtered out, so the output is about your code. Only the standard library is available there, which is why the Rust basics chapters use only `std`, and why Tauri code in this manual is shown rather than run.

### FaNWiT modules

<Source path="src/fanwit/manual/playground/run-module.ts" />

<Source path="src/fanwit/manual/playground/run-kernel.ts" />

A module playground runs a real `defineModule` (chapter 13). The **kernel** mode gives it a kernel of its own, from `createTestKernel` (chapter 30) on the memory host, so the lesson can show exactly what the module did: the commands it added (each with a Run button), the context keys it set, and a trace of every event and command run. Nothing reaches the app. The **module** mode registers the module in the running app instead, where its commands appear in the real palette, and **Stop** unregisters it, disposing everything it contributed. On the docs site, a module playground quietly becomes a kernel playground: a reader's module never joins the docs site's own kernel, where it could bring back commands the site removed (chapter 43).

<Playground mode="kernel" id="rebuild-44-kernel" title="A module in its own kernel" height={260}>

```js
export default defineModule({
	id: "greeter",
	contributes: {
		commands: [{ id: "greeter.hello", title: "Say hello", args: { name: { type: "string", default: "world" } } }]
	},
	activate(ctx) {
		ctx.commands.handle("greeter.hello", ({ name }) => {
			ctx.context.set("greeter.last", name);
			ctx.events.emit("greeter.greeted", name);
			return `Hello, ${name}!`;
		});
	}
});
```

</Playground>

Run it, then press the command's button: the trace shows the run, the event and the result, and the context key appears in the side panel.

## Labs

<Source path="src/fanwit/manual/components/Lab.svelte" />

A **lab** is an exercise: a goal, steps, a playground, and an `expect` string. Each run reports its output to the lab through Svelte context, and when the output contains what the lab expects, the lab is marked done. That is saved in the manual's state (chapter 43) and counts toward the level's progress. Labs do not grade style, only results: any code that produces the right output passes.

<Callout kind="new" title="New here: context between a component and its children">

`Lab` calls `setContext(LAB, { report, expect })`, and a `Playground` inside it calls `getContext(LAB)` and, if there is one, reports its output there. The two never import each other's internals. A playground outside a lab simply finds no context and reports nowhere. This is the same mechanism as `getKernel` (chapter 26), used between two components of a page.

</Callout>

## Checkpoint

<Source path="src/fanwit/manual/playground/playground.test.ts" />

```sh
pnpm vitest run src/fanwit/manual/playground
```

Then open any Svelte basics chapter and complete a lab: its card turns green, and the page's progress counts it.

<Check question="A reader on the docs site runs a module playground that registers a command app.quit. What happens to the docs site?" options={["The docs site quits", "Nothing outside the playground: on the docs site, module code runs in a sandbox kernel of its own", "The command replaces the app's quit command"]} answer={1}>

The docs site uses the kernel mode: `createTestKernel` makes a fresh kernel on the memory host for each run. The module's commands exist only there, shown in the playground's side panel, and the docs site's own kernel never sees them.

</Check>
