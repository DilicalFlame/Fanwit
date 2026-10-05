# Booting the app

Every piece exists now. This chapter connects them: one `boot` function creates the services and connects contribution points to them, two SvelteKit routes draw the main window and every other window, and `startup.svelte.ts` restores the user's state after the first frame. At the end, `pnpm dev` opens FaNWiT.

<Callout kind="why">

The boot order is a dependency graph. Settings must load before the theme is applied, the theme before the first paint, contributions before the user's `keys.toml` (which refers to commands), and the layout before views can mount. Getting it wrong shows up as flashes, missing keybindings or a crash on first launch. Writing it as one function, top to bottom, makes the order visible and easy to reason about. The lifecycle marks from chapter 12 make it measurable.

</Callout>

```tikz caption="Boot, then first paint, then the rest" alt="A timeline. Before first paint: pick the host, create services, define contribution points and ctx facades, register core and app modules, load settings, keys.toml, menus.toml and commands.toml, load the layout, attach keys, fire onStartup. Then the first paint. After it: show the window, restore the vault, onboarding, deep links, and in an idle callback, onStartupFinished."
\begin{tikzpicture}[x=1mm,y=1mm,s/.style={fwnode,minimum height=8mm,text width=21mm,font=\scriptsize}]
\draw[fwSlate,line width=0.6pt,-{Stealth}] (-4,0) -- (170,0);
\foreach \x/\t in {0/host,26/modules,78/kernel,110/ready,156/idle} \fill[fwInk] (\x,0) circle (0.9) node[below=1.5mm,font=\scriptsize\ttfamily] {\t};
\node[s,fwcore] at (13,12) {pick host\\create services};
\node[s,fwcore] at (39,12) {contribution\\points, facades};
\node[s,fwcore] at (65,12) {settings, keys,\\menus, layout};
\node[s,fwwarm] at (91,12) {\texttt{onStartup}\\attach keys};
\draw[fwBrand,dashed,line width=0.8pt] (104,-6) -- (104,22) node[above,font=\scriptsize\bfseries,text=fwBrand] {first paint};
\node[s,fwuser] at (124,12) {show window,\\restore vault};
\node[s,fill=fwPaper,draw=fwSlate] at (150,12) {idle:\\\texttt{onStartupFinished}};
\end{tikzpicture}
```

## The core module, assembled

`core/index.ts` gathers chapters 24 to 29 into `coreModule`: the commands, keybindings, settings and menus, the views (each a lazy `import()`), the window kinds, the built in menu kinds, the palette providers, notification channels, the default layout preset, and the documented context keys. Its `activate` calls `activateCore` (chapter 25) and adds a few handlers that need the services at hand:

<Source path="src/fanwit/core/index.ts" from="export function coreModules" to="}" />

`coreModules(features)` is where `features` in `app.config.ts` takes effect. A feature that is off is never imported, so the bundler leaves it out entirely. Labs, the developer tools, the manual and plugins each live in their own small module, written in "Rebuild: features".

<Source path="src/fanwit/core/index.ts" />

## The boot sequence

