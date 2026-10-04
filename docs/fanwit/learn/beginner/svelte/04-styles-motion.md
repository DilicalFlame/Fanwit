---
title: Styles, transitions and actions
section: Svelte basics
order: 4
summary: Classes and styles that follow state, elements that animate in and out, and actions, the small reusable behaviours FaNWiT attaches with use:.
---
# Styles, transitions and actions

The last pieces of Svelte you need to read FaNWiT's components: styles that change with state, motion when elements appear and disappear, and **actions**, the `use:` attributes all over the workbench.

<Callout kind="why">

Small amounts of motion tell people what changed: a menu that grows from where you clicked, a toast that slides in from the corner. FaNWiT keeps it consistent by putting motion in one place (`src/fanwit/motion/motion.ts`) and attaching it with actions, so every view moves the same way and everything stops for readers who ask for reduced motion.

</Callout>

## Classes and styles from state

`class={...}` takes any expression, and Svelte accepts an object or array of class names too. `style:property={value}` sets a single CSS property.

<Playground mode="svelte" id="svelte-4-classes" title="Classes and styles" height={270}>

```svelte
<script>
	let active = $state(0);
	let size = $state(16);
	const tabs = ["Notes", "Search", "Settings"];
</script>

{#each tabs as tab, i}
	<button class={{ tab: true, active: i === active }} onclick={() => (active = i)}>{tab}</button>
{/each}

<p style:font-size="{size}px">Text at {size}px</p>
<input type="range" min="10" max="32" bind:value={size} />

<style>
	.tab { border: none; background: none; padding: 6px 12px; border-bottom: 2px solid transparent; }
	.active { border-bottom-color: rebeccapurple; font-weight: 600; }
</style>
```

</Playground>

## Transitions: in and out

A `transition:` plays when an element is added by `{#if}` or `{#each}`, and in reverse when it is removed. Svelte ships `fade`, `fly`, `slide`, `scale` and others.

<Playground mode="svelte" id="svelte-4-transitions" title="Transitions" height={260}>

```svelte
<script>
	import { fly, fade } from "svelte/transition";
	let toasts = $state([]);
	let n = 0;
	function toast() {
		const id = ++n;
		toasts.push({ id, text: `Saved note ${id}` });
		setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 2500);
	}
</script>

<button onclick={toast}>Save</button>
{#each toasts as t (t.id)}
	<div class="toast" in:fly={{ y: 16, duration: 200 }} out:fade>{t.text}</div>
{/each}

<style>
	.toast { margin-top: 6px; padding: 8px 12px; border-radius: 8px; background: #1e1b4b; color: white; width: fit-content; }
</style>
```

</Playground>

The `(t.id)` after `each` is a **key**: it tells Svelte which element belongs to which item, so the right toast leaves when its item is removed. Use a key whenever items can be added or removed in the middle.

## Actions: behaviour you attach

An **action** is a function that receives an element when it appears and may return a cleanup. `use:name` attaches it. It is how you add a behaviour to any element without wrapping it in a component.

<Playground mode="svelte" id="svelte-4-action" title="An action" height={290}>

```svelte
<script>
	// select the text when the element gets focus; nothing to undo on destroy here
	function selectOnFocus(node) {
		const select = () => node.select();
		node.addEventListener("focus", select);
		return { destroy: () => node.removeEventListener("focus", select) };
	}

	// an action with a parameter: a tooltip text
	function tip(node, text) {
		node.title = text;
		return { update: (next) => (node.title = next) };
	}
</script>

<input use:selectOnFocus value="click me: everything is selected" size="34" />
<button use:tip={"Saves the note (Ctrl+S)"}>Hover me</button>
```

</Playground>

FaNWiT's components are full of actions:

| Action | What it attaches | Where |
|---|---|---|
| `use:menu={{ location: "tab/context" }}` | a right-click menu from the menu system | `src/fanwit/ui.svelte.ts` |
| `use:enter={"pop"}` | the entrance motion, skipped with reduced motion | `src/fanwit/motion/motion.ts` |
| `use:ctxkeys={{ "selection.count": n }}` | context keys that hold while focus is inside the element, for `when` clauses | `src/fanwit/kernel/context.svelte.ts` |

When you read `use:menu` in a tab, you now know: the tab is an ordinary element, and the action finds the right menu, builds it from the registered contributions and opens it at the pointer.

<Lab id="svelte-4-highlight" title="A highlight action" expect="Clicked 2 times">

Write an action `flash` that briefly adds the class `flash` to the element whenever it is clicked (remove it after 300 ms with `setTimeout`), and return a `destroy` that removes the listener. Attach it to the button and click twice.

<Playground mode="svelte" id="svelte-4-highlight" title="flash" height={280}>

```svelte
<script>
	let clicks = $state(0);

	function flash(node) {
		// node.addEventListener("click", ...)
	}
</script>

<button use:flash onclick={() => clicks++}>Clicked {clicks} times</button>

<style>
	button { transition: background 0.3s; }
	:global(.flash) { background: gold; }
</style>
```

</Playground>

<details>
<summary>Show a solution</summary>

```js
function flash(node) {
	const on = () => {
		node.classList.add("flash");
		setTimeout(() => node.classList.remove("flash"), 300);
	};
	node.addEventListener("click", on);
	return { destroy: () => node.removeEventListener("click", on) };
}
```

`:global(.flash)` is needed because the class is added by code, not written in the markup, so Svelte's scoping would not know to keep it.

</details>

</Lab>

<Check question="Where would you put the code that opens a right-click menu on many different elements?" options={["Copy an oncontextmenu handler into every component", "An action, attached with use:menu wherever it is needed", "A transition"]} answer={1}>

An action packages behaviour for any element, with its own setup and cleanup. FaNWiT's `use:menu` is exactly that.

</Check>

<Callout kind="learn-more">

Svelte's tutorial on [classes](https://svelte.dev/tutorial/svelte/classes), [styles](https://svelte.dev/tutorial/svelte/styles), [transitions](https://svelte.dev/tutorial/svelte/transition), [keyed each blocks](https://svelte.dev/tutorial/svelte/keyed-each-blocks) and [actions](https://svelte.dev/tutorial/svelte/actions); FaNWiT's own motion rules are in the [Intermediate level](manual://fanwit/guides/themes).

</Callout>
