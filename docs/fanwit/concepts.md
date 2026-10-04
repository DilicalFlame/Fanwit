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

## Hackable by default, safe by design

**The problem:** apps either lock users out of their own tools, or let plugins do anything.

**The rule:** every surface can be inspected and changed in developer mode, and every file the app writes is yours to edit. Runtime <Term name="plugin">plugins</Term> run off the main thread with the permissions they declare (unless the app accepts `isolation = "none"`), and Rust checks every file path against the folders you chose.

## The pieces

| Concept | Meaning |
|---|---|
| Module | A feature: static contributions plus a lazily loaded `activate(ctx)` |
| Contribution | Data a module declares: commands, menus, views, settings, themes |
| Context key | A named value describing the current situation, used in `when` clauses |
| Host | The platform adapter (Tauri, browser, memory) below the kernel |
| Scope | Where data lives: memory, session, window, global, vault |
| Vault | A folder the user chose, holding their files and an `.fanwit` folder |

Every term has an entry in the [Glossary](manual://fanwit/reference/glossary). Words underlined with dots in any page show their definition when you hover them.
