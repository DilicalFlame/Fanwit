# From an empty folder to a window

By the end of this chapter you will have an empty folder turned into a desktop app: a Tauri window showing a SvelteKit page. It shows only one line of text, but every file around that line is the one FaNWiT keeps for good, configured the way the rest of the rebuild needs.

<Callout kind="why">

FaNWiT is two programs that ship as one: a web interface and a Rust core. Each comes with its own tools (pnpm and Vite, Cargo and Tauri), and each has a few settings that would be painful to change later: that the web side is a single-page app with no server, that TypeScript is strict, that the Rust side is a library the desktop and mobile entry points share. Setting them right on day one is the point of this chapter.

</Callout>

## 1. The folder and package.json

Make a folder and give it a `package.json`. FaNWiT's says it is an ES module project, names its scripts, and pins the package manager:

```json
{
	"name": "fanwit",
	"private": true,
	"version": "0.0.1",
	"type": "module",
	"scripts": {
		"dev": "vite dev --port 3000",
		"build": "vite build",
		"preview": "vite preview",
		"prepare": "svelte-kit sync || echo ''",
		"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings",
		"test": "vitest run",
		"tauri": "tauri"
	},
	"packageManager": "pnpm@11.9.0"
}
```

Then add the web tools:

```sh
pnpm add -D svelte @sveltejs/kit @sveltejs/vite-plugin-svelte @sveltejs/adapter-static vite typescript svelte-check tailwindcss @tailwindcss/vite tw-animate-css vitest @types/node
pnpm add @tauri-apps/api
pnpm add -D @tauri-apps/cli
```

That is the whole web toolchain. Other packages arrive in the chapter that needs them (`@lucide/svelte` with the icons, `gsap` with motion, and so on). The final list is FaNWiT's own `package.json`:

<Source path="package.json" />

<Callout kind="new" title="New here: devDependencies and dependencies">

`pnpm add -D` puts a package in `devDependencies`: needed to build the app, not shipped as such. `pnpm add` puts it in `dependencies`. For a front end that Vite bundles the line is blurry, since both end up bundled if imported; FaNWiT keeps runtime libraries (the Tauri API, its plugins, SQLite) in `dependencies` so it is clear what the app actually runs.

</Callout>

## 2. SvelteKit: a single-page app

Three small files make SvelteKit build a set of static files with no server.

`svelte.config.js`, first version (the manual's Markdown support joins it in the Features stage):

```js
import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// one index.html serves every route: windows are /, /w/settings, /w/manual, ...
		adapter: adapter({ fallback: "index.html" }),
		alias: {
			$fanwit: "src/fanwit",
			"$fanwit/*": "src/fanwit/*",
			$application: "src/app",
			"$application/*": "src/app/*",
			$appconfig: "app.config.ts"
		}
	},
	vitePlugin: {
		// your components use runes; packages in node_modules decide for themselves
		dynamicCompileOptions: ({ filename }) => (filename.includes("node_modules") ? undefined : { runes: true })
	}
};

export default config;
```

`src/routes/+layout.ts`, which applies to every page:

<Source path="src/routes/+layout.ts" from="export" />

`vite.config.ts`, first version (FaNWiT's grows several settings over the rebuild):

```ts
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	clearScreen: false, // keep Tauri's output visible in the same terminal
	server: {
		strictPort: true, // Tauri loads exactly http://localhost:3000; never silently move
		watch: { ignored: ["**/src-tauri/target/**", "**/build/**"] } // Cargo's output is huge: do not watch it
	}
});
```

`clearScreen: false` and `strictPort: true` are there for Tauri, which starts the dev server and then loads one fixed URL into the window. The `watch.ignored` line keeps Vite from crawling Cargo's build folder, which grows to gigabytes and would make the first page take seconds to appear.

`tsconfig.json` extends the one SvelteKit generates and turns strictness on:

<Source path="tsconfig.json" open="true" />

<Callout kind="new" title="New here: strict TypeScript">

`"strict": true` switches on the checks that catch the most bugs: values that may be `undefined` must be checked before use, parameters must have types where they cannot be inferred, `this` must be known. `"checkJs": true` applies the checks to `.js` and `.mjs` files too, through JSDoc comments like `/** @param {string} path */`, which is how FaNWiT's plain JavaScript files (the build scripts, the `fw` CLI) are checked as well.

</Callout>

## 3. The page shell and the first route

`src/app.html` is the HTML every window starts from. Start with the plain version:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light dark" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="off">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

(FaNWiT's adds a small script that paints the last theme before the first frame, so windows never flash white. It arrives with themes.)

`src/routes/layout.css` loads Tailwind; the design tokens fill it in the themes chapter:

```css
@import "tailwindcss";
@import "tw-animate-css";
```

`src/routes/+layout.svelte`, for now just the stylesheet and the page:

```svelte
<script lang="ts">
	import "./layout.css";
	let { children } = $props();
</script>

{@render children()}
```

and `src/routes/+page.svelte`:

```svelte
<h1 class="p-8 text-2xl">FaNWiT is starting</h1>
```

Run `pnpm dev` and open http://localhost:3000: the line appears in your browser.

## 4. The Tauri shell

Let the Tauri CLI create the Rust side:

```sh
pnpm tauri init
```

Answer its questions: app name `fanwit`, window title `FaNWiT`, web assets `../build`, dev server `http://localhost:3000`, dev command `pnpm dev`, build command `pnpm build`. It creates `src-tauri/` with a crate, a config file, icons and a default capability.

Two files to shape now. The library, `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

and the program, `src-tauri/src/main.rs`, which is final already:

<Source path="src-tauri/src/main.rs" open="true" />

<Callout kind="new" title="New here: a library and a program in one crate">

`lib.rs` is the crate's **library**; `main.rs` is a tiny **program** that calls it. Tauri's mobile builds need the app as a library (iOS and Android load it, they do not run a `main`), so all the code lives in `run()` and the desktop `main` just calls it. In `Cargo.toml`, `[lib] name = "fanwit_lib"` names the library, which is why `main` calls `fanwit_lib::run()`.

`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` is an attribute for the whole crate (the `!`): in release builds on Windows, do not open a console window behind the app.

</Callout>

In `src-tauri/tauri.conf.json`, check the `build` section points at the dev server and the build output:

<Source path="src-tauri/tauri.conf.json" from="frontendDist" until="removeUnusedCommands" />

Now run:

```sh
pnpm tauri dev
```

The first run compiles Tauri and its dependencies (a few minutes); then a window opens with *FaNWiT is starting*.

## Checkpoint

- `pnpm dev` serves the page at http://localhost:3000.
- `pnpm tauri dev` opens it in a desktop window.
- `pnpm check` reports no problems.
- `pnpm build` writes static files to `build/`, and `pnpm tauri build` would package them; try it at the end of the rebuild instead, it takes a while.

<Check question="Why does FaNWiT set ssr = false and use adapter-static with a fallback page?" options={["To make pages load faster from a server", "A desktop app has no server: the build must be plain files, with one index.html that serves every window's URL", "Tauri cannot run JavaScript otherwise"]} answer={1}>

Tauri loads the built files from inside the app. There is no server to render pages, so everything renders in the window, and the fallback `index.html` answers `/`, `/w/settings` and every other window URL.

</Check>
