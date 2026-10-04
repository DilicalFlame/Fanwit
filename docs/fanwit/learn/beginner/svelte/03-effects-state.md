---
title: Effects and shared state
section: Svelte basics
order: 3
summary: Running code when state changes ($effect), cleaning up after it, and state that lives outside components, in classes, the way FaNWiT's services do.
---
# Effects and shared state

So far state lived inside a component and only the screen reacted to it. Two things are still missing: reacting with *code* (save when something changes, start a timer, talk to the Rust core), and state that several components share. FaNWiT is built on the second: its kernel and services are state shared by every view in a window.

<Callout kind="why">

The palette, the tab strip and the status bar all show the same commands, layout and settings. If each kept its own copy, they would drift apart. So the data lives once, in a service, and every component reads it from there. Because the service's fields are Svelte state, every component that reads a field updates when it changes, without any of them knowing about the others.

</Callout>

## $effect: code that follows state

`$effect` runs a function after the component appears, and again whenever state it read changes. It is for **side effects**: things outside the screen, like a timer, the page title, local storage or a network call. For values, keep using `$derived`.

<Playground mode="svelte" id="svelte-3-effect" title="An effect" height={250}>

```svelte
<script>
	let seconds = $state(0);
	let running = $state(true);

	$effect(() => {
		if (!running) return;
		const timer = setInterval(() => seconds++, 1000);
		// the function returned is the cleanup: it runs before the effect runs again,
		// and when the component goes away
		return () => clearInterval(timer);
	});
</script>

<p>{seconds} seconds</p>
<button onclick={() => (running = !running)}>{running ? "Pause" : "Resume"}</button>
```

</Playground>

The effect read `running`, so toggling it re-runs the effect: the cleanup stops the old timer, and a new one starts only if `running` is true. Forgetting cleanups is the classic leak (a timer still ticking after its component is gone); FaNWiT's equivalent is the **disposable** every registration returns.

<Callout kind="warn">

Do not use an effect to compute one state from another (`$effect(() => (total = a + b))`). It works, but the screen shows the old total for a moment and the code hides where `total` comes from. That is what `$derived` is for.

</Callout>

## State outside components

`$state` also works in plain JavaScript files whose names end in `.svelte.js` (or `.svelte.ts`). Put state there and every component that imports it shares the same value.

<Playground mode="svelte" id="svelte-3-shared" title="Shared state" height={300}>

```svelte file="App.svelte"
<script>
	import Counter from "./Counter.svelte";
	import { cart } from "./cart.svelte.js";
</script>

<Counter item="Apples" />
<Counter item="Pears" />
<p>In the cart: {cart.items.length} items ({cart.items.join(", ") || "none"})</p>
```

```svelte file="Counter.svelte"
<script>
	import { cart } from "./cart.svelte.js";
	let { item } = $props();
</script>

<button onclick={() => cart.add(item)}>Add {item}</button>
```

```js file="cart.svelte.js"
// one object, imported by every component that needs it
export const cart = $state({
	items: [],
	add(item) {
		this.items.push(item);
	}
});
```

</Playground>

## Services: state in a class

FaNWiT writes its shared state as **classes** with `$state` fields: `CommandService`, `LayoutService`, `SettingsService` and the rest. A class keeps the state and the only functions allowed to change it together.

<Playground mode="svelte" id="svelte-3-service" title="A service" height={330}>

```svelte file="App.svelte"
<script>
	import { notifications } from "./notify.svelte.js";
</script>

<button onclick={() => notifications.send("Saved")}>Save</button>
<button onclick={() => notifications.send("Copied")}>Copy</button>
<button onclick={() => notifications.clear()} disabled={!notifications.count}>Clear</button>

<p>{notifications.count} unread</p>
<ul>
	{#each notifications.items as n (n.id)}<li>{n.text}</li>{/each}
</ul>
```

```js file="notify.svelte.js"
class NotifyService {
	items = $state([]);
	count = $derived(this.items.length);
	#next = 1;   // private: only the class can see it

	send(text) {
		this.items.push({ id: this.#next++, text });
	}
	clear() {
		this.items = [];
	}
}

// one instance for the whole window
export const notifications = new NotifyService();
```

</Playground>

Compare this with the real `NotifyService` in `src/fanwit/notify/`: more features, the same shape. The kernel creates one of each service per window and hands them to modules as `ctx.notify`, `ctx.layout` and so on.

<Callout kind="under-the-hood">

Some FaNWiT services keep a `version = $state(0)` counter and bump it when something changes, so a `$derived` can depend on "anything in the registry changed". They bump it inside `untrack(...)`, which reads a value without subscribing to it, so an effect that both reads and bumps the counter does not trigger itself in a loop. The Expert level covers these rules; for now, recognise the pattern when you see it.

</Callout>

<Lab id="svelte-3-autosave" title="Autosave" expect="Saved: hello">

Make the note save itself: whenever `text` changes, after the person stops typing for half a second, set `saved` to the text. Use an `$effect` that starts a `setTimeout` and returns a cleanup that clears it. Type `hello` and wait: the lab is done when it reads **Saved: hello**.

<Playground mode="svelte" id="svelte-3-autosave" title="Autosave" height={240}>

```svelte
<script>
	let text = $state("");
	let saved = $state("");

	// $effect(() => { ... });
</script>

<textarea bind:value={text} rows="3" placeholder="Type here"></textarea>
<p>{saved ? `Saved: ${saved}` : "Not saved yet"}</p>
```

</Playground>

<details>
<summary>Show a solution</summary>

```js
$effect(() => {
	const value = text;          // reading text makes the effect follow it
	const timer = setTimeout(() => (saved = value), 500);
	return () => clearTimeout(timer);
});
```

Each keystroke re-runs the effect; the cleanup cancels the previous timer, so only a pause lets one finish. FaNWiT saves its TOML files the same way (debounced, about 150 ms).

</details>

</Lab>

<Check question="Two components import the same object made with $state from a .svelte.js file. One changes it. What does the other see?" options={["Its own copy, unchanged", "The change: there is one object, and both read it", "An error: state cannot be shared"]} answer={1}>

A module runs once, so its exported state is one object. Every component that reads it updates when it changes. That is how one service serves a whole window.

</Check>

<Callout kind="learn-more">

Svelte's tutorial on [effects](https://svelte.dev/tutorial/svelte/effects) and [universal reactivity](https://svelte.dev/tutorial/svelte/universal-reactivity); the reference for [$effect](https://svelte.dev/docs/svelte/$effect), [state in classes](https://svelte.dev/docs/svelte/$state#Classes) and [.svelte.js files](https://svelte.dev/docs/svelte/svelte-js-files).

</Callout>
