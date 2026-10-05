# Motion, design tokens and themes

This chapter is about everything visual that is not a component: the **design tokens** every component is painted with (`src/routes/layout.css`), **themes** that set them (`themes/`), and **motion**, the one module every animation goes through (`motion/motion.ts`).

<Callout kind="why">

If a component wrote `background: #ffffff`, dark mode would need a second copy of every component, and a theme could not change it. FaNWiT's components only ever name **tokens**: `bg-background`, `text-muted-foreground`, `border-border`. A token is a CSS custom property, and a theme is a set of values for them. Change the values and every component follows, at once (Chapter 11). Motion has the same problem in time: animations scattered across components feel different from each other and ignore people who asked for less motion.

</Callout>

```tikz caption="From a theme file to pixels: the component never knows the colour" alt="A theme TOML sets primary; the theme service compiles it to a CSS variable; Tailwind's bg-primary class uses the variable; the button is painted"
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,text width=33mm,minimum height=14mm,font=\scriptsize}]
\node[b,fwwarm] (toml) at (0,0) {\textbf{ocean.toml}\\[1pt]\texttt{[light]}\\\texttt{primary = "\#0369a1"}};
\node[b,fwcore] (css) at (50,0) {\textbf{<style id="fw-theme">}\\[1pt]\texttt{:root:root \{}\\\texttt{-{}-primary: \#0369a1; \}}};
\node[b,fill=fwPaper,draw=fwSlate] (tw) at (100,0) {\textbf{layout.css}\\[1pt]\texttt{-{}-color-primary:}\\\texttt{var(-{}-primary)}};
\node[b,fwuser] (btn) at (150,0) {\texttt{class="bg-primary"}\\[3pt]\tikz\node[fill={rgb,255:red,3;green,105;blue,161},text=white,rounded corners=2pt,font=\scriptsize]{Save};};
\draw[fwarrow] (toml) -- node[fwlabel,above]{compile} (css);
\draw[fwarrow] (css) -- node[fwlabel,above]{names} (tw);
\draw[fwarrow] (tw) -- node[fwlabel,above]{Tailwind} (btn);
\end{tikzpicture}
```

## Design tokens

`src/routes/layout.css` grows from the two `@import` lines of chapter 1 into the token sheet. Its parts:

1. **Default values** on `:root` (light) and `.dark`: the base palette, shadcn's names (`--background`, `--primary`, `--muted-foreground`, ...) plus workbench tokens (`--titlebar`, `--tab-active`, `--splitter`, `--drop-target`), sizes (`--control-h`, `--row-h`, `--tab-h`) and motion (`--duration-fast`).
2. **`@theme inline`**: tells Tailwind that `--color-primary` is `var(--primary)`, and so on for every colour, which is what makes `bg-primary` and `text-tab-foreground` exist as classes.
3. **Base rules** (every border uses `--border`, focus rings use `--ring`), **component classes** used across the workbench (`.fw-btn`, `.fw-icon-btn`, `.fw-input`, `.fw-row`), and **density**: `[data-density="compact"]` shrinks the size tokens, so the whole UI tightens with one attribute.
4. **Reduced motion**: under `prefers-reduced-motion` or `[data-reduced-motion="true"]`, transitions and animations are switched off.

<Source path="src/routes/layout.css" />

<Callout kind="new" title="New here: CSS custom properties, @layer and @apply">

- `--primary: oklch(...)` defines a **custom property**; `var(--primary)` reads it. They inherit like any property and can be changed at run time, which ordinary Sass-style variables cannot.
- `oklch(L C H)` writes a colour by perceived lightness, chroma and hue. Equal steps in `L` look equally lighter, which makes generating palettes predictable.
- `@layer base { ... }` and `@layer components { ... }` put rules in **cascade layers**, so utilities always win over component classes, and component classes over base rules, regardless of order.
- `@apply inline-flex gap-1.5 ...` (Tailwind) copies utility classes into a rule, so `.fw-btn` is defined in Tailwind's own vocabulary.

</Callout>

FaNWiT's components follow the **shadcn-svelte** conventions, recorded in `components.json`, so its token names match the components you can add from that registry:

<Source path="components.json" />

## Colour maths

`themes/color.ts` converts between sRGB and OKLCH, computes **WCAG contrast** ratios, and generates both modes' palettes from one brand colour (what Theme Studio does when you pick a colour):

<Source path="src/fanwit/themes/color.ts" from="export function contrast(fg: string" until="/** Build both modes" />

`fixContrast` nudges a text colour's lightness one step at a time until it reaches the target ratio (4.5:1, WCAG AA): the one-click fix next to a failing pair in Theme Studio.

