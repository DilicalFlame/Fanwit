# UI helpers and small components

Before the workbench can be drawn, components need a few basic tools. They need a way to reach the kernel, translate their text, clean up what they registered, and open a context menu. A handful of small components also appear in almost every view. This chapter builds `ui.svelte.ts` and those components.

<Callout kind="why">

Views are written by app authors, so these helpers are public API (exported from `$fanwit`). Each one replaces something every view would otherwise do by hand, and could get subtly wrong. Examples are forgetting to remove a listener, a context menu that only opens with the mouse, or an error that shows a stack trace and no way out.

</Callout>

## Reaching the kernel

<Source path="src/fanwit/ui.svelte.ts" from="export function getKernel" to="}" />

The root layout (chapter 30) and the pane pool (chapter 20) put the kernel into Svelte **context** under the key `"fanwit"`. Any component below them calls `getKernel()` and gets the window's kernel, with no props threaded through every level. Like all context functions, it must be called while the component is being created (at the top of its `<script>`), not later in an event handler.

<Source path="src/fanwit/ui.svelte.ts" from="export function useT" to="}" />

`t("notes.empty", "No notes yet")` keeps the English text in the code, where you read it, and uses it as the fallback. The i18n service's lookups are reactive (chapter 14), so text updates when the language changes.

<Source path="src/fanwit/ui.svelte.ts" from="export function useDisposable" to="}" />

Modules dispose what they register automatically (chapter 13). A component that subscribes to an event while it is on screen needs the same. `useDisposable(k.events.on(...))` ties the subscription to the component's life with `onDestroy`.

<Callout kind="new" title="New here: generic constraints">

`useDisposable<T extends Disposable>(d: T): T` accepts anything that **is at least** a `Disposable` and returns the same type. Pass in a status bar handle with `update()` and `item`, and you get back a value that still has `update()` and `item`. Typed as `(d: Disposable): Disposable`, the function would lose everything but `dispose`.

</Callout>

## Context menus on any element

`use:menu` turns any element into something with a context menu:

```svelte
<li use:menu={{ location: "explorer/item", target: { path: f.path } }}>{f.name}</li>
```

<Source path="src/fanwit/ui.svelte.ts" from="export function menu(node" to="}" />

One action covers every way people open a menu:

- **Right click** (`contextmenu`). The browser's own menu is suppressed unless `native: true`.
- **Shift+F10 and the Menu key**, for keyboard users. The menu opens under the element, anchored to its rectangle.
- **Long press** on touch screens. A 550 ms timer starts on touch and is cancelled if the finger lifts or moves.

The action only calls `menus.show(location, x, y, { target, element })`. What the menu contains comes from chapter 22's service, and drawing it is `MenuHost`'s job (chapter 29). `data-fw-menu` marks the element, so developer mode can show which elements have a menu and where it comes from.

<Callout kind="new" title="New here: ReturnType, and actions that return update and destroy">

`let timer: ReturnType<typeof setTimeout> | undefined` gives the timer the type `setTimeout` actually returns. That is a number in browsers but an object in Node, so writing `number` would break type checking in one of them.

An action may return `{ update, destroy }`. Svelte calls `update` with the new options when they change (a list item reused for another file), and `destroy` when the element goes away. Removing every listener in `destroy` is what keeps a list of a thousand files from leaking a thousand sets of handlers.

</Callout>

Try writing a small version yourself. The playground has a `menu.js` action and a list that uses it. Right click an item, or focus it with Tab and press Shift+F10:

<Playground mode="svelte" id="rebuild-26-menu-action" title="A context menu action" height={260}>

```svelte file="App.svelte"
<script>
	import { menu } from "./menu.js";
	const files = ["notes.md", "todo.md", "ideas.md"];
	let shown = $state(null);
	const show = (target, x, y) => (shown = { target, x, y });
</script>

<ul>
	{#each files as f (f)}
		<li tabindex="0" use:menu={{ target: f, show }}>{f}</li>
	{/each}
</ul>

{#if shown}
	<div class="menu" style:left="{shown.x}px" style:top="{shown.y}px">
		<button onclick={() => (shown = null)}>Rename {shown.target}</button>
		<button onclick={() => (shown = null)}>Delete {shown.target}</button>
	</div>
{/if}

<style>
	li { padding: 4px 8px; cursor: default; }
	li:focus { outline: 2px solid steelblue; }
	.menu { position: fixed; display: flex; flex-direction: column; border: 1px solid #ccc; background: white; box-shadow: 0 4px 12px #0002; }
	.menu button { text-align: left; border: 0; background: none; padding: 6px 12px; }
	.menu button:hover { background: #eef; }
</style>
```

