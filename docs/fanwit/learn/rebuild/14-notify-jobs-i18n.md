---
title: Notifications, jobs and translations
section: "Rebuild: services"
order: 1
summary: The first services built on the kernel. One notification API that routes to a toast, the OS or the notification centre by itself; background jobs with progress and a concurrency limit; and messages with plurals in any language.
---
# Notifications, jobs and translations

With the kernel in place, this stage builds the **services**: the systems every feature uses. They start small: how the app tells you something (`notify/notify.svelte.ts`), how it does long work without freezing (`kernel/jobs.svelte.ts`), and how it speaks your language (`kernel/i18n.svelte.ts`).

<Callout kind="why">

A feature should say *what* it wants to tell the user, not *how*: "the export finished" is the same message whether the window is in front (a toast in the corner), behind other windows (an OS notification) or in Do not disturb (quietly into the notification centre). If each feature picked the surface itself, they would pick differently, and none would respect quiet hours. So there is one `send`, and a **routing policy** decides (Chapter 10, Figure 10.1). The user can then tune it per **channel**: mute a plugin's reminders, keep its errors.

</Callout>

```tikz caption="One send, routed: where a notification goes depends on the situation, not on the caller" alt="send goes to a decision: an explicit route wins; in do not disturb, to the centre (and the OS if urgent); with the window focused, a toast; otherwise the OS and the centre, and a taskbar flash if high priority"
\begin{tikzpicture}[x=1mm,y=1mm,
  q/.style={fwnode,fwwarm,text width=30mm,minimum height=10mm,font=\scriptsize},
  dest/.style={fwnode,fwuser,text width=30mm,minimum height=9mm,font=\scriptsize}]
\node[fwnode,fwcore,font=\small\ttfamily] (send) at (0,30) {notify.send(spec)};
\node[q] (route) at (0,16) {route given?\\toast, os, center};
\node[q] (dnd) at (0,0) {Do not disturb or quiet hours?};
\node[q] (focus) at (0,-16) {window focused?};
\node[dest] (o1) at (48,16) {exactly that route};
\node[dest] (o2) at (48,0) {centre (OS too if urgent)};
\node[dest] (o3) at (48,-16) {a toast};
\node[dest] (o4) at (0,-33) {OS notification and centre; taskbar flash if high};
\draw[fwarrow] (send) -- (route);
\draw[fwarrow] (route) -- node[fwlabel,left]{no} (dnd);
\draw[fwarrow] (dnd) -- node[fwlabel,left]{no} (focus);
\draw[fwarrow] (focus) -- node[fwlabel,left]{no} (o4);
\draw[fwarrow] (route) -- node[fwlabel,above]{yes} (o1);
\draw[fwarrow] (dnd) -- node[fwlabel,above]{yes} (o2);
\draw[fwarrow] (focus) -- node[fwlabel,above]{yes} (o3);
\node[fwlabel,text width=40mm,align=left,anchor=west] at (68,0) {then the channel's own settings may turn a toast or an OS notification off, and warnings and errors are kept in the centre};
\end{tikzpicture}
```

## Notifications

<Source path="src/fanwit/notify/notify.svelte.ts" from="export interface NotificationSpec" to="}" />

A notification is a title, an optional body (Markdown), a kind, a priority, a channel, buttons (`actions`, each running a **command**, so notifications can do anything a menu can) and options. It becomes a `NotificationItem` with an id, a time, a read flag and a counter.

<Callout kind="new" title="New here: Required, Pick and Omit together">

`interface NotificationItem extends Required<Pick<NotificationSpec, "title" | "kind" | "priority">>`: `Pick` takes those three properties from the spec, and `Required` removes their `?`. An item always has a kind and a priority, even when the spec left them out. `Required<Omit<ChannelDef, "description">>` in `channel()` does the reverse trick: every field required except the description.

</Callout>

### send

<Source path="src/fanwit/notify/notify.svelte.ts" from="	send(spec: NotificationSpec): NotificationItem {" until="		if (toast) {" />

In order:

1. **Defaults**: kind `info`; an error gets high priority.
2. **Collapse duplicates**: the same notification again within five seconds bumps a counter on the existing toast instead of stacking a second one ("Synced ×3").
3. **The channel**: a disabled channel, or one whose minimum priority is higher, drops it (it still returns the item, so callers never need to check).
4. **Route** by the policy in the diagram, then let the channel's own settings switch the toast or the OS notification off (`toast &&= channel.toast`).

