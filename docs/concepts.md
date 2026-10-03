---
title: Concepts
section: Concepts
order: 1
---
# Concepts

The principles that shape every decision:

- **Everything is a command.** Menus, shortcuts, the palette, toolbar buttons, the CLI, deep links, plugins and tests all invoke the same commands.
- **State is data, and data is live.** Layouts, keybindings, menus, themes and settings are TOML files. Editing a file updates the app; changing the app rewrites the file, preserving your comments.
- **Declare first, load later.** Modules describe their contributions as data; code loads only when an activation event fires.
- **One layout API, two hosts.** You state intent ("a child window that locks focus"); the host decides how it appears on desktop or web.
- **Hackable by default, safe by design.** Every surface can be inspected and changed in developer mode; runtime plugins run with declared permissions.

## The pieces

| Concept | Meaning |
|---|---|
| Module | A feature: static contributions plus a lazily loaded `activate(ctx)` |
| Contribution | Data a module declares: commands, menus, views, settings, themes |
| Context key | A named value describing the current situation, used in `when` clauses |
| Host | The platform adapter (Tauri, browser, memory) below the kernel |
| Scope | Where data lives: memory, session, window, global, vault |
| Vault | A folder the user chose, holding their files and an `.fanwit` folder |
