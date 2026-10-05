# The kernel and modules

Everything so far is a part on a shelf: a command service, a key service, context keys, an event bus, a lifecycle, a service registry, a host. The **kernel** is what puts them together, one per window, and **modules** are how every feature, FaNWiT's own and yours, plugs in. Four files that need each other, written together: `kernel/kernel.svelte.ts`, `kernel/module.ts`, `kernel/modules.svelte.ts` and `kernel/context-api.ts`.

<Callout kind="why">

Apps slow down as they grow because every feature's code loads at startup. FaNWiT's rule (Section 4.1) is **declare first, load later**: a module states what it adds (its commands, views, menus, settings) as plain data, which costs almost nothing to read, and its code loads only when something needs it, the first time one of its commands runs or one of its views opens. And a module never touches the kernel's internals: it gets a **ctx** that records everything it registers, so turning it off undoes all of it.

</Callout>

```tikz caption="A module's life: its data is read at once, its code only when needed, and its ctx undoes everything" alt="Registered: contributions applied. An activation event fires: the code loads and activate(ctx) runs: active. Deactivate: ctx disposed, back to idle. A failure leads to failed."
\begin{tikzpicture}[x=1mm,y=1mm,
  st/.style={fwnode,text width=30mm,minimum height=13mm,font=\small},
  ar/.style={fwarrow},
  lb/.style={fwlabel,fill=white,inner sep=1pt}]
\node[st,fill=fwPaper,draw=fwSlate] (reg) at (0,0) {\textbf{registered}\\[1pt]{\scriptsize contributions applied: commands, keys, views are listed}};
\node[st,fwwarm] (act) at (48,0) {\textbf{activating}\\[1pt]{\scriptsize code loads, \texttt{activate(ctx)} runs}};
\node[st,fwuser] (on) at (96,0) {\textbf{active}\\[1pt]{\scriptsize handlers registered through ctx}};
\node[st,fill=fwRedSoft,draw=fwRed] (bad) at (48,-24) {\textbf{failed}\\[1pt]{\scriptsize logged, the rest of the app runs}};
\draw[ar] (reg) -- node[lb,above=1mm]{event: \texttt{onCommand:notes.save}} (act);
\draw[ar] (act) -- (on);
\draw[ar,fwRed] (act) -- (bad);
\draw[ar] (on.north) to[bend right=28] node[lb,above]{deactivate: \texttt{ctx} disposed} (reg.north);
\end{tikzpicture}
```

## A module, as data

<Source path="src/fanwit/kernel/module.ts" from="export interface ModuleDefinition" to="}" />

Everything under `contributes` is data the app reads at boot. `activate` is either the function itself, or a **loader**, `() => import("./activate")`, which keeps the code in a separate file that Vite only downloads when the loader is called.

<Source path="src/fanwit/kernel/module.ts" from="export function defineModule" until="export function implicitEvents" />

`defineModule` does nothing at run time; it exists to give your editor the types while you write a module.

<Callout kind="new" title="New here: const type parameters">

`defineModule<const M extends ModuleDefinition>(m: M): M` keeps the **exact** type of what you pass, as if you had written `as const`: the command ids stay as their literal strings instead of widening to `string`. Later code can use those literals, for example to check that a keybinding names a command the module really declares.

</Callout>

### Activation events

<Source path="src/fanwit/kernel/module.ts" from="export function implicitEvents" />

<Source path="src/fanwit/kernel/module.ts" />

A module is activated by **events**: strings like `onCommand:notes.save`, `onView:notes.editor`, `onStartup`, `onVault`. It does not have to list the obvious ones: declaring a command implies `onCommand:<id>`, declaring a view implies `onView:<id>`. Patterns with `*` match families of events (`onVaultFile:*.md`).

## The module registry

### Contribution points

The registry does not know what a "command" or a "menu" is. Systems teach it, by defining a **contribution point**: a function that receives one module's list for a key and returns what undoes it.

<Source path="src/fanwit/kernel/modules.svelte.ts" from="	definePoint(key: string" until="	register(def: ModuleDefinition)" />

So `contributes.commands` works because the kernel defines a `"commands"` point that declares each one; later, the layout system will define `"views"`, the menu system `"menus"`, and so on. A point defined after some modules registered is applied to them retroactively, so the order systems start in does not matter. The `Contributions` interface is extended by declaration merging, like `Events`, so `contributes` is typed for every point.

<Callout kind="new" title="New here: Partial and index signatures">

`contributes?: Partial<Contributions> & Record<string, unknown>`: `Partial<T>` makes every property of `T` optional (a module contributes to some points, not all), and `Record<string, unknown>` allows keys no system knows yet, which are applied when a system defines them.

</Callout>

### Activation

<Source path="src/fanwit/kernel/modules.svelte.ts" from="	async fire(event: string" until="	async deactivate(id: string)" />