<Callout kind="new" title="New here: logical assignment, and several lets on one line">

`toast &&= channel.toast` means `toast = toast && channel.toast`: it can only turn a `true` off. Its siblings are `||=` and `??=`. `let toast = false, os = false, center = ...;` declares several variables in one statement.

</Callout>

Toasts have lifetimes by kind (four seconds for info, eight for warnings, errors stay until dismissed), pause while the pointer is over them, and a 200 ms tick removes the expired ones.

### error and progress

<Source path="src/fanwit/notify/notify.svelte.ts" from="error(err: unknown, source" to="	}" />

`notify.error(e)` is how every part of FaNWiT reports a failure: the message as the title, the FanwitError's **hint** as the body, and an **Open docs** button when it has a docs link. A cancelled operation is not an error and shows nothing.

`progress(spec)` returns a handle: `report(fraction, message)` updates the toast and the taskbar progress, `done()` or `fail(e)` ends it and moves a summary into the centre; `signal` is aborted when the user presses Cancel.

<Callout kind="new" title="New here: $state.snapshot">

`this.persistItems($state.snapshot(this.items))` hands the list to storage. `items` is reactive state, which Svelte wraps in proxies to track changes; `$state.snapshot` makes a plain copy without them, safe to serialise or send elsewhere.

</Callout>

<Source path="src/fanwit/notify/notify.svelte.ts" />

## Background jobs

`JobService.run(title, fn)` runs async work with progress, cancellation and a **concurrency limit** (four at a time; the rest queue), and mirrors it into a progress notification unless `silent`. Indexing a vault, importing files, exporting a site: all jobs.

<Source path="src/fanwit/kernel/jobs.svelte.ts" from="	run<T>(title: string" until="			if (this.running < this.concurrency)" />

<Callout kind="new" title="New here: crypto.randomUUID">

`crypto.randomUUID()` gives a random identifier like `"3b241101-e2bb-4255-8caf-4136c566a962"`, built into browsers and Node. Good for ids that must never collide across windows and sessions.

</Callout>

<Source path="src/fanwit/kernel/jobs.svelte.ts" />

## Translations

Every piece of interface text can be translated: messages are data, per module and per locale, written in a subset of **ICU MessageFormat**:

```text
"vault.notes": "{count, plural, =0 {No notes} one {# note} other {# notes}}"
"welcome": "Welcome back, {name}"
```

`formatMessage` interprets that syntax. Plurals use the browser's `Intl.PluralRules`, which knows that English has "one" and "other", Russian has four forms, and Japanese one; numbers are formatted for the locale (`1,234` or `1.234`).

<Source path="src/fanwit/kernel/i18n.svelte.ts" from="export class I18nService" to="}" />

`t(key, params, fallback)` looks the key up in the current locale, then the base language (`de` for `de-AT`), then English, then the fallback. Reading `this.locale` first makes every `t()` call in a component reactive: change the language and every visible string updates. The **pseudo** locale (`［Séttíñgs~~］`) accents and lengthens every string, so untranslated text and layouts that break with longer languages are easy to spot.

<Callout kind="new" title="New here: Intl">

`Intl` is the built-in internationalisation API: `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` ("3 minutes ago", "yesterday") and `Intl.PluralRules`, all locale-aware, with no library to download.

</Callout>

<Source path="src/fanwit/kernel/i18n.svelte.ts" />

## Checkpoint

<Source path="src/fanwit/notify/notify.test.ts" />

<Source path="src/fanwit/kernel/jobs.test.ts" />

<Source path="src/fanwit/kernel/i18n.test.ts" />

```sh
pnpm vitest run src/fanwit/notify src/fanwit/kernel
```

<Check question="An export finishes while the window is behind another app, and Do not disturb is off. Where does the notification go?" options={["A toast in the corner", "An OS notification, and into the notification centre", "Nowhere until the window is focused"]} answer={1}>

An unfocused window cannot show a toast anyone would see, so the policy uses the OS notification and keeps it in the centre. High priority ones also flash the taskbar.

</Check>
