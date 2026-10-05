# Panels and system views

This chapter collects the views that surround the actual work: what you see first, what helps when something goes wrong, and what tells you what the app is doing. Each is small, and each is built from services you already have. Together they make the difference between a demo and an app someone can rely on.

<Callout kind="why">

Empty states, onboarding, logs and crash reports are usually written last and in a hurry, so they are where apps feel unfinished. Building them on the same commands, settings and windows as everything else makes them cheap to get right: a button on the welcome tab is a command with its shortcut shown next to it, and onboarding's theme picker is the same setting the settings window edits.

</Callout>

## Welcome

<Source path="src/fanwit/views/Welcome.svelte" from="	const actions:" until="	];" />

Every action on the welcome tab is a command id, shown with its title and its **current** keyboard shortcut (`KeyChip`, chapter 26). If you rebind Quick open, the welcome tab teaches the new key. The Labs cards open views through `layout.openView`. Recent vaults come from chapter 17's recent list, and the checkbox at the bottom is the `general.startup.showWelcome` setting itself, not a copy of it.

<Source path="src/fanwit/views/Welcome.svelte" />

## The first run tour

<Source path="src/fanwit/views/Onboarding.svelte" from="	const STEPS" to="	}" />

Onboarding runs once, in its own window (chapter 30's `mainStartup`), with four steps: **Look** (theme and density), **Data** (where vaults live), **Keys** (the shortcut style, `keys.style`) and **Tour**. Every choice is a setting written immediately, so the app behind the window changes as you choose. Nothing is "applied at the end", and closing the tour early keeps what you picked. The theme swatches are drawn from the real themes (`themes.resolve`, chapter 18), so a custom theme previews correctly.

Steps slide in from the side you are moving towards: `$effect.pre` records the direction before the step changes and the DOM updates.

<Callout kind="new" title="New here: $effect.pre and &#123;#key&#125;">

`$effect.pre` runs **before** the DOM updates, where `$effect` runs after. Here it captures the direction of travel just before the new step renders, so the entrance animation knows which way to slide.

`{#key step} ... {/key}` destroys and recreates its content whenever `step` changes. That gives each step a fresh element, so `use:enter` (chapter 18) plays again instead of the content changing in place. [Svelte docs: key](https://svelte.dev/docs/svelte/key)

</Callout>

<Source path="src/fanwit/views/Onboarding.svelte" />

## The vault manager

<Source path="src/fanwit/views/VaultManager.svelte" />

The vault manager is a window (`vault.switch`, chapter 25). Its design rules come from the spec:

- **Exactly one primary action** per screen: Open on the list, Create on the form.
- **Missing vaults are shown, greyed**, with **Locate** instead of being silently dropped, since a folder on an unplugged drive is still yours.
- **A filter** appears once there are more than five vaults, never before.
- **Each row has the `vault/item` menu** (chapter 37's explorer module contributes it): open in a new window, pin, reveal, and remove from list, which keeps your files.

## Developer panels

<Source path="src/fanwit/views/CommandList.svelte" />

**Commands** lists every command by category with its shortcut, greyed when its `when` clause is false here, and runs it on click. It is the palette's long form, and a quick way to see what the app can do.

<Source path="src/fanwit/views/Problems.svelte" />

**Problems** gathers the diagnostics of every live TOML file (chapter 15) into one list. Each entry opens the TOML editor at the right line (chapter 37), and the status bar shows the count (chapter 28). A broken `keys.toml` is therefore never silent: the app keeps working on the last good version, and tells you where the mistake is.

<Source path="src/fanwit/views/Jobs.svelte" />

**Jobs** shows chapter 14's background jobs, with progress bars and Cancel. Its empty state can run a demo job, so you can see what a job looks like before your app has any.

<Source path="src/fanwit/views/Logs.svelte" />

**Logs** shows the ring buffer from chapter 6, with records from Rust merged in (chapter 31). You can filter by level, scope and text, and **follow** the tail as new records arrive. New records are batched once per animation frame, so a burst of a thousand log lines updates the view once, not a thousand times.

<Source path="src/fanwit/views/ContextKeys.svelte" />

**Context keys** shows every key with its live value, and has a box where you can type a `when` clause and see it evaluate (chapter 7). It is the fastest way to answer "why is this command greyed out here?".

## About, Update, Crash

<Source path="src/fanwit/views/system/About.svelte" />

**About** shows versions from `host.app()` (chapter 31): the app, Tauri, the webview, the OS. It also has **Copy info** (the same text as `app.copySystemInfo`) and the licences of the main dependencies.

<Source path="src/fanwit/views/system/Update.svelte" />

**Update** is honest about the template: it ships without an update server. It says what to configure (Tauri's updater plugin with a public key and endpoints) and links to the manual's Operations page. A real app replaces this view's body, and keeps the window kind and the command.

<Source path="src/fanwit/views/system/Crash.svelte" />

**Crash** opens on the launch after a crash (chapter 31's panic hook writes the marker, chapter 30 reads it). It explains what happened in plain words, shows the details, and offers to copy them, to continue, or to **start in safe mode**: one session with code plugins turned off, the usual suspects after a crash.

Writing this chapter found that the safe mode button simply relaunched normally. It now stores a one session marker, which the plugins module reads, clears and saves at start:

<Source path="src/fanwit/plugins/safe-mode.test.ts" />

## Checkpoint

```sh
pnpm vitest run src/fanwit/plugins/safe-mode.test.ts
pnpm dev
```

In the app: close every tab and read the empty state, open Commands, Problems, Jobs (run the demo job) and Logs from the palette, break `keys.toml` on purpose in the TOML editor and watch Problems point at the line, then open About.

<Check question="A user's keys.toml has a typo. What do they experience?" options={["The app fails to start", "Their custom keybindings silently stop working", "The app keeps the last valid bindings, shows the problem count in the status bar, and Problems opens the editor at the line"]} answer={2}>

Every live TOML file is validated on load and on change (chapter 15). An invalid file keeps the previous good state, its diagnostics flow into Problems and the status bar count, and each entry opens the TOML editor at the line.

</Check>
