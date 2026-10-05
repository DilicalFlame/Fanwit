---
title: Labs and developer tools
section: "Rebuild: features"
order: 4
summary: The kitchen sink. Labs that let you poke at every system, from a live layout editor to a menu with colour swatches driving undoable commands, and the developer tools, an event monitor, a command log, a module profiler and a scripting console. All optional, and stripped in one line.
---
# Labs and developer tools

Two modules remain in `core/` besides the ones you have built: `labs.ts` and `devtools.ts`. Neither adds anything an end user needs. Both exist so that you, building on FaNWiT, can **see** each system working and experiment with it before writing code against it.

<Callout kind="why">

Documentation tells you what a system does. A lab lets you try it: edit `workspace.toml` and watch the layout follow, open a child window and click its parent, drag a slider in a context menu and undo it. Building the labs as ordinary modules, on the public APIs, also proves those APIs are enough. And because they are modules behind feature flags, `features: { labs: false }` removes them from your app entirely, and a bare `pnpm fw strip`, which strips every demo part, sets it for you.

</Callout>

## The Labs module

<Source path="src/fanwit/core/labs.ts" from="export const labsModule" until="		windows: [" />

Each lab is a view with `category: "Labs"` and a `help` page in this manual, listed in the Labs sidebar container:

| Lab | What it shows |
|---|---|
| Layout Lab | `workspace.toml` edited live next to a schematic of the tree, plus the action log with each change's origin (chapters 19 and 20) |
| Window Lab | every window kind and option, greyed with the reason where an option does nothing on this platform (chapters 21 and 34) |
| Menu Lab | a small canvas whose context menu has icon rows, colour swatches and a live opacity slider, all undoable (chapters 22 and 29) |
| Notification Lab | every route, kind, priority, progress and dedupe rule (chapter 14) |
| Component Gallery | the shadcn-svelte and workbench components in every state |
| Database Explorer | tables per scope, and queries, read only unless developer mode is on (chapters 15 and 33) |
| Installer Lab | `installer.toml`, simulated machines and the install plan ("Rebuild: tools and shipping") |
| Command and CLI Lab | any command with a form generated from its arguments, and the CLI line that would run it (chapters 9 and 24) |

## The Menu Lab: a recipe in miniature

The Menu Lab is the "Figma style colour menu" recipe. It is worth reading because it shows how a real feature uses the menu system end to end. The shapes live in one module level `$state` object:

<Source path="src/fanwit/views/labs/canvas.svelte.ts" />

<Callout kind="new" title="New here: $state at module level">

`export const canvas = $state({ ... })` in a `.svelte.ts` file makes **shared** reactive state: every component that imports `canvas` sees the same object, and any change updates all of them. Here, the canvas view and the command handlers both use it. For app wide state this is often all you need, with no store library. Only reassign its **properties** (`canvas.shapes = [...]`): reassigning `canvas` itself would only change the importing module's variable.

</Callout>

The `canvas/selection` menu is pure contribution, data in `labs.ts`. It has an icon row of quick actions, colour swatches bound to `canvas.setFill`, an opacity slider with `preview: "canvas.previewOpacity"`, an Arrange submenu, and Delete in the `danger` group with `when: "!selection.locked"`. The handlers return undo records:

<Source path="src/fanwit/core/labs.ts" from="		const change = <T>" to="		};" />

Dragging the slider calls `canvas.previewOpacity` (no undo step, just a preview value). Releasing it calls `canvas.setOpacity` once (one undo step), and that clears the preview. Picking a swatch is one undoable `setFill`. That is the pattern for any live control in a menu: preview cheaply, commit once.

<Source path="src/fanwit/core/labs.ts" />

The Export dialog and the colour picker panel show the two kinds of owned windows. **Open sample export dialog** opens a `child` with `focus = "lock"`, awaits `result`, and reports what was chosen (chapter 21's promise in practice). The colour picker is a `panel` that stays on top. On the web it uses Picture-in-Picture where the browser has it, and a floating card where it doesn't.

<Source path="src/fanwit/views/labs/MenuLab.svelte" />

<Source path="src/fanwit/views/labs/ExportDialog.svelte" />

<Source path="src/fanwit/views/labs/ColorPickerView.svelte" />

## The other labs

<Source path="src/fanwit/views/labs/LayoutLab.svelte" />

The Layout Lab parses and validates the text on every keystroke (chapter 19's `validateLayout`), shows problems with line numbers, and applies a valid edit after a short pause, as if you had saved the file. The action log underneath shows each change with its origin: `ui` when you dragged something, `file` when the text changed, `command` from the palette, `cli` from a terminal. It is the clearest demonstration that the screen and the file are one thing.

<Source path="src/fanwit/views/labs/WindowLab.svelte" />

<Source path="src/fanwit/views/labs/NotificationLab.svelte" />

<Source path="src/fanwit/views/labs/CommandLab.svelte" />

<Source path="src/fanwit/views/labs/DbExplorer.svelte" />

<Source path="src/fanwit/views/labs/ComponentGallery.svelte" />

<Source path="src/fanwit/views/labs/LabsList.svelte" />

The Installer Lab belongs with the Installer Kit and is read in "Rebuild: tools and shipping".

## Developer tools

<Source path="src/fanwit/core/devtools.ts" />

The developer tools are panels, each reading something the kernel already records:

<Source path="src/fanwit/views/dev/EventMonitor.svelte" />

<Source path="src/fanwit/views/dev/CommandLog.svelte" />

**Events** lists app events as they fire (chapter 12), and the **command log** lists every run with its source, arguments, duration and result (chapter 10).

<Source path="src/fanwit/views/dev/ModuleProfiler.svelte" />

The **module profiler** shows each module's activation event and how long `activate` took (chapter 13), next to the startup marks (chapter 12) and frame times. That is how you find the module that makes startup slow.

<Source path="src/fanwit/views/dev/Console.svelte" from="<script lang=" />

The **console** runs JavaScript with `ctx` (a module context of its own) and `k` (the kernel) in scope. Type `await ctx.layout.openView("fanwit.logs")` and it happens. Expressions return their value, and statements run as a function body.

<Callout kind="new" title="New here: new Function and the content security policy">

`new Function("ctx", "k", "return (async () => { ... })()")` compiles a string into a function at run time. It is `eval` with explicit parameters, so the code sees only `ctx` and `k`, not the console's local variables. Compiling code from strings is exactly what a strict content security policy forbids. Only the development policy (chapter 31) allows `'unsafe-eval'`, so in a release build the console explains why it cannot run, instead of failing obscurely.

</Callout>

## Checkpoint

```sh
pnpm exec playwright test e2e/flows.test.ts --project app -g "menu kinds"
```

The test opens the Menu Lab, right clicks a shape, picks a red swatch, checks the shape turned red, and undoes it:

<Source path="e2e/flows.test.ts" from="custom menu kinds drive undoable commands" until="rgb(59, 130, 246)" />

Then try removing Labs: set `features: { labs: false }` in `app.config.ts`, run `pnpm dev`, and the Labs container, the views and their commands are gone. The tests that need them skip themselves (`needsLabs()`, chapter 1's AGENTS.md).

<Check question="Dragging the opacity slider in the Menu Lab from 100 to 40 and releasing. How many undo steps are added?" options={["One per pointer move", "One: moves run the preview command, release runs the undoable command once", "None: menu items are not undoable"]} answer={1}>

The slider emits with `preview: true` while dragging, which runs `canvas.previewOpacity`: no undo record, just a preview value. On release it emits once without preview, running `canvas.setOpacity`, which returns one undo record.

</Check>
