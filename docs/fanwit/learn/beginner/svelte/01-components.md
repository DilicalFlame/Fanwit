---
title: Your first component
section: Svelte basics
order: 1
summary: A Svelte component is one file of markup, logic and style. State that changes the screen, values computed from it, events, conditions and lists.
---
# Your first component

Everything you see in FaNWiT's window is a **component**: the title bar is `TitleBar.svelte`, each group of tabs is `TabSet.svelte`, the message shown in an empty area is `EmptyState.svelte`. By the end of this chapter you will be able to read any of them, and write your own.

<Callout kind="why">

A desktop app's interface changes all the time: a tab opens, a setting flips, a file is saved. Changing the screen by hand (find this element, update that text, remember to update the other one too) is where most interface bugs come from. In Svelte you describe what the screen should look like *for the current data*, and when the data changes, Svelte updates exactly the parts that depend on it. FaNWiT uses Svelte because it does this with a compiler: there is no large library running in the window, so the app starts fast and stays small, which matters for a desktop app that may open many windows.

</Callout>

## A component is one file

A Svelte component lives in a `.svelte` file with up to three parts: a `<script>` with its logic, the markup (HTML with a few additions), and a `<style>` whose rules apply to this component only. The editor below is a real component: change the name and the preview updates as you type, once you press **Run** (or **Ctrl+Enter**).

<Playground mode="svelte" id="svelte-1-hello" title="Hello" height={220}>

```svelte
<script>
	let name = "world";
</script>

<h1>Hello {name}!</h1>
<p>This text is plain HTML. The curly braces put a value from the script into it.</p>

<style>
	h1 { color: rebeccapurple; }
</style>
```

</Playground>

Curly braces are the first addition to HTML: `{name}` inserts the value of `name`. Anything inside them is JavaScript, so `{name.toUpperCase()}` or `{1 + 2}` work too. The `<style>` only reaches this component's `<h1>`: another component's headings stay as they were.

How does a `.svelte` file become something a browser can run? The Svelte compiler turns it into a small JavaScript module that builds the page once and then, for each value the markup uses, knows exactly which piece of the page to update.

```tikz caption="From a .svelte file to the screen: the compiler runs once, when the app is built" alt="A .svelte file goes into the Svelte compiler, which produces a JavaScript module; the module creates the page, and when state changes it updates only the parts that use it"
\begin{tikzpicture}[x=1mm,y=1mm,font=\sffamily\small,
  title/.style={font=\small\bfseries,text=fwInk},
  sub/.style={font=\scriptsize,text=fwSlate}]
% 1. the file
\begin{scope}[reveal=1]
  \fill[fwInk!12,rounded corners=1.5pt] (0.8,-0.8) -- (0.8,37.2) -- (22.8,37.2) -- (28.8,31.2) -- (28.8,-0.8) -- cycle;
  \filldraw[fill=white,draw=fwInk!55,line width=0.6pt,rounded corners=1.5pt] (0,0) -- (0,38) -- (22,38) -- (28,32) -- (28,0) -- cycle;
  \filldraw[fill=fwGrid,draw=fwInk!55,line width=0.6pt,line join=round] (22,38) -- (22,32) -- (28,32);
  \fill[fwBrandSoft,rounded corners=1pt] (3,23) rectangle (25,29);
  \node[font=\scriptsize\ttfamily,text=fwBrand] at (14,26) {<script>};
  \fill[fwWarmSoft,rounded corners=1pt] (3,13.5) rectangle (25,20.5);
  \node[font=\scriptsize\ttfamily,text=fwWarm!75!black] at (14,17) {<button>};
  \fill[fwAccentSoft,rounded corners=1pt] (3,4) rectangle (25,11);
  \node[font=\scriptsize\ttfamily,text=fwAccent!75!black] at (14,7.5) {<style>};
  \node[title] at (14,44) {Counter.svelte};
  \node[sub] at (14,40.5) {what you write};
\end{scope}
% 2. the compiler
\begin{scope}[reveal=2,packet]\draw[fwarrow] (31,19) -- (42,19);\end{scope}
\begin{scope}[reveal=2]
  \fill[fwInk!14] (54.8,18.2) circle (8.5mm);
  \node[circle,fill=fwBrand,minimum size=17mm,text=white] at (54,19) {\huge\faIcon{cogs}};
  \node[title] at (54,44) {Svelte compiler};
  \node[sub] at (54,40.5) {runs once, at build time};
\end{scope}
% 3. the generated module
\begin{scope}[reveal=3,packet]\draw[fwarrow] (66,19) -- (74,19);\end{scope}
\begin{scope}[reveal=3]
  \fill[fwInk!14,rounded corners=2pt] (76.8,2.2) rectangle (110.8,34.2);
  \filldraw[fill=fwInk,draw=fwInk,rounded corners=2pt] (76,3) rectangle (110,35);
  \node[anchor=north west,font=\scriptsize\ttfamily,text=white,align=left,inner sep=0] at (79,32) {%
    \textcolor{fwAccentSoft}{create}() \textbraceleft\\
    \ \ make <button>\\
    \textbraceright\\[3pt]
    \textcolor{fwWarmSoft}{update}() \textbraceleft\\
    \ \ set its text\\
    \textbraceright};
  \node[title] at (93,44) {JavaScript};
  \node[sub] at (93,40.5) {small, no framework to load};
\end{scope}
% 4. the page
\begin{scope}[reveal=4,packet]\draw[fwarrow] (112,19) -- (121,19);\end{scope}
\begin{scope}[reveal=4]
  \fill[fwInk!12,rounded corners=2pt] (123.8,2.2) rectangle (165.8,35.2);
  \filldraw[fill=white,draw=fwInk!55,line width=0.6pt,rounded corners=2pt] (123,3) rectangle (165,36);
  \fill[fwGrid,rounded corners=2pt] (123,30) rectangle (165,36);
  \fill[fwGrid] (123,30) rectangle (165,32);
  \draw[fwInk!55,line width=0.4pt] (123,30) -- (165,30);
  \fill[fwRed!75] (126.5,33) circle (0.9); \fill[fwWarm!85] (129.3,33) circle (0.9); \fill[fwGreen!75] (132.1,33) circle (0.9);
  \node[title] at (144,44) {The page};
  \node[sub] at (144,40.5) {what you see};
\end{scope}
\begin{scope}[reveal=4]\begin{scope}[pulse]
  \node[draw=fwBrand,fill=fwBrandSoft,rounded corners=2pt,font=\small,inner xsep=4pt,inner ysep=3pt,text=fwInk] at (144,17) {Clicked 3 times};
\end{scope}\end{scope}
% 5. a click comes back
\begin{scope}[reveal=5,flow]
  \draw[fwBrand,thick,-{Stealth[length=2.2mm]}] (144,1) .. controls (144,-12) and (93,-12) .. (93,1);
\end{scope}
\begin{scope}[reveal=5]
  \node[font=\scriptsize,text=fwBrand,fill=white,inner sep=2pt] at (118.5,-9.5) {\faIcon{mouse-pointer}\ a click runs \texttt{count++}; \texttt{update()} changes only that text};
\end{scope}
\end{tikzpicture}
```

