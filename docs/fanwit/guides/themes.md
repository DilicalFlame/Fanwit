---
title: Themes
section: Guides
order: 9
summary: Themes are TOML files of design tokens; one colour can generate both modes.
---
# Themes

A theme is a TOML file of design tokens with `[meta]`, `[common]`, `[light]`, `[dark]` and `[window]` tables. Token names follow shadcn-svelte, so existing shadcn themes work here.

<Callout kind="why">

Every component reads colours through tokens (`--background`, `--primary`, `--sidebar`, ...), never hard coded values. A theme therefore changes the whole app, including plugins and your own views, without touching a component. Tokens in a file also mean a theme can be shared, extended (`extends`) or generated, and checked for contrast before anyone sees it.

</Callout>

## The theme file

```toml
[meta]
id = "nord-ish"
name = "Nord-ish"
extends = "fanwit-default"

[dark]
background = "oklch(0.24 0.02 250)"
primary = "oklch(0.72 0.1 220)"
```

`extends` takes every token from another theme, so a theme only lists what it changes. Choose separate themes for light and dark mode in Settings, or follow the system.

## Making one

Theme Studio generates both modes from one colour, and checks text contrast against WCAG AA and AAA as you go:

```fanwit-run
theme.studio
```

<Callout kind="under-the-hood">

Themes apply without a flash of the wrong colours. The compiled CSS is cached, and a small script injects it before the page renders. The desktop window's own background colour and the OS light or dark setting are set to match, so even the window frame doesn't flash.

</Callout>

## Pitfalls

- **Hard coded colours in views.** They ignore every theme, including high contrast. Use the token classes (`bg-background`, `text-muted-foreground`) or `var(--token)`.
- **One mode only.** If you change `[light]`, check `[dark]` too. Theme Studio shows both side by side.
- **Restyling a layout.** For one preset only, scope CSS with `html[data-preset=...]` in an appearance plugin instead of a theme.