<Callout kind="new" title="New here: the exponent operator and destructuring parameters">

`l_ ** 3` is `Math.pow(l_, 3)`. `function oklchToRgb({ l, c, h, a }: Oklch)` destructures its argument in the parameter list: the function receives one object and gets its fields as local variables.

</Callout>

<Source path="src/fanwit/themes/color.ts" />

## Themes

A theme is a TOML file: `[meta]`, then `[common]` tokens for both modes, `[light]` and `[dark]`, optional `[window]` effects and optional extra `[css]`:

<Source path="src/fanwit/themes/builtin/high-contrast.toml" />

<Source path="src/fanwit/themes/themes.svelte.ts" from="	resolve(id: string, mode: Mode" until="	configure(o:" />

`resolve` follows `extends` (to the default theme at the end of every chain), so a theme only lists what it changes. `compile` writes the tokens as one `:root:root { ... }` rule, stripping `;{}<>` from values so a value can never end the rule and start another. The doubled `:root` gives the rule a higher specificity than the defaults in `layout.css`, whichever loads first.

`apply` puts the CSS into `<style id="fw-theme">`, toggles the `dark` class, tells the host (so the native title bar and window background match), and caches the CSS in `localStorage`, which is the point of the next section. A theme switch uses `document.startViewTransition` where available, for a smooth cross-fade.

<Callout kind="new" title="New here: ?raw imports">

`import defaultToml from "./builtin/fanwit-default.toml?raw"` imports a file's text as a string (a Vite feature): the built-in themes are bundled into the app as data, not code.

</Callout>

`sanitizeCss` strips `@import`, remote `url(...)`, `expression(` and `javascript:` from theme and plugin CSS: a theme may restyle the app, but never load content from the internet or run code. `injectCss` adds such CSS as its own `<style>`, removed when disposed.

<Source path="src/fanwit/themes/themes.svelte.ts" />

### No flash

Every new window would otherwise paint white, load the app, then switch to your dark theme: a flash. `src/app.html` gets its final form, with a tiny script that runs before anything else and applies the cached theme CSS, dark class and background colour:

<Source path="src/app.html" />

<Callout kind="new" title="New here: inline scripts and the pre-paint trick">

A plain `<script>` in `<head>` runs while the page is being parsed, before the first frame is drawn. It can only use what is already there (here `localStorage`), and it must never throw (`try { ... } catch (e) {}`), because an error would stop the page. The theme service keeps the cache up to date on every apply, so the next window starts in the right colours from its very first frame.

</Callout>

## Motion

```sh
pnpm add gsap
```

<Source path="src/fanwit/motion/motion.ts" from="const PRESETS = {" until="export type Preset" />

Every animation in FaNWiT is one of these presets, so the whole app moves the same way: menus **pop** from their anchor, the palette **drops** from the title bar, toasts slide in from the edge, dialogs grow with a slight overshoot. Durations are short (120 to 260 ms): motion here explains what changed, it does not entertain.

<Callout kind="new" title="New here: satisfies">

`const PRESETS = { ... } satisfies Record<string, Vars>` checks that every preset is a valid set of GSAP options, **without** widening the object's type. `keyof typeof PRESETS` is still exactly `"pop" | "side" | "drop" | ...`, so a misspelled preset name in `use:enter={"popp"}` fails to compile. With `: Record<string, Vars>` instead, the keys would be lost.

</Callout>

- `use:enter` (an action) animates an element **from** a preset's state to its natural one when it mounts; `stagger` animates its children in sequence; rows mounting in the same frame (an expanded folder) cascade instead of appearing together.
- `out:leave` is a Svelte transition for exits, run as CSS on the compositor with GSAP's easing curve.
- `attachPress` gives every button a press: it dips while held and springs back, by about four pixels whatever its size.
- `pulse` and `shake` are feedback: something was copied; something was refused.
- `haptic` vibrates where the device can (phones running the web build).
- `reduced()` is checked by all of them: with reduced motion on, nothing moves, and `shake` becomes a short fade.

<Source path="src/fanwit/motion/motion.ts" />

## Checkpoint

<Source path="src/fanwit/themes/color.test.ts" />

<Source path="src/fanwit/themes/themes.test.ts" />

```sh
pnpm vitest run src/fanwit/themes
```

<Check question="A component needs the colour for a selected row. What should its markup use?" options={["A hex colour that looks right in the light theme", "A token class such as bg-selection, so every theme and both modes can set it", "An inline style computed from the theme TOML"]} answer={1}>

Components name tokens; themes give them values. That is what lets one theme file restyle the whole app, in both modes, without touching a component.

</Check>
