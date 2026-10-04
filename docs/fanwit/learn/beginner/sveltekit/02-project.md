---
title: How the project fits together
section: SvelteKit basics
order: 2
summary: The configuration files, the import shortcuts, the folders, and the two tricks FaNWiT relies on: files found by glob, and builds that change with the mode.
---
# How the project fits together

You now know every language in FaNWiT's front end. This chapter is the map: which file configures what, how an import like `$fanwit/boot.svelte` finds its file, and how the app finds modules it was never told about.

<Callout kind="why">

A template only stays a template if adding to it never means editing it. FaNWiT's rule is that features are added beside the core, not inside it: a new module is a new folder, and nothing else changes. Two build-time tricks make that work, and you will see them everywhere: *globs* that find files by pattern, and *modes* that build different things from the same code.

</Callout>

## The map

<FileTree>

- src/
  - fanwit/ (the core: kernel, services, workbench, manual)
  - app/ (your app)
    - modules/ (your features, one folder each)
    - showcase/ (demo apps you can strip)
  - routes/ (the SvelteKit routes: the windows)
- src-tauri/ (the Rust side, from the Rust and Tauri parts)
- docs/ (this manual, and your app's)
- packages/fw/ (the developer CLI, run as pnpm fw)
- svelte.config.js (Svelte and SvelteKit options)
- vite.config.ts (the dev server and the build)
- app.config.ts (what your app turns on: modules, features, layout)
- package.json

</FileTree>

## Import shortcuts

`svelte.config.js` defines **aliases**, short names for folders, so imports do not depend on where the importing file is:

```js
alias: {
	$fanwit: "src/fanwit",
	$application: "src/app",
	$appconfig: "app.config.ts"
}
```

`import { boot } from "$fanwit/boot.svelte"` works from any file. (`$app` is taken by SvelteKit itself, for things like `$app/state`, which holds the current `page`, and `$app/paths`.)

## Files found by glob

How does FaNWiT know which modules your app has? It never lists them. `src/app/modules/index.ts` asks Vite for every file that matches a pattern:

```ts
const found = {
	...import.meta.glob("./*/module.ts", { eager: true, import: "default" }),
	...import.meta.glob("../showcase/*/module.ts", { eager: true, import: "default" })
};
export const appModules = Object.values(found);
```

`import.meta.glob` is resolved when the app is built: Vite finds the files and writes the imports for you. Add a folder with a `module.ts` and it is part of the app; delete the folder (`pnpm fw strip`) and it is gone, without touching this file. The manual finds its pages, the icon set its icons and the plugin system the built-in plugins the same way.

<Callout kind="tip">

`eager: true` imports the files at once. Without it, each match becomes a function that imports the file when called, which keeps it out of the first download. FaNWiT uses that for every Lucide icon (`src/fanwit/icons/all.ts`): there are thousands, and a window loads only the ones it shows.

</Callout>

## One code base, several builds

Vite builds in a **mode**, and the code can ask which: `import.meta.env.MODE`, plus `import.meta.env.DEV` (true while you work). Like globs, it is known at build time, so a branch that cannot be taken in a mode is left out of that build entirely.

```ts
// src/fanwit/boot.svelte.ts
const config = import.meta.env.MODE === "docs"
	? { ...appConfig, modules: [], layout: { default: "manual" } }
	: appConfig;
```

That is how the docs site (`vite --mode docs`) is the same app as the desktop one, but starts with the manual's layout and none of your app's modules.

## The everyday loop

<Steps>

1. `pnpm dev` (or `pnpm tauri dev` for the desktop window) and keep it running.
2. Change a file and save: Vite swaps in the new module, and the window updates without losing its state.
3. `pnpm check` before you commit: types, Svelte warnings and accessibility.
4. `pnpm test`, and `pnpm fw doctor` when something seems off with the project itself.

</Steps>

<Check question="You add src/app/modules/todo/module.ts. What else must you change for the app to load it?" options={["Add it to src/app/modules/index.ts", "Nothing: the glob in index.ts finds it when the app is built", "Register it in app.config.ts"]} answer={1}>

`import.meta.glob("./*/module.ts")` matches any folder with a module.ts. That is why `pnpm fw add module` and `pnpm fw strip` never edit a list.

</Check>

<Callout kind="learn-more">

Vite's [glob import](https://vite.dev/guide/features.html#glob-import) and [env and modes](https://vite.dev/guide/env-and-mode.html); SvelteKit's [project structure](https://svelte.dev/docs/kit/project-structure) and [configuration](https://svelte.dev/docs/kit/configuration). With this, the web side is covered: next comes Rust, the language of FaNWiT's core.

</Callout>
