# Context keys

A when clause is only half the story; the other half is the values it reads. **Context keys** are named values that describe the situation right now: `vault.open`, `inputFocus`, `resource.ext`, `selection.count`, `window.kind`. This chapter builds the service that holds them, `kernel/context.svelte.ts`, FaNWiT's first file with Svelte runes outside a component.

<Callout kind="why">

The same key can mean different things in different parts of the window: `selection.count` in the file explorer is the number of selected files, in the editor the number of cursors. So keys have **scopes**: a global value, and values that hold only inside one element. Evaluating a clause for a key press or a right click starts at the element that was focused or clicked and walks up the page, so the nearest scope wins (Section 4.5).

</Callout>

```tikz caption="A lookup starts at the focused element and walks up: the nearest value wins" alt="A focused list item inside a list inside the explorer view inside the window; the list sets selection.count 2, the window holds vault.open true; the lookup walks from the item upward"
\begin{tikzpicture}[x=1mm,y=1mm,
  scope/.style={draw=fwInk!40,rounded corners=3pt,fill=#1}]
\draw[scope=fwPaper] (0,0) rectangle (110,46);
\node[anchor=north west,font=\scriptsize\ttfamily,text=fwSlate] at (2,45) {global: vault.open = true, window.kind = "main"};
\draw[scope=fwAccentSoft!70] (6,4) rectangle (104,38);
\node[anchor=north west,font=\scriptsize\ttfamily,text=fwAccent!80!black] at (8,37) {explorer view: view.focused = "explorer"};
\draw[scope=fwBrandSoft] (12,8) rectangle (98,30);
\node[anchor=north west,font=\scriptsize\ttfamily,text=fwBrand] at (14,29) {use:ctxkeys: selection.count = 2};
\node[fwnode,fwuser,font=\scriptsize] (item) at (55,15) {\faIcon{mouse-pointer}\ the focused row};
\draw[fwarrow,fwBrand] (item.north) -- ++(0,13) node[fwlabel,right,pos=0.4]{lookup walks up};
\end{tikzpicture}
```

## The service

<Source path="src/fanwit/kernel/context.svelte.ts" from="export class ContextKeyService" until="	get<T = unknown>(key: string)" />

Values live in a plain `Map`. `set` ignores a value that did not change, and `undefined` deletes the key. `bind` sets a key for as long as a disposable lives: `ctx.subscriptions.push(context.bind("notes.editing", true))`, and the key disappears when the module stops.

### Why version is $state

<Source path="src/fanwit/kernel/context.svelte.ts" from="	bump(keys: string[] = [])" to="	}" />

The `Map` is not reactive: Svelte does not see changes inside it. Instead the service has one reactive number, `version`, bumped on every change. A component that evaluates a clause reads `version` first:

```ts
const enabled = $derived((void k.context.version, k.context.evaluate(cmd.when)));
```

Now whenever any key changes, `version` changes, and every `$derived` that read it re-evaluates its clause. One counter, instead of making every key reactive, keeps it cheap.

<Callout kind="new" title="New here: untrack, and $state in a class">

- `version = $state(0)` in a class makes that field reactive, the pattern of every FaNWiT service (see *Effects and shared state*). This only works in a `.svelte.ts` file, because the Svelte compiler must see the rune.
- `untrack(() => this.version)` reads `version` **without subscribing** to it. If an effect called `bump` while tracking, it would read `version`, then change it, which would re-run the effect, which would bump again: an infinite loop. Reading through `untrack` breaks it. AGENTS.md makes this a rule: bump version counters with `untrack`.
- `(void a, b)` evaluates `a` (here only to subscribe), throws its value away, and gives `b`: a compact way to say "depend on this, compute that".

</Callout>

### Lookups that walk the page

<Source path="src/fanwit/kernel/context.svelte.ts" from="	lookup(el?: Element | null" until="	configLookup?:" />

A lookup collects the scopes from the element up to the root first, then returns a function that checks, in order: values passed for this one evaluation (`extra`, used for context menus, which know what was right-clicked), the scopes from nearest to farthest, settings (`config.editor.wrap` reads the setting `editor.wrap`), and finally the global map. The scopes themselves are stored on the DOM elements, set by an action:

<Source path="src/fanwit/kernel/context.svelte.ts" from="export function ctxkeys(node: Element" to="}" />

<Callout kind="new" title="New here: extending a DOM type">

`type Scoped = Element & { __fwctx?: Record<string, unknown> }` describes an element that may carry an extra property. The action writes `node.__fwctx = keys`; the lookup reads it while walking `parentElement`. Storing data on the element itself means the scope goes away when the element does, with nothing to clean up.

</Callout>

### Keys that follow the page

`trackDom` keeps three built-in keys current: `inputFocus` (typing in a text field, so single-letter shortcuts must not fire), `textSelected` and `window.focused`. Note `queueMicrotask`: focus events can fire while Svelte is in the middle of removing elements, so the update waits until the current work finishes.

The whole file:

<Source path="src/fanwit/kernel/context.svelte.ts" />

## Checkpoint

Add `src/fanwit/kernel/context.test.ts`:

<Source path="src/fanwit/kernel/context.test.ts" />

```sh
pnpm vitest run src/fanwit/kernel
```

The runes work in tests too: Vitest compiles `.svelte.ts` files with the Svelte plugin from `vite.config.ts`.

<Check question="A menu item's when clause should update the moment vault.open changes. What makes the component re-check it?" options={["The Map of values is reactive", "Reading k.context.version inside the $derived: every change bumps it, so the derived value recomputes", "A setInterval polling the keys"]} answer={1}>

Only `version` is reactive. Any component that reads it before evaluating a clause re-evaluates on every change, and evaluating is cheap because the clause was compiled once.

</Check>
