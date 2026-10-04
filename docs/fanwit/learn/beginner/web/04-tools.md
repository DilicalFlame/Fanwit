---
title: Node, pnpm and Vite
section: Web basics
order: 4
summary: The tools around the code. Node runs JavaScript outside the browser, pnpm installs packages, and Vite serves the app while you work and builds it when you ship.
---
# Node, pnpm and Vite

The code you have seen so far runs in a page. Building that page takes a few tools that run on your computer instead, in a terminal. You will type their commands every day, so it pays to know what each one does.

<Callout kind="why">

FaNWiT is made of a few hundred files of TypeScript, Svelte and CSS, plus libraries other people wrote. A browser cannot run a `.svelte` or `.ts` file, and should not have to download a few hundred files one by one. The tools turn the files you write into the few files a browser can run, fetch the libraries, and while you work, update the page the moment you save.

</Callout>

```tikz caption="From the files you write to the window you see" alt="Your files and packages from npm go into Vite, which serves them to the window while you work, or builds them into a few files that Tauri ships"
\begin{tikzpicture}[x=1mm,y=1mm,
  box/.style={fwnode,text width=30mm,minimum height=13mm},
  tool/.style={fwcore,text width=26mm,minimum height=13mm,font=\small\bfseries}]
\node[box,fill=fwWarmSoft,draw=fwWarm] (src) at (0,12) {Your files\\[1pt]{\scriptsize .svelte, .ts, .css}};
\node[box,fill=fwPaper,draw=fwSlate] (npm) at (0,-6) {Packages\\[1pt]{\scriptsize installed by pnpm}};
\node[tool] (vite) at (45,3) {\faIcon{bolt}\ Vite};
\node[box,fwuser] (dev) at (92,14) {The window\\[1pt]{\scriptsize pnpm dev: updates on save}};
\node[box,fwhost] (build) at (92,-8) {A few files\\[1pt]{\scriptsize pnpm build: for Tauri to ship}};
\draw[fwarrow] (src) -- (vite);
\draw[fwarrow] (npm) -- (vite);
\draw[fwarrow] (vite) -- node[fwlabel,above,sloped]{while you work} (dev);
\draw[fwarrow] (vite) -- node[fwlabel,below,sloped]{to ship} (build);
\node[fwlabel] at (45,-8) {Node runs all of this};
\end{tikzpicture}
```

## Node: JavaScript outside the browser

**Node** runs JavaScript on your computer, with access to files and the network. You will rarely write code for it directly; the tools below are programs written for Node. FaNWiT's developer CLI, `pnpm fw`, is one too (`packages/fw/fw.mjs`).

## pnpm: packages and scripts

Libraries are published as **packages** on npm. `package.json` lists the ones the project uses, and **pnpm** installs them into `node_modules/` (`pnpm install`, after you clone). `pnpm-lock.yaml` records the exact versions, so every computer gets the same ones: commit it, never edit it by hand.

`package.json` also names **scripts**, the project's everyday commands:

```json
"scripts": {
	"dev": "vite dev --port 3000",
	"build": "vite build",
	"check": "svelte-kit sync && svelte-check ...",
	"test": "vitest run && ...",
	"docs": "node packages/fw/fw.mjs docs serve"
}
```

`pnpm dev` runs the `dev` script. In FaNWiT you will use `pnpm dev` (the app in a browser), `pnpm tauri dev` (the desktop app), `pnpm check` (types and Svelte warnings), `pnpm test`, `pnpm run docs` (this manual) and `pnpm fw ...` (the generators).

## Vite: the dev server and the build

**Vite** does two jobs:

- **While you work** (`pnpm dev`): a server that turns each file into something the browser can run the moment it is asked for, and when you save, swaps in just the changed module without reloading the page (*hot module replacement*). Your playground edits here work the same way, inside the page.
- **To ship** (`pnpm build`): it bundles everything into a few optimised files. Tauri puts those inside the desktop app, and `pnpm fw docs build` puts them on a website.

Its settings are in `vite.config.ts`; FaNWiT adds its manual plugin there, which is what turns these Markdown pages, diagrams and playgrounds into the manual you are reading.

<Check question="You cloned FaNWiT and pnpm dev fails with &quot;command not found: vite&quot;. What is missing?" options={["Vite must be installed separately on the computer", "pnpm install: the project's packages, Vite among them, are not in node_modules yet", "The port 3000 is taken"]} answer={1}>

Vite is one of the project's packages, listed in package.json. `pnpm install` puts it, and everything else the project needs, into node_modules.

</Check>

<Callout kind="learn-more">

[Node.js](https://nodejs.org/en/learn/getting-started/introduction-to-nodejs), [pnpm](https://pnpm.io/motivation) and Vite's [guide](https://vite.dev/guide/) explain each tool. The first Rebuild chapter walks through installing them.

</Callout>