`fire(event)` activates every idle module whose events match. `activate` makes sure each module activates **once**, even if two events arrive at the same moment (the `pending` map holds the one promise in progress), then:

1. tells a loader from an activate function by its parameter count (`fn.length === 0`: a loader takes none), and loads the code;
2. creates the module's **ctx** and calls `activate(ctx)`;
3. times it against the 50 ms budget, and warns when a module is slow to start;
4. on failure, marks the module `failed` and logs it: one broken module never takes the app down.

`sticky` events (`onStartup`, `onVault`) are remembered, so a module registered later, like a plugin installed while the app runs, still activates on them.

<Callout kind="new" title="New here: Function.length">

A function's `length` is the number of parameters it declares. `activate(ctx) {}` has length 1; `() => import("./activate")` has length 0. The registry uses that to accept both forms without a flag. (Parameters with defaults or rest parameters do not count, so FaNWiT's convention is to always write `ctx` plainly.)

</Callout>

<Source path="src/fanwit/kernel/modules.svelte.ts" />

## The kernel

<Source path="src/fanwit/kernel/kernel.svelte.ts" from="	constructor(o: KernelOptions)" until="	/** Register a system's ctx facade" />

The constructor wires the parts: the event bus gets the host, the history its scope (the `history.scope` context key, so each document can have its own undo stack), the command service its dependencies (activation goes through the module registry), and the key service the command service. It sets the first context keys from the host (`platform`, `window.kind`, and every capability as `host.<name>`), and defines the first three contribution points: `commands`, `keybindings` and `contextKeys`.

### ctx: everything a module may do, attributed

<Source path="src/fanwit/kernel/kernel.svelte.ts" from="	createContext(owner: string)" until="			/** Bind keys at runtime" />

`createContext(owner)` builds the object a module receives. Every method that registers something goes through `track`, which adds the disposable to this module's store, and passes the module's id as owner. So `ctx.commands.handle(...)` both registers the handler and remembers to remove it; when the module deactivates, `disposeContext` disposes the store and everything it registered is gone.

Systems built later add their own parts to `ctx` (`ctx.layout`, `ctx.notify`, `ctx.settings`) with `k.extend(factory)`; each factory gets the same owner and store, so their registrations clean up the same way.

<Callout kind="new" title="New here: WeakMap, Object.assign and indexed access types">

- `contexts = new WeakMap<object, DisposableStore>()` maps each ctx to its store. A **WeakMap** does not keep its keys alive: when nothing else references a ctx, the entry can be garbage collected with it.
- `Object.assign(full, f(this, owner, subs))` copies the properties a system returns onto the ctx.
- `Parameters<HistoryService["push"]>[0]` is "the type of the first parameter of `HistoryService.push`": `T["key"]` reads a property's type, and `Parameters<F>` gives a function's parameter types as a tuple. The ctx stays in step with the services it wraps without repeating their types.

</Callout>

### The ctx type

<Source path="src/fanwit/kernel/context-api.ts" from="export interface ModuleContext" />

<Source path="src/fanwit/kernel/context-api.ts" />

`ModuleContext` is not written by hand: it **is** whatever `createContext` returns, `ReturnType<Kernel["createContext"]>`. Add a method to the factory and every module sees it, with its type, immediately. This is the one place the four files need each other: the kernel uses `ModuleDefinition`, modules use `ModuleContext`, and `ModuleContext` is defined by the kernel. TypeScript is fine with that because these are type-only imports.

<Callout kind="new" title="New here: KernelSystems and k.sys">

`readonly sys = {} as KernelSystems` starts empty and is typed by declaration merging: the settings system adds `interface KernelSystems { settings: SettingsService }`, and from then on `k.sys.settings` is typed. `as KernelSystems` tells TypeScript to trust that the slots will be filled at boot, which `boot.svelte.ts` does in stage 5.

</Callout>

The whole kernel:

<Source path="src/fanwit/kernel/kernel.svelte.ts" />

## A kernel for tests

`src/fanwit/testing.ts` builds a kernel on the memory host, with modules and files, in one call. Every test from here on starts with it.

<Source path="src/fanwit/testing.ts" open="true" />

## Checkpoint

The repository's own command tests run now, because they use `createTestKernel`. Add `src/fanwit/commands/commands.test.ts`:

<Source path="src/fanwit/commands/commands.test.ts" />

```sh
pnpm vitest run src/fanwit
```

The first test is the whole idea of this chapter in miniature: a module whose code is not loaded until its command first runs, `activations` going from 0 to 1, and staying 1.

<Check question="A module declares a command but its activate function is in another file. When is that file downloaded?" options={["At startup, with every module", "The first time the command runs: the onCommand event activates the module, which calls its loader", "Never: commands need their handler at startup"]} answer={1}>

The declaration is data, read at boot, so the palette and menus can show the command. The code arrives when the command is first run, through the `onCommand:<id>` activation event.

</Check>
