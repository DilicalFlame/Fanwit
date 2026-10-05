# Start here

This level assumes you have never written Svelte or Rust, and have never built a desktop app. By its end you will have built FaNWiT again from an empty folder, one small working step at a time, and you will know why each part is shaped the way it is.

<Callout kind="why">

FaNWiT is a large codebase: a Svelte interface, a Rust core and a few hundred files between them. Reading it top to bottom teaches you what it is, not how to make something like it. So this level rebuilds it instead. Every chapter adds one idea to a program that already works, and ends with that program still working. When you reach a part of the real code, you will recognise it, because you will have written a smaller version of it yourself.

</Callout>

## The route

```tikz caption="The Beginner level: four foundations, then the rebuild" alt="Five boxes left to right: Web basics, Svelte basics, Rust basics, Tauri basics, then Rebuild FaNWiT, which is larger"
\begin{tikzpicture}[x=1mm,y=1mm,font=\sffamily\small,
  stop/.style={circle,minimum size=13mm,line width=1.2pt,font=\huge},
  name/.style={font=\small\bfseries,text=fwInk,align=center},
  what/.style={font=\scriptsize,text=fwSlate,align=center,text width=42mm}]
% the road
\begin{scope}[reveal=0]
  \draw[line width=7pt,fwGrid,line cap=round] plot[smooth,tension=0.7] coordinates {(0,10) (36,24) (72,8) (108,24) (150,14)};
\end{scope}
\begin{scope}[reveal=0]\begin{scope}[packet]
  \draw[line width=0.8pt,fwSlate!60,dash pattern=on 2pt off 3pt] plot[smooth,tension=0.7] coordinates {(0,10) (36,24) (72,8) (108,24) (150,14)};
\end{scope}\end{scope}
% the stops
\begin{scope}[reveal=1]
  \node[stop,fill=fwWarmSoft,draw=fwWarm,text=fwWarm!80!black] at (0,10) {\faIcon{globe}};
  \node[name] at (0,-2) {Web basics};
  \node[what] at (0,-7) {HTML, CSS, JavaScript, TypeScript};
\end{scope}
\begin{scope}[reveal=2]
  \node[stop,fill=fwWarmSoft,draw=fwWarm,text=fwWarm!80!black] at (36,24) {\faIcon{code}};
  \node[name] at (36,41) {Svelte basics};
  \node[what] at (36,36) {components, state, runes};
\end{scope}
\begin{scope}[reveal=3]
  \node[stop,fill=fwAccentSoft,draw=fwAccent,text=fwAccent!80!black] at (72,8) {\faIcon{cog}};
  \node[name] at (72,-4) {Rust basics};
  \node[what] at (72,-9) {ownership, enums, Result};
\end{scope}
\begin{scope}[reveal=4]
  \node[stop,fill=fwAccentSoft,draw=fwAccent,text=fwAccent!80!black] at (108,24) {\faIcon[regular]{window-maximize}};
  \node[name] at (108,41) {Tauri basics};
  \node[what] at (108,36) {a window, and talking to Rust};
\end{scope}
\begin{scope}[reveal=5]
  \begin{scope}[pulse]\fill[fwBrandSoft] (150,14) circle (11mm);\end{scope}
  \node[stop,minimum size=16mm,fill=fwBrand,draw=fwBrand,text=white,font=\LARGE] at (150,14) {\faIcon{rocket}};
  \node[name] at (150,-1) {Rebuild FaNWiT};
  \node[what] at (150,-6) {20 steps, each one working};
\end{scope}
\end{tikzpicture}
```

1. **Web basics.** Just enough HTML, CSS, JavaScript and TypeScript to read a Svelte file. If you already write JavaScript, skim it.
2. **Svelte basics.** Components, state that updates the screen by itself (runes), events, lists and conditions. You type into live editors on the page and see the result at once. Then **SvelteKit basics**: how folders become windows, and how the project fits together.
3. **Rust basics.** Variables, ownership, structs and enums, errors as values, modules. Rust examples run on the official Rust Playground from the page.
4. **Tauri basics.** How a Rust program opens a window that shows a web page, and how the two talk to each other.
5. **Rebuild FaNWiT.** From a blank window to a host seam, a kernel, commands, shortcuts, a palette, layouts as TOML, settings, themes, a sandboxed file system in Rust, menus, windows, notifications, this manual, plugins, the `fw` CLI, the installer, and tests. Each step ends at a checkpoint you can compare with the real code.

The foundations and the rebuild are being written chapter by chapter; the contents on the left show what is ready.

## How a chapter works

Every chapter follows the same shape, so you always know where you are:

- **Why first.** A purple *Why it is like this* box says what problem the chapter's idea solves. On Beginner pages it is always open.
- **Diagrams.** Pictures of what talks to what, drawn in the same style as the specification FaNWiT was built from.
- **Labs.** Live editors with a goal: change the code until it does what the lab asks. Your edits are kept in this browser.
- **Checks.** A short question at the end of a section. Getting one wrong shows why.
- **Checkpoints.** In the rebuild, the full code as it should be after the chapter, next to the file it grows into in FaNWiT.

<Callout kind="learn-more">

This manual teaches what FaNWiT needs, not each language in full. When you want the whole story, the official guides are excellent and free: the [Svelte tutorial](https://svelte.dev/tutorial) (interactive, in the browser), [The Rust Programming Language](https://doc.rust-lang.org/book/) with its [Rust by Example](https://doc.rust-lang.org/rust-by-example/) companion, and the [Tauri guides](https://v2.tauri.app/start/). Chapters link to the exact page that goes deeper.

</Callout>

## What you need

A computer with Windows, macOS or Linux, and about an hour to install the tools. The first rebuild chapter walks through each install; for the foundations, a browser is enough, because every example runs on the page.

<Check question="What does the Beginner level build?" options={["A to-do app that uses FaNWiT", "FaNWiT itself, again, from an empty folder", "Only small exercises, no real program"]} answer={1}>

The rebuild makes a smaller FaNWiT step by step. The foundations before it are exercises, but each one is something the rebuild uses.

</Check>