```js file="menu.js"
export function menu(node, opts) {
	let o = opts;
	const onContext = (e) => {
		e.preventDefault();
		o.show(o.target, e.clientX, e.clientY);
	};
	const onKey = (e) => {
		if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
			e.preventDefault();
			const r = node.getBoundingClientRect();
			o.show(o.target, r.left + 8, r.bottom);
		}
	};
	node.addEventListener("contextmenu", onContext);
	node.addEventListener("keydown", onKey);
	return {
		update(n) { o = n; },
		destroy() {
			node.removeEventListener("contextmenu", onContext);
			node.removeEventListener("keydown", onKey);
		}
	};
}
```

</Playground>

Things to try:

- Add long press. Start a `setTimeout` on `pointerdown` when `e.pointerType === "touch"`, and clear it on `pointerup` and `pointermove`.
- Make Escape close the menu.

The rest of `ui.svelte.ts` serves developer mode. `svelteMeta` reads the file and line Svelte attaches to elements in dev builds (that is how **Open component source** knows where to go). `candidateLocation` and `cssSelector` name an element that has no menu yet, so you can create one for it. `uiZoom` and `shortAgo` are small utilities: the zoom factor of the `ui.zoom` setting, and "5m" style relative times.

<Source path="src/fanwit/ui.svelte.ts" />

## Icon

<Source path="src/fanwit/icons/Icon.svelte" />

`<Icon name="file-text" />` shows a registered SVG if there is one, otherwise the Lucide component (from chapter 23's registry). Until that has loaded, it shows an empty box of the same size, so the layout does not jump when the icon arrives.

<Callout kind="new" title="New here: &#123;@const&#125;, dynamic components, and the comma operator">

- `{@const C = comp}` declares a constant inside markup. `<C ... />` then renders whatever component `C` holds. A capitalised variable used as a tag is a **dynamic component**.
- `{@html svg}` inserts raw HTML. That is only safe because the registry cleaned the SVG when it was registered.
- `(void icons.version, icons.svg(name))` evaluates both expressions and returns the last. Reading `icons.version` makes the `$derived` depend on it, so registering an icon re-runs it, and `void` marks that the value is unused on purpose.
- In the effect, `n === name && (comp = c)` drops a late result: if the name changed while loading, the old icon must not replace the new one. That is the same "latest wins" idea as the palette's sequence number in chapter 23.

</Callout>

## KeyChip, EmptyState, ErrorCard

<Source path="src/fanwit/workbench/KeyChip.svelte" />

`KeyChip` draws a binding, one `<kbd>` per step of a chord (`Ctrl+K`, then `Z`). The labels come from chapter 11's `keys.label`, which already uses ⌘ and ⌥ on macOS.

<Source path="src/fanwit/workbench/EmptyState.svelte" />

Every view has an empty state: no vault, no results, nothing selected. `EmptyState` gives them all the same look: an icon, a title, one line of explanation, and actions passed as children. It rises in with chapter 18's `enter`.

<Callout kind="new" title="New here: Snippet and &#123;@render&#125;">

`children?: Snippet` is the content placed between a component's tags: `<EmptyState title="No notes"><button>New note</button></EmptyState>`. `{@render children()}` draws it, and `{#if children}` checks whether any was given. Snippets replaced slots in Svelte 5. [Svelte docs: snippets](https://svelte.dev/docs/svelte/snippet)

</Callout>

<Source path="src/fanwit/workbench/ErrorCard.svelte" />

`ErrorCard` is what a crashed view turns into (chapter 27 puts it inside an error boundary). It follows chapter 6's rule that an error says what happened, a hint if one is known, and what you can do. Here that means reloading the view, copying the details for a bug report, opening the logs, or opening the docs page the error points to. `role="alert"` makes screen readers announce it.

## Checkpoint

These pieces are verified where they are used. `e2e/smoke.test.ts` opens a tab's context menu with a right click and again with Shift+F10, once the workbench exists (chapter 30). Until then, the type checker covers them:

```sh
pnpm check
```

<Check question="A view subscribes to k.events.on(&quot;notes:saved&quot;, refresh) in its script, without useDisposable. What happens when the user closes and reopens the view ten times?" options={["Nothing; Svelte removes it", "refresh runs ten times for every save, because each closed view's listener is still subscribed", "The app throws on the second open"]} answer={1}>

The event bus does not know the listener belongs to a component, so the subscription outlives it. That leaks memory and runs `refresh` on components that are no longer on screen. `useDisposable` ties the subscription to the component's `onDestroy`.

</Check>
