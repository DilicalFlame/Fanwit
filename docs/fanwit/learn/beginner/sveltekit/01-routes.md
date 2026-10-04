---
title: Routes and layouts
section: SvelteKit basics
order: 1
summary: SvelteKit turns folders into pages. How FaNWiT uses that for its windows, why it builds a single-page app, and where the kernel boots.
---
# Routes and layouts

Svelte makes components. **SvelteKit** makes an *app* out of them: it decides which component a URL shows, wraps pages in shared layouts, and builds the result with Vite. FaNWiT is a SvelteKit app, and its few routes are worth knowing well, because every window starts in one of them.

<Callout kind="why">

FaNWiT opens many windows: the main one, Settings, the Manual, child windows, panels popped out of the main one. Each is the same app loaded at a different URL. SvelteKit's file-based routing gives each kind of window a URL without any routing code, and its layout gives them all one place to start the kernel.

</Callout>

## Folders are URLs

Inside `src/routes/`, each folder is a part of the URL, and a `+page.svelte` in it is what that URL shows. A folder in square brackets is a **parameter**: it matches any value and passes it to the page.

<FileTree>

- src/routes/
  - +layout.svelte (wraps every page: boots the kernel)
  - +layout.ts (options for every page)
  - +page.svelte (/ : the main window)
  - w/
    - [kind]/
      - +page.svelte (/w/settings, /w/manual, ... : every other window)
      - +page.ts

</FileTree>

```tikz caption="One app, many windows: the URL picks the route, the kind picks the window" alt="URLs on the left: slash, /w/settings, /w/manual. Each goes to a route file; all of them pass through +layout.svelte, which boots the kernel"
\begin{tikzpicture}[x=1mm,y=1mm,
  url/.style={fwnode,font=\scriptsize\ttfamily,text width=26mm,fill=fwPaper,draw=fwSlate},
  file/.style={fwnode,font=\scriptsize\ttfamily,text width=34mm},
  win/.style={fwnode,font=\scriptsize,text width=28mm,fwuser}]
\node[url] (u1) at (0,14) {/};
\node[url] (u2) at (0,2) {/w/settings};
\node[url] (u3) at (0,-10) {/w/manual};
\node[file,fwwarm] (p1) at (52,14) {+page.svelte};
\node[file,fwwarm] (p2) at (52,-4) {w/[kind]/+page.svelte\\{\sffamily\tiny kind = "settings", "manual", ...}};
\node[win] (w1) at (102,14) {the main window\\{\tiny the workbench}};
\node[win] (w2) at (102,2) {Settings window};
\node[win] (w3) at (102,-10) {Manual window};
\draw[fwarrow] (u1) -- (p1); \draw[fwarrow] (u2) -- (p2.west); \draw[fwarrow] (u3) -- (p2.west);
\draw[fwarrow] (p1) -- (w1); \draw[fwarrow] (p2.east) -- (w2); \draw[fwarrow] (p2.east) -- (w3);
% the layout wraps every page
\begin{scope}[on background layer]
\node[fill=fwBrandSoft!55,draw=fwBrand,rounded corners=4pt,inner xsep=4mm,inner ysep=3mm,fit=(p1)(p2)] (layout) {};
\end{scope}
\node[font=\scriptsize,text=fwBrand,anchor=south,align=center] at (layout.north) {\texttt{+layout.svelte} wraps every page:\\ it boots one kernel for the window, then shows the page};
\end{tikzpicture}
```

`w/[kind]/+page.svelte` reads the parameter with `page.params.kind` and renders that window kind's root view. Adding a new kind of window (`pnpm fw add window <kind>`) needs no new route: the kind is data, and this one page shows them all.

## Layouts wrap pages

A `+layout.svelte` wraps every page below its folder. It receives the page as its `children` snippet, the same mechanism as the snippets in the props chapter, and decides what goes around it. FaNWiT's root layout does one job: start the kernel for this window, then render the page.

```svelte
<!-- src/routes/+layout.svelte, shortened -->
<script lang="ts">
	import { onMount, setContext } from "svelte";
	import { boot } from "$fanwit/boot.svelte";

	let { children } = $props();
	let kernel = $state(null);

	onMount(async () => {
		const kind = page.url.pathname.startsWith("/w/") ? page.url.pathname.split("/")[2] : "main";
		kernel = await boot({ windowKind: kind });
	});
</script>

{#if kernel}
	{@render children()}
{:else}
	<!-- a loading screen, or the error if booting failed -->
{/if}
```

`onMount` runs once, after the component first appears in the page. Because the layout renders the page only when the kernel exists, every view below can assume it does: they reach it through Svelte **context** (`getKernel()` in `src/fanwit/ui.svelte.ts` reads what the layout put there with `setContext`).

## A single-page app

SvelteKit can render pages on a server (SSR) before they reach the browser. A desktop app has no server, so FaNWiT turns that off for every page in `src/routes/+layout.ts`:

```ts
export const prerender = true;
export const ssr = false;
```

and builds with `@sveltejs/adapter-static` and a `fallback` page (`svelte.config.js`): the build is a folder of plain files, with one `index.html` that serves every URL. Tauri loads that folder into each window; the docs site is the same folder on a web server.

<Check question="You want a new kind of window, a Color picker at /w/color-picker. What do you add to src/routes?" options={["A new folder src/routes/w/color-picker/ with its own +page.svelte", "Nothing: w/[kind]/+page.svelte shows every kind; you register the kind (pnpm fw add window)", "A new +layout.svelte"]} answer={1}>

`[kind]` matches any window kind, and the page looks up the registered kind's root view. Window kinds are contributions, so they are data, not routes.

</Check>

<Callout kind="learn-more">

SvelteKit's tutorial on [pages](https://svelte.dev/tutorial/kit/pages), [layouts](https://svelte.dev/tutorial/kit/layouts) and [route parameters](https://svelte.dev/tutorial/kit/params); the docs on [routing](https://svelte.dev/docs/kit/routing), [page options](https://svelte.dev/docs/kit/page-options) and [single-page apps](https://svelte.dev/docs/kit/single-page-apps).

</Callout>
