---
title: Concepts
section: Concepts
order: 1
summary: The five principles behind FaNWiT, and the problem each one solves.
---
# Concepts

FaNWiT is opinionated in five places. Each opinion solves a problem that desktop apps usually run into, and knowing the problem makes the rest of the manual predictable.

## Everything is a command

**The problem:** one feature reachable from a menu, a shortcut, a toolbar button and a script ends up implemented four times, and the copies disagree.

**The rule:** every action is a <Term name="command" />. Menus, shortcuts, the palette, toolbar buttons, the CLI, deep links, plugins and tests all run commands, so one implementation serves them all. See [Commands](manual://fanwit/guides/commands).

## State is data, and data is live

**The problem:** settings, keybindings and layouts locked inside an app are hard to back up, compare, share or fix by hand.

**The rule:** layouts, keybindings, menus, themes and settings are TOML files. Editing a file updates the app, and changing the app rewrites the file without losing your comments. This is your `settings.toml`, live: change a reading setting with the **Aa** button and watch the file follow.

<LiveToml file="settings" />

<Callout kind="under-the-hood">

Writes are debounced (about 150 ms) and preserve comments and formatting: every host edits the file in place with `toml_edit` instead of rewriting it (the web host runs the same Rust code as WebAssembly). When a file changes on disk, the app reloads it; an invalid edit keeps the last good state and reports the problem instead of crashing.

</Callout>

## Declare first, load later

**The problem:** apps get slower with every feature, because every feature's code loads at startup.

**The rule:** a <Term name="module" /> declares its <Term name="contribution">contributions</Term> (commands, views, menus, settings) as plain data, which costs almost nothing. Its code loads only when an <Term name="activation event" /> fires: the first time one of its commands runs or one of its views opens.

## One layout API, two hosts

**The problem:** the same app on the desktop and in a browser usually means two UIs, or one that feels wrong on both.

**The rule:** you state intent ("a child window that locks focus", "a sidebar view") and the <Term name="host" /> decides how it appears: a native window on the desktop, an in-page <Term name="virtual window" /> on the web. Feature code asks what the host can do (`ctx.host.caps`) instead of asking which platform it is on. This manual is an example: it is one layout <Term name="preset" />, shown as a desktop window or as a web site.

<LayoutPreview preset="manual" height={240} />

Where the web cannot do what the desktop does, the difference is a capability you can check, not a silent change in behaviour:

| Desktop | Web | Check |
|---|---|---|
| Native windows | In-page virtual windows | `caps.nativeWindows` |
| Files anywhere you allow | A picked folder (File System Access) or browser storage (OPFS) | `caps.fileSystem` |
| Delete moves to the OS trash | Delete moves to the vault's `.trash` folder | `caps.osTrash` |
| Global shortcuts, tray, native menu bar | None, none, an in-page menu bar | `caps.globalShortcuts`, `caps.tray`, `caps.menubar` |
| OS notifications with actions | Basic notifications, if permitted | `caps.osNotifications` |
| Native dialogs | In-page dialogs (plugin CSS is switched off while one is open) | none needed |

Renaming a folder on the web copies it and then deletes the original, because browsers have no move yet, so it is not atomic.

## Hackable by default, safe by design

**The problem:** apps either lock users out of their own tools, or let plugins do anything.

**The rule:** every surface can be inspected and changed in developer mode, and every file the app writes is yours to edit. Runtime <Term name="plugin">plugins</Term> run off the main thread with the permissions they declare (unless the app accepts `isolation = "none"`), and Rust checks every file path against the folders you chose.

## The pieces

FaNWiT is six layers. Each one only talks to the layer below it, and only the host layer knows whether it runs on the desktop or in a browser:

```tikz caption="The six layers of FaNWiT. Everything above the dashed line is identical on desktop and web." alt="Six stacked layers: Platform, Host, Kernel, Systems, UI kit and Features"
\begin{tikzpicture}[x=1cm,y=1cm,
  box/.style={draw,rounded corners=2pt,minimum height=7.5mm,font=\scriptsize,align=center,inner sep=2pt},
  lyr/.style={font=\scriptsize\bfseries\color{fwSlate},anchor=east,align=right}]
  \begin{scope}[reveal=6]
  % Layer 6
  \node[lyr] at (0.2,7.2) {6 Features};
  \node[box,fill=fwGreenSoft,draw=fwGreen,text width=6.3cm] at (3.65,7.2) {App modules (compile time, your code)};
  \node[box,fill=fwGreenSoft,draw=fwGreen,text width=6.3cm] at (10.25,7.2) {Runtime plugins (vault or app, lazy)};
  \end{scope}
  \begin{scope}[reveal=5]
  % Layer 5
  \node[lyr] at (0.2,6.0) {5 UI kit};
  \node[box,fill=fwWarmSoft,draw=fwWarm,text width=6.3cm] at (3.65,6.0) {shadcn-svelte components (owned source)};
  \node[box,fill=fwWarmSoft,draw=fwWarm,text width=6.3cm] at (10.25,6.0) {Workbench: TitleBar, TabStrip, Dock, Palette};
  \end{scope}
  \begin{scope}[reveal=4]
  % Layer 4
  \node[lyr] at (0.2,4.65) {4 Systems};
  \foreach \n [count=\i from 0] in {Commands,Keys,Menus,Layout,Windows,Notify,Themes,Settings,Data,Plugins}
    \node[box,fill=fwBrandSoft,draw=fwBrand,text width=1.08cm,font=\tiny,text height=1.6ex,text depth=0.4ex] at (0.95+\i*1.32,4.65) {\n};
  \end{scope}
  \begin{scope}[reveal=3]
  % Layer 3
  \node[lyr] at (0.2,3.35) {3 Kernel};
  \node[box,fill=fwBrandSoft!50,draw=fwBrand,text width=13cm,font=\tiny] at (6.95,3.35)
    {Service container \quad Context keys and when clauses \quad Event bus \quad Contribution registry \quad Lifecycle \quad Logger \quad Disposables};
  \end{scope}
  \begin{scope}[reveal=2]
  % Layer 2
  \node[lyr] at (0.2,2.05) {2 Host};
  \node[box,fill=fwAccentSoft,draw=fwAccent,text width=4cm] at (2.55,2.05) {TauriHost};
  \node[box,fill=fwAccentSoft,draw=fwAccent,text width=4cm] at (6.95,2.05) {BrowserHost};
  \node[box,fill=fwAccentSoft,draw=fwAccent,text width=4cm] at (11.35,2.05) {RemoteHost (optional)};
  \end{scope}
  \begin{scope}[reveal=1]
  % Layer 1
  \node[lyr] at (0.2,0.7) {1 Platform};
  \node[box,fill=fwPaper,draw=fwSlate,text width=4cm,minimum height=10mm] at (2.55,0.7) {Rust core crates\\ Tauri runtime, OS APIs};
  \node[box,fill=fwPaper,draw=fwSlate,text width=4cm,minimum height=10mm] at (6.95,0.7) {Browser APIs: OPFS, FS Access,\\ Notification, BroadcastChannel};
  \node[box,fill=fwPaper,draw=fwSlate,text width=4cm,minimum height=10mm] at (11.35,0.7) {Your server\\ (HTTP or WebSocket)};
  \end{scope}
  \begin{scope}[reveal=7]\begin{scope}[pulse]
  \draw[fwBrand,thick,dashed] (0.35,2.72) -- (13.55,2.72);
  \node[font=\tiny\color{fwBrand},anchor=north east,fill=white,inner sep=1pt] at (13.55,2.7) {Host interface: the only code that knows where it runs};
  \end{scope}\end{scope}
\end{tikzpicture}
```

| Concept | Meaning |
|---|---|
| Module | A feature: static contributions plus a lazily loaded `activate(ctx)` |
| Contribution | Data a module declares: commands, menus, views, settings, themes |
| Context key | A named value describing the current situation, used in `when` clauses |
| Host | The platform adapter (Tauri, browser, memory) below the kernel |
| Scope | Where data lives: memory, session, window, global, vault |
| Vault | A folder the user chose, holding their files and an `.fanwit` folder |

Every term has an entry in the [Glossary](manual://fanwit/reference/glossary). Words underlined with dots in any page show their definition when you hover them.
