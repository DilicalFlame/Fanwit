# Menus

Right click a tab, a file in the explorer or a heading in a note, and a menu appears. This chapter builds `menus/menus.svelte.ts`, the service that decides what is in each menu. The components that draw menus come in "Rebuild: the window".

<Callout kind="why">

Most apps hard code their context menus into components: the tab component has a list, the file tree has another. Then a plugin cannot add "Open in terminal" to the file menu, a user cannot hide "Copy relative path" if they never use it, and an update that adds an item overwrites whatever the user changed. FaNWiT treats a menu like the layout and settings: as **data**. Modules **contribute** items to named **locations**. The user's changes are a separate list of **patches** applied on top, so contributions and customisations stay separate and both survive updates.

</Callout>

```tikz caption="What you see is contributions, then patches, then when clauses" alt="Items contributed by core, a module and a plugin to the location explorer/item are merged, then patches from menus.toml are applied (hide, rename, insert), then when clauses and missing commands filter them, then items are grouped and ordered into the menu on screen."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=8mm,font=\scriptsize,text width=22mm}]
\node[b,fwcore] (c) at (0,12) {core items};
\node[b,fwcore] (m) at (0,0) {module items};
\node[b,fwcore] (p) at (0,-12) {plugin items};
\node[b,fill=fwPaper,draw=fwSlate] (loc) at (34,0) {\texttt{explorer/item}\\contributions};
\node[b,fwwarm] (pat) at (66,0) {patches\\\texttt{menus.toml}};
\node[b,fill=fwPaper,draw=fwSlate] (when) at (98,0) {\texttt{when}, missing\\commands};
\node[b,fwuser,text width=25mm,minimum height=24mm,align=left] (menu) at (133,0) {Open\\Open to the side\\[-2pt]\rule{23mm}{0.3pt}\\Rename\\[-2pt]\rule{23mm}{0.3pt}\\\textcolor{red!70!black}{Delete}};
\foreach \x in {c,m,p} \draw[fwarrow] (\x.east) -- (loc.west);
\draw[fwarrow] (loc) -- (pat);
\draw[fwarrow] (pat) -- node[fwlabel,above]{filter} (when);
\draw[fwarrow] (when) -- node[fwlabel,above]{group} (menu);
\end{tikzpicture}
```

## Locations and items

A **location** is a named place a menu can appear: `tab/context`, `explorer/item`, `editor/context`. An **item** usually just names a command (chapter 9). Its label, icon, keyboard shortcut and enablement all come from the command, so they never get out of sync:

<Source path="src/fanwit/menus/menus.svelte.ts" from="export interface MenuItem {" to="}" />

Items are sorted by **group**, then by `order` within a group. Groups are separated by lines and always appear in the same order across the app (`navigation` first, `danger` last), so destructive items are always at the bottom, apart from the rest. `GROUP_ORDER` lists them: `navigation`, `open`, `clipboard`, `edit`, `style`, `modify`, `arrange`, `view`, `window`, `share`, `dev`, `other`, `danger`. An unknown group sorts just before `other`.

## Arguments from the target

A menu opens **on** something: the file you right clicked, the tab, the selection. That thing is the menu's **target**, and items can put parts of it into the command's arguments with `${target.path}`:

<Source path="src/fanwit/menus/menus.svelte.ts" from="export function templateArgs" to="}" />

`"${target.ids}"` on its own returns the array itself, not the string `"1,2"`. The template is replaced by the value only when it is the **whole** string. Inside a longer string (`"Open ${target.path}"`), it is converted to text.

<Callout kind="new" title="New here: reduce with a type argument, and regex exec">

`path.split(".").reduce<unknown>((o, k) => ..., scope)` walks `target.dir` one key at a time: start with `scope`, take `.target`, then `.dir`, stopping at `undefined`. The `<unknown>` sets the type of the running value, which TypeScript would otherwise guess from `scope`.

`/^\$\{([^}]+)\}$/.exec(v)` returns `null` or an array whose `[1]` is the first parenthesised group, here the path between `${` and `}`. `^` and `$` anchor the pattern to the whole string.

