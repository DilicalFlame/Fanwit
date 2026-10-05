# Recipes

Each recipe is a whole kind of app, assembled from the systems in the guides. Each one also exists in the template, so you can read real code instead of a description.

<Callout kind="tip">

A recipe tells you which systems to combine and in what shape. When something here is unfamiliar, the guide it links to explains why it works that way.

</Callout>

## Figma style colour menu

A right click menu on a canvas selection, with colour swatches and a live slider.

<Steps>

1. Declare the [location](manual://fanwit/guides/context-menus) `canvas/selection` and attach it with `use:menu`.
2. Add a `color-swatches` item that runs `canvas.setFill` with `{ color }`.
3. Add a `slider` whose `preview` command runs while you drag, so the canvas updates before you let go.

</Steps>

The Menu Lab is this recipe.

## Notes app in one hour

Vault mode, a Markdown editor view that opens `.md` files, the Explorer, quick open, and a daily note command. The sample `notes` module (`src/app/modules/notes`) is this recipe: read its `module.ts` for the contributions and `activate.ts` for the handlers. [The first hour](manual://fanwit/learn) learning path follows the same steps.

## Tray utility

Global data mode, the tray menu, a quick capture <Term name="kind (window)">window kind</Term> and a global shortcut. Quick capture appends to `Inbox.md` through the `capture.append` command, so it is scriptable from the [command line](manual://fanwit/guides/cli) too.

## CLI first tool

Commands with `cli: true` and `--json` output, with the GUI as an optional viewer. Every command is already a CLI subcommand, so a tool can start on the command line and gain a window later without rewriting anything.
