---
title: Themes
section: Guides
order: 9
---
# Themes

Themes are TOML files of design tokens with `[meta]`, `[common]`, `[light]`, `[dark]` and `[window]`. Token names follow shadcn-svelte, so shadcn themes work here.

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

Themes apply without a flash: the compiled CSS is cached and injected before the page parses. Theme Studio generates both modes from one colour and checks contrast.

```fanwit-run
theme.studio
```