</Callout>

## Patches

When you hide, rename or move an item in the Context Menu Editor, FaNWiT does not copy the menu. It records what you did:

```toml
# menus.toml
[[patch]]
location = "tab/context"
op = "hide"
item = "tab.copyRelativePath"

[[patch]]
location = "explorer/item"
op = "insert"
group = "navigation"
item = { id = "user.terminal", command = "shell.openTerminal", args = { cwd = "${target.dir}" } }
```

`applyPatches` replays them over the contributed items. It is a pure function: it copies the list first, so contributions are never changed, and an item a patch names that no longer exists is simply skipped:

<Source path="src/fanwit/menus/menus.svelte.ts" from="export function applyPatches" to="}" />

<Callout kind="new" title="New here: Omit, and as const inside an object">

`patch(location: string, p: Omit<MenuPatch, "location">)` takes a patch without its `location`, since the method adds it. `Omit<T, K>` is the built in type "T without the keys K", and `Pick<T, K>` is its opposite. `source: "user" as const` keeps the literal type `"user"`, so the object still fits `MenuItem["source"]`, a union of literals, rather than widening to `string`.

</Callout>

## Resolving a menu

Just before a menu opens, `resolve` turns a location into what is drawn: groups of items, each with a label, an enabled flag, a reason if it is disabled, and the shortcut:

<Source path="src/fanwit/menus/menus.svelte.ts" from="	async resolve(location: string" to="	}" />

<Source path="src/fanwit/menus/menus.svelte.ts" from="	private resolveItem(" to="	}" />

Points to notice:

- **Two clauses.** `visibleWhen` hides an item, `when` greys it out. Greyed items carry `disabledReason` from chapter 7's `explain`, such as "needs `vault.open`", shown as a tooltip. A disabled item tells you why.
- **Missing commands hide their items.** When a feature is turned off its commands are not registered, and its menu items disappear instead of sitting there dead.
- **Providers** fill items in when the menu opens ("Open Recent" lists recent vaults). **Submenus** are inline `items` or another location.
- `menu.target` is set as a context key while resolving, so a `when` can depend on which menu is asking.

## Rich items

Most items are rows, but a menu can also hold a slider (font size), colour swatches, a toggle or a star rating. Each is an **item kind**: a component, plus what the menu system needs to handle it without knowing what it is. That includes its props, the values it emits, how arrow keys move inside it, its ARIA role, and what to do in a native OS menu, which cannot host components:

<Source path="src/fanwit/menus/menus.svelte.ts" from="export interface MenuItemKind" to="}" />

A kind never runs anything itself. It calls `emit({ size: 16 })`, and the menu runs the item's command with that merged into its args. A slider can also emit with `preview: true` while you drag, which runs the item's `preview` command for a live preview without adding an undo step each time.

## Loading and editing

`load` reads `menus.toml` through chapter 15's `TomlFile`, watches it, and loads user created locations from it. The editor's methods (`patch`, `resetItem`, `resetLocation`, `setPatches`) only ever rewrite the patch list, and `TomlFile` merges the change into the file without touching comments.

<Source path="src/fanwit/menus/menus.svelte.ts" />

Components open a location with the `use:menu` action from `ui.svelte.ts` (in "Rebuild: the window"), and `pnpm fw add menu-location <loc> --module <id>` writes the contribution for you.

## Checkpoint

<Source path="src/fanwit/menus/menus.test.ts" />

<Source path="src/fanwit/menus/menu-service.test.ts" />

```sh
pnpm vitest run src/fanwit/menus
```

<Check question="An app update adds a new item to tab/context. A user had hidden two items there. What happens?" options={["The update overwrites the user's menu, so the hidden items come back", "The new item appears, and the two items stay hidden", "The new item is hidden too, because the user customised the menu"]} answer={1}>

The update changes contributions, and the user's changes are patches applied on top, by item id. The new item has no patch, so it appears. The hidden ones still have theirs.

</Check>