## State: values that update the screen

A plain `let` is set once. To make the screen follow a value, declare it with `$state(...)`. Svelte calls the words that start with `$` **runes**: they look like functions, but they are instructions to the compiler.

<Playground mode="svelte" id="svelte-1-counter" title="A counter" height={200}>

```svelte
<script>
	let count = $state(0);
</script>

<button onclick={() => count++}>Clicked {count} times</button>
```

</Playground>

Two things happen here. `onclick={...}` gives the button a function to call when it is clicked; any HTML event works the same way (`oninput`, `onkeydown`, ...). The function changes `count`, and because `count` is state, the text in the button updates by itself. Nothing in the code says "now update the button": that is the compiler's job.

<Lab id="svelte-1-countdown" title="A countdown" expect="Liftoff in 7">

Change the counter into a countdown. It should start at 10, go **down** by one on each click, and the button should read `Liftoff in 10`, `Liftoff in 9`, and so on. The lab is done when the button reads **Liftoff in 7**.

<Playground mode="svelte" id="svelte-1-countdown" title="Countdown" height={180}>

```svelte
<script>
	let count = $state(0);
</script>

<button onclick={() => count++}>Clicked {count} times</button>
```

</Playground>

<details>
<summary>Show a solution</summary>

`let count = $state(10);`, then `onclick={() => count--}` and `Liftoff in {count}` as the button's text.

</details>

</Lab>

## Derived values

Often a value is computed from state: a total from a list, a label from a number. Write it with `$derived(...)` and it stays correct whenever the state it reads changes. You never update it yourself.

<Playground mode="svelte" id="svelte-1-derived" title="Derived values" height={220}>

```svelte
<script>
	let count = $state(1);
	let doubled = $derived(count * 2);
	let parity = $derived(count % 2 === 0 ? "even" : "odd");
</script>

<button onclick={() => count++}>Add one</button>
<p>{count} doubled is {doubled}, and {count} is {parity}.</p>
```

</Playground>

<Callout kind="under-the-hood">

When `doubled` is first read, Svelte notes which state the expression read (`count`). Changing `count` marks `doubled` as out of date, and it is recomputed the next time something reads it. FaNWiT's services work the same way: the command palette's list is a `$derived` of the registered commands and what you typed, so registering a command shows up in an open palette with no extra code.

</Callout>

## Conditions and lists

Markup can choose what to show with `{#if}` and repeat itself with `{#each}`. Both end with a closing tag, `{/if}` and `{/each}`, like HTML elements.

