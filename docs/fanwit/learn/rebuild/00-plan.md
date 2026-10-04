---
title: The plan
section: "Rebuild: the project"
order: 0
summary: How the rebuild works. You build all of FaNWiT, file by file, in an order where nothing is used before it exists, and every chapter ends with something that works.
---
# The plan

This part rebuilds FaNWiT, all of it, from an empty folder. Not a toy version: by the last chapter your folder holds the same files as this repository, and you will have written (or at least read, understood and placed) every one of them.

<Callout kind="why">

Reading a finished codebase shows you what it is. Building it shows you why it is that way: which piece had to exist first, which problem each file solves, and what would break without it. And if you stream it, every chapter is an episode with a beginning (a problem), a middle (the code) and an end (something that now works).

</Callout>

## How a chapter works

Every chapter follows the same shape:

1. **Why.** The problem this part of FaNWiT solves, usually in the words of the specification it was built from.
2. **The design.** A diagram and the main ideas, before any code.
3. **The files.** Each file, explained in pieces, then shown whole. The files you see are read straight from this repository when the manual is built, so they are always the real, current code, never a copy that drifted. Long files are folded; open them when you are ready to type or copy.
4. **New here.** Whenever the code uses a TypeScript, Svelte, Rust or Tauri feature the foundation chapters did not cover, a pink box explains it right there.
5. **Checkpoint.** What works now, and how to check it: a test to run, a command to try, or the app itself.

<Callout kind="new" title="New here: the boxes like this one">

They introduce a language or framework feature the first time the code needs it. Over the rebuild they add up to everything FaNWiT uses, in the order it uses it.

</Callout>

## The order

FaNWiT's files import each other. Building them in the wrong order means writing code that refers to things that do not exist yet. The order here follows the real dependencies: each file only uses files from earlier chapters (with three small exceptions, pairs of files that need each other, which are written together).

```tikz caption="The eight stages of the rebuild, bottom up: each one stands on the ones below it" alt="Eight stacked layers from the project at the bottom to tools and shipping at the top"
\begin{tikzpicture}[x=1mm,y=1mm,
  stage/.style={fwnode,text width=110mm,minimum height=9mm,font=\small,align=left},
  num/.style={font=\small\bfseries,text=fwSlate,anchor=east}]
\node[stage,fill=fwPaper,draw=fwSlate] (s1) at (60,0) {\textbf{The project}: an empty folder becomes a Tauri window; tests and conventions};
\node[stage,fwwarm] (s2) at (60,11) {\textbf{Foundations}: disposables, the host contract, errors, context keys, commands, keys, events};
\node[stage,fwwarm] (s3) at (60,22) {\textbf{The kernel}: one per window; modules that declare first and load later};
\node[stage,fwcore] (s4) at (60,33) {\textbf{Services}: notifications, data, settings, themes, layout, windows, menus, palette};
\node[stage,fwcore] (s5) at (60,44) {\textbf{The window}: the core module, the layout renderer, the workbench, boot: the app appears};
\node[stage,fwhost] (s6) at (60,55) {\textbf{The Rust core}: sandboxed files, TOML, SQLite, windows, CLI bridge, sidecars, security};
\node[stage,fwuser] (s7) at (60,66) {\textbf{Features}: views, editors, labs, devtools, plugins, the manual, your app};
\node[stage,fwuser] (s8) at (60,77) {\textbf{Tools and shipping}: the fw CLI, schemas, CI, the Installer Kit};
\foreach \i in {1,...,8} { \node[num] at (3,{(\i-1)*11}) {\i}; }
\end{tikzpicture}
```

Stages 2 to 4 run without a window: you check them with tests, the same tests FaNWiT runs in CI. At stage 5 everything you built comes alive in one go, and from then on every chapter adds something you can see.

## What you need

- The foundations: **Web basics**, **Svelte basics**, **SvelteKit basics**, **Rust basics** and **Tauri basics**. The rebuild refers back to them instead of repeating them.
- The tools from *What Tauri is*: Node 22 or newer, pnpm, Rust through rustup, and your system's Tauri prerequisites.
- This repository open beside your new folder. When in doubt, compare your file with the real one.

<Callout kind="tip" title="If you stream it">

Each chapter is sized for one episode. Read the chapter before you go live, build along with it on stream, and end on its checkpoint. The diagrams open large when clicked, which works well for explaining on screen.

</Callout>