`boot.svelte.ts` starts by choosing its configuration. The docs site (chapter 1's `vite --mode docs`) is the same app with no app modules, the manual layout, and nothing persisted:

<Source path="src/fanwit/boot.svelte.ts" from="const config: AppConfig =" until="		: appConfig;" />

Then the kernel's `sys` and module `ctx` get their types for everything this file adds:

<Source path="src/fanwit/boot.svelte.ts" from="declare module" to="}" />

<Callout kind="new" title="New here: module augmentation and Awaited">

`declare module "./kernel/kernel.svelte" { interface KernelSystems { ... } }` **adds fields to an interface declared in another file**. TypeScript merges interfaces with the same name. The kernel (chapter 13) declares an empty `KernelSystems`, and this file fills it in, so `k.sys.layout` is typed everywhere without the kernel importing a single service. The core can therefore be built bottom up without import cycles.

`Awaited<ReturnType<Host["app"]>>` reads inside out. `Host["app"]` is the type of the host's `app` method, `ReturnType` is what it returns (a `Promise<AppInfo>`), and `Awaited` unwraps the promise. The result is the type of `await host.app()`, derived rather than written out.

</Callout>

The **facades** come next: `layoutFacade`, `windowsFacade` and `notifyFacade` give a module a narrower, owner aware view of a service. `ctx.layout.registerView(v)` passes the module's id as owner and tracks the returned disposable, so a module never has to remember either.

<Source path="src/fanwit/boot.svelte.ts" from="function layoutFacade(" to="}" />

`LayerService` holds popovers and flyouts for chapter 29's `PopoverLayer`. Then comes `doBoot`, the sequence itself:

<Source path="src/fanwit/boot.svelte.ts" from="async function doBoot(" until="	setActiveKernel(k);" />

1. **Host and services.** `pickHost` returns the Tauri host or the browser host (chapter 3). Each service from chapters 14 to 23 is created and placed on `k.sys`. The pane pool and window service get their host components (chapters 20 and 21), and the command pipeline gets its prompter (the palette) and its confirmer (a dialog).

<Source path="src/fanwit/boot.svelte.ts" from="	// ----- contribution points -----" until="menuKinds" />

2. **Contribution points.** Each key a module may put in `contributes` is connected to the service that handles it. `each` turns a function for one item into one for a list, and gathers the disposables, so disabling a module removes everything it contributed. `commands`, `keybindings` and `contextKeys` are built into the kernel (chapter 13). Everything else is defined here, which is why the kernel itself knows nothing about views or menus.

3. **ctx facades.** `k.extend` adds `ctx.layout`, `ctx.settings`, `ctx.storage`, `ctx.db` and the rest to every module context, each wrapping a service with the module's id. Storage keys are namespaced by owner and plugins get a restricted database, so the isolation of chapter 15 holds without modules doing anything.

<Source path="src/fanwit/boot.svelte.ts" from="	// ----- modules: core first" until="lifecycle.mark" />

4. **Modules.** Core first, then the app's. Registering reads contributions and does nothing else. `activate` only runs on an activation event (chapter 13).

5. **The user's files.** Settings with their layers (chapter 16), with secrets kept in the OS keychain on the desktop. Then `keys.toml` (watched; errors become a notification, never a crash), `menus.toml`, `commands.toml` (user commands and macros, chapter 25) and the notification history.

<Source path="src/fanwit/boot.svelte.ts" from="	// ----- layout: per vault or global workspace -----" until="	await loadUserThemes(k);" />

6. **The layout.** The window kind's own preset if it has one (the Manual window keeps `manual.layout.toml`), otherwise the app's default. Per vault layouts switch documents when a vault opens or closes. A child window attaches to its opener's vault, passed in its URL (chapter 21).

7. **Go.** Keys are attached to the document, context keys start tracking focus, and `onStartup` fires. It is **sticky**: modules registered later still see it. Features that are off remove their leftover commands. On the docs site, `docsSite(k)` prunes everything a docs reader must not reach.

`wireSettings` keeps settings and systems in sync. Each time a setting changes, it reapplies the theme, density, font size, zoom, reduced motion, log levels, developer mode and language. It is one function rather than a listener per setting: it is cheap enough to run on every change, and it makes the full list of settings that affect the app easy to read.

<Source path="src/fanwit/boot.svelte.ts" from="function wireSettings(" to="}" />

<Source path="src/fanwit/boot.svelte.ts" />

## The routes

FaNWiT is a single page app (chapter 1): `ssr = false`, and every route is prerendered as an empty shell that boots in the browser or webview.

<Source path="src/routes/+layout.ts" />

<Source path="src/routes/+layout.svelte" from="<script lang=" />

The root layout boots the kernel once, then renders the route. If boot throws, it shows the error with a Reload button instead of a blank window. Note the context it provides. `setContext` must be called while the component is created, but the kernel only exists after an `await`. The layout therefore provides a **Proxy** that forwards every property access to the kernel once it exists.

<Callout kind="new" title="New here: Proxy">

`new Proxy(target, { get(_t, key) { ... } })` creates an object whose property reads run your function. Here, `getKernel().commands` reads `holder.k.commands` at the moment it is accessed. The context can be set synchronously, and still hand out the real kernel. Children are only rendered after `kernel` is set, so nobody ever reads through the proxy too early. [MDN: Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)

</Callout>

<Source path="src/routes/+page.svelte" from="<script lang=" />

`/` is the main window: the workbench, plus `mainStartup` once it is on screen.

<Source path="src/routes/w/[kind]/+page.ts" />

`prerender = false` for this route: its pages depend on the query string, so there is nothing to render ahead of time.

<Source path="src/routes/w/[kind]/+page.svelte" from="<script lang=" />

`/w/<kind>` is every other window (chapter 21 builds these URLs). It reads the kind, label, opener and props from the URL, and renders:

- a full `Workbench` for kinds with their own layout (the Manual);
- a layout window (`/w/view?window=...`) for popped out panes, which dock back into the main window when it closes;
- otherwise the kind's view in a `WindowView`, under a compact title bar.

`close(value)` emits `fw:window-result` to every window, which settles the opener's `result` promise.

## After the first paint

<Source path="src/fanwit/startup.svelte.ts" from="export async function afterFirstPaint" to="}" />

Two `requestAnimationFrame`s wait until a frame has actually been drawn. Only then is the native window shown. Tauri creates windows hidden (`visible: false` in chapter 21), so the user never sees an empty or half styled window. This, the pre-paint theme script of chapter 18, and the cached CSS together are why FaNWiT windows appear fully drawn.

Then every window wires up its safety nets:

- uncaught errors and unhandled rejections are logged (a cancelled prompt is not an error);
- pending writes are flushed when the window loses focus, when the page hides, and before it closes;
- unsaved work vetoes closing the main window;
- `network.online` is tracked as a context key;
- dropped files are routed to a command.

Lazy work waits for an idle callback: `onStartupFinished` activates modules that are not needed for the first frame.

<Source path="src/fanwit/startup.svelte.ts" from="export async function mainStartup" to="}" />

`mainStartup` runs in the main window only. It offers a crash report from the previous run, reopens the last vault (or the one passed on the command line), runs onboarding on the very first launch, handles deep links, and watches for popped out layout windows.

<Source path="src/fanwit/startup.svelte.ts" />

## The public API

Everything an app module may import comes from `$fanwit`, which is this file:

<Source path="src/fanwit/index.ts" />

Anything not listed here is internal and may change. `fw docs check` fails if an export lacks a doc comment with an `@example` (chapter 1), and those comments become the API reference pages of this manual.

`testing.ts` is the other public entry point, for your tests. `createTestKernel` boots a kernel on the memory host with your modules, the same way every test in this rebuild did:

<Source path="src/fanwit/testing.ts" />

## Checkpoint

Run the app:

```sh
pnpm dev
```

The browser opens the workbench, built by everything from chapter 1 to here. Open the palette with Ctrl+Shift+P, split the editor, right click a tab, switch the theme, and edit `workspace.toml` in the TOML editor to watch the layout follow.

Then the suite so far, including the settings schema test. It reads every module's settings definitions and checks that `schemas/settings.schema.json` is up to date, which is only possible now that the core module is assembled:

```sh
pnpm vitest run
pnpm exec playwright test e2e/smoke.test.ts --project app
```

<Source path="src/fanwit/settings/schema.test.ts" />

<Check question="The root layout cannot call setContext after awaiting boot(). How does getKernel() still return the real kernel?" options={["boot() is synchronous", "The context holds a Proxy that forwards each property read to the kernel once it exists; children render only after that", "getKernel() waits for boot() itself"]} answer={1}>

Svelte requires context during component creation, but the kernel arrives later. The Proxy separates the two: the context is set at once, and each read is forwarded when it happens. Rendering the children only after `kernel` is set guarantees no read happens too early.

</Check>