<Playground mode="svelte" id="svelte-1-list" title="A list" height={260}>

```svelte
<script>
	let items = $state(["Install Node", "Install Rust"]);
	let draft = $state("");

	function add() {
		if (draft.trim()) items.push(draft.trim());
		draft = "";
	}
</script>

<input bind:value={draft} placeholder="Something to do" onkeydown={(e) => e.key === "Enter" && add()} />
<button onclick={add}>Add</button>

{#if items.length === 0}
	<p>Nothing to do.</p>
{:else}
	<ul>
		{#each items as item}
			<li>{item}</li>
		{/each}
	</ul>
{/if}
```

</Playground>

Three new things. `bind:value={draft}` keeps the input and `draft` in step both ways: typing changes `draft`, and setting `draft = ""` empties the box. `items.push(...)` updates the list on screen because state that holds an array or object is *deeply* reactive: changing what is inside it counts as a change. And `{:else}` is the other branch of `{#if}`.

<Lab id="svelte-1-count-items" title="Count what is left" expect="3 things to do">

Under the list, show how many items there are, as `2 things to do`. Use `$derived`, then add one item so the lab sees **3 things to do**. Bonus: say `1 thing to do` when there is only one.

<Playground mode="svelte" id="svelte-1-count-items" title="Things to do" height={260}>

```svelte
<script>
	let items = $state(["Install Node", "Install Rust"]);
	let draft = $state("");

	function add() {
		if (draft.trim()) items.push(draft.trim());
		draft = "";
	}
</script>

<input bind:value={draft} placeholder="Something to do" onkeydown={(e) => e.key === "Enter" && add()} />
<button onclick={add}>Add</button>

<ul>
	{#each items as item}
		<li>{item}</li>
	{/each}
</ul>
```

</Playground>

<details>
<summary>Show a solution</summary>

In the script, below `items`:

```js
let left = $derived(items.length + (items.length === 1 ? " thing" : " things") + " to do");
```

Under the list: `<p>{left}</p>`.

</details>

</Lab>

## Reading a real FaNWiT component

Here is `src/fanwit/workbench/EmptyState.svelte`, the message you saw when every page tab was closed. You know almost everything in it now:

```svelte
<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "../icons/Icon.svelte";
	import { enter } from "../motion/motion";

	let { icon = "inbox", title, description, children }: { icon?: string; title: string; description?: string; children?: Snippet } = $props();
</script>

<div use:enter={{ preset: "rise", stagger: "> *" }} class="flex h-full ...">
	<Icon name={icon} size={28} class="opacity-60" />
	<div class="text-sm font-medium text-foreground/80">{title}</div>
	{#if description}<div class="max-w-72 text-xs">{description}</div>{/if}
	{#if children}<div class="mt-2 flex ...">{@render children()}</div>{/if}
</div>
```

- `lang="ts"` means the script is TypeScript: JavaScript with types written after a colon. The *Web basics* part covers just enough of it.
- `$props()` is the rune for a component's inputs. Whoever uses `<EmptyState title="Nothing open" />` sets `title`; `icon` falls back to `"inbox"` when nobody sets it. Props are the next chapter.
- `<Icon ... />` is another component, used like an HTML element.
- `class="..."` names come from Tailwind CSS, which FaNWiT styles with instead of `<style>` blocks.
- `use:enter` and `{@render children()}` are an *action* and a *snippet*, also coming up.

<Check question="A component has let total = $derived(price * quantity). The user changes quantity. What happens to total?" options={["Nothing, until the code sets total again", "It is recomputed, and the screen shows the new value", "It throws an error, because derived values cannot change"]} answer={1}>

`$derived` values follow the state they read. Changing `quantity` makes `total` out of date, Svelte recomputes it, and every place in the markup that shows `total` updates.

</Check>

<Check question="Why does items.push(...) update the list on screen, when items was declared with $state([...])?" options={["Svelte checks every array on the page many times a second", "State holding an array or object is deeply reactive, so changing what is inside it is a change", "push is a special Svelte function"]} answer={1}>

`$state` wraps arrays and objects so that changes inside them are tracked too. Svelte does not poll anything: it knows the moment `push` changes the array.

</Check>

<Callout kind="learn-more">

The official [Svelte tutorial](https://svelte.dev/tutorial/svelte/welcome-to-svelte) covers this chapter in more depth, with its own live editor: [your first component](https://svelte.dev/tutorial/svelte/your-first-component), [state](https://svelte.dev/tutorial/svelte/state), [deep state](https://svelte.dev/tutorial/svelte/deep-state), [derived state](https://svelte.dev/tutorial/svelte/derived-state), [if blocks](https://svelte.dev/tutorial/svelte/if-blocks) and [each blocks](https://svelte.dev/tutorial/svelte/each-blocks).

</Callout>
