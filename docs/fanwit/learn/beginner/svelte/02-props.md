---
title: Props and composition
section: Svelte basics
order: 2
summary: Components inside components. Props carry data down, callbacks carry events up, snippets pass markup, and bind keeps a value in step both ways.
---
# Props and composition

An interface is built from small components put together: FaNWiT's tab strip is made of tabs, each tab of an icon, a title and a close button. This chapter is about the joints: how a component receives data from the one that uses it, and how it reports back.

<Callout kind="why">

If every part of the window knew about every other part, changing one would mean changing all of them. Components that receive what they need (props) and announce what happened (callbacks) can be reused and rearranged freely. That is what lets FaNWiT's layout move a view from the sidebar to a tab or a floating window: the view never knew where it was.

</Callout>

## Props: data flows down

A component declares its inputs with `$props()`. Whoever uses it passes them like HTML attributes. The playgrounds now have **files**: `App.svelte` is the one shown, and it imports the others.

<Playground mode="svelte" id="svelte-2-props" title="Props" height={260}>

```svelte file="App.svelte"
<script>
	import Badge from "./Badge.svelte";
</script>

<p>
	<Badge label="Saved" />
	<Badge label="3 errors" tone="danger" />
	<Badge label="Beta" tone="info" />
</p>
```

```svelte file="Badge.svelte"
<script>
	// label is required; tone falls back to "ok"
	let { label, tone = "ok" } = $props();
</script>

<span class={tone}>{label}</span>

<style>
	span { padding: 2px 8px; border-radius: 99px; font-size: 13px; margin-right: 4px; }
	.ok { background: #dcfce7; color: #166534; }
	.danger { background: #fee2e2; color: #991b1b; }
	.info { background: #e0e7ff; color: #3730a3; }
</style>
```

</Playground>

Props are read only for the child: `Badge` shows `label`, it does not change it. When the parent passes a new value, the child updates. That one direction, parent to child, is what keeps a tree of components easy to follow.

## Callbacks: events flow up

To tell its parent something happened, a child calls a function the parent passed as a prop. By convention such props start with `on`.

```tikz caption="Data goes down as props; what happened comes back up through callbacks" alt="A parent component above a child; an arrow down labelled props, an arrow up labelled callback"
\begin{tikzpicture}[x=1mm,y=1mm,comp/.style={fwnode,text width=36mm,minimum height=12mm}]
\node[comp,fwcore] (p) at (0,22) {\cd{App.svelte}\\[1pt]{\scriptsize owns \cd{count}}};
\node[comp,fwuser] (c) at (0,0) {\cd{Stepper.svelte}\\[1pt]{\scriptsize shows it, has the buttons}};
\begin{scope}[flow]\draw[fwarrow] ([xshift=-8mm]p.south) -- node[fwlabel,left]{\cd{value=\{count\}}} ([xshift=-8mm]c.north);\end{scope}
\begin{scope}[flow]\draw[fwarrow,fwBrand] ([xshift=8mm]c.north) -- node[fwlabel,right]{\cd{onchange(n)}} ([xshift=8mm]p.south);\end{scope}
\end{tikzpicture}
```

<Playground mode="svelte" id="svelte-2-callbacks" title="Callbacks" height={280}>

```svelte file="App.svelte"
<script>
	import Stepper from "./Stepper.svelte";
	let count = $state(1);
</script>

<Stepper value={count} onchange={(n) => (count = n)} />
<p>The parent has {count}.</p>
```

```svelte file="Stepper.svelte"
<script>
	let { value, onchange } = $props();
</script>

<button onclick={() => onchange(value - 1)}>-</button>
<strong>{value}</strong>
<button onclick={() => onchange(value + 1)}>+</button>
```

</Playground>

The state lives in one place, the parent. The child only displays it and asks for changes. FaNWiT's views do the same with the kernel: a view never edits the layout itself, it asks (`layout.dispatch(...)`) and the layout service decides.

## bind: when both sides may change it

For form-like components, writing a value and a callback each time is noise. Mark the prop `$bindable()` in the child, and the parent can `bind:` to it, as with an `<input>`:

<Playground mode="svelte" id="svelte-2-bind" title="bind" height={240}>

```svelte file="App.svelte"
<script>
	import Toggle from "./Toggle.svelte";
	let dark = $state(false);
</script>

<Toggle bind:on={dark} label="Dark mode" />
<p>dark is {dark}</p>
```

```svelte file="Toggle.svelte"
<script>
	let { on = $bindable(false), label } = $props();
</script>

<label>
	<input type="checkbox" bind:checked={on} />
	{label}
</label>
```

</Playground>

Use it sparingly: two-way binding is convenient for forms, but a value that anything can change is harder to trace. FaNWiT binds inputs, and passes callbacks almost everywhere else.

## Snippets: passing markup

Sometimes the parent wants to decide part of the child's *markup*, not just its data: a dialog's body, a card's footer. The child renders a **snippet** it received. Markup placed between a component's tags arrives as the `children` snippet; named ones are declared with `{#snippet}`.

<Playground mode="svelte" id="svelte-2-snippets" title="Snippets" height={290}>

```svelte file="App.svelte"
<script>
	import Card from "./Card.svelte";
</script>

<Card title="Unsaved changes">
	<p>Close the note without saving?</p>

	{#snippet actions()}
		<button>Cancel</button>
		<button>Close anyway</button>
	{/snippet}
</Card>
```

```svelte file="Card.svelte"
<script>
	let { title, children, actions } = $props();
</script>

<section>
	<h3>{title}</h3>
	{@render children()}
	{#if actions}<footer>{@render actions()}</footer>{/if}
</section>

<style>
	section { border: 1px solid #ccc; border-radius: 10px; padding: 4px 14px 10px; max-width: 320px; }
	footer { display: flex; gap: 6px; justify-content: flex-end; }
</style>
```

</Playground>

This is exactly the `EmptyState.svelte` from the last chapter: its `children` are the buttons below the message, which is how the docs site shows **Open the home page** there and the app shows **Quick open**.

<Lab id="svelte-2-rating" title="A star rating" expect="You rated it 4 of 5">

Finish `Stars.svelte`: show five buttons (`★` when the star is lit, `☆` when not) and call `onrate(n)` when star `n` is clicked. The parent already shows the result. Done when it reads **You rated it 4 of 5**.

<Playground mode="svelte" id="svelte-2-rating" title="Rating" height={260}>

```svelte file="App.svelte"
<script>
	import Stars from "./Stars.svelte";
	let rating = $state(0);
</script>

<Stars value={rating} onrate={(n) => (rating = n)} />
<p>{rating ? `You rated it ${rating} of 5` : "Not rated yet"}</p>
```

```svelte file="Stars.svelte"
<script>
	let { value, onrate } = $props();
</script>

<!-- five buttons; {#each [1, 2, 3, 4, 5] as n} ... {/each} -->
```

</Playground>

<details>
<summary>Show a solution</summary>

```svelte
{#each [1, 2, 3, 4, 5] as n}
	<button onclick={() => onrate(n)} aria-label="{n} stars">{n <= value ? "★" : "☆"}</button>
{/each}
```

The `aria-label` gives each button a name a screen reader can read; a lone star character is not one.

</details>

</Lab>

<Check question="A child component needs to tell its parent that the user picked a file. What is the usual way?" options={["Change the parent's variable directly", "Call a callback prop the parent passed, like onpick(file)", "Emit a DOM event and hope the parent listens"]} answer={1}>

The parent passes a function as a prop; the child calls it. Data flows down through props, news flows up through callbacks, and the parent stays the one place its state changes.

</Check>

<Callout kind="learn-more">

Svelte's tutorial on [declaring props](https://svelte.dev/tutorial/svelte/declaring-props), [default values](https://svelte.dev/tutorial/svelte/default-values), [component events](https://svelte.dev/tutorial/svelte/component-events), [bindable props](https://svelte.dev/tutorial/svelte/bindable-props) and [snippets](https://svelte.dev/tutorial/svelte/snippets-and-render-tags); the reference for [$props](https://svelte.dev/docs/svelte/$props) and [snippets](https://svelte.dev/docs/svelte/snippet).

</Callout>
