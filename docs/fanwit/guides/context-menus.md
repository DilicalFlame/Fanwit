---
title: Context menus
section: Guides
order: 5
summary: Menus are data at named locations, rich item kinds, and user patches that survive updates.
---
# Context menus

A menu is data: an ordered list of items at a named <Term name="location" />, such as `explorer/item` or `tab/context`. Each item usually runs a <Term name="command" /> and has a <Term name="kind (menu item)">kind</Term> that decides how it looks: a plain row, a toggle, a slider, colour swatches. Users change menus with **patches**, never copies.

<Callout kind="why">

Hard coded menus can't be extended by a plugin, rearranged by a user, or checked by a test. As data, any module can add an item to any location, the Menu Editor can show and change every menu, and native OS menus can be generated from the same source. A user's changes are stored as patches in `menus.toml` ("hide this", "move that"). An app update that adds items therefore still reaches users who customised the menu. A copy of the whole menu would freeze it at the version they copied.

</Callout>

## Adding items

<Steps>

1. Attach a location to an element: `<li use:menu={{ location: "explorer/item", target: { path } }}>`. Right click, Shift+F10, the Menu key and a long press all open it.
2. Contribute items to the location from any module. `${target.path}` in the arguments reads the target the menu was opened on.
3. Order them with `group` (navigation, edit, view, ..., danger last) and `order`. Separators between groups are drawn for you.

</Steps>

```ts
contributes: {
	menus: {
		"explorer/item": [
			{ id: "notes.preview", command: "notes.openPreview", group: "navigation", order: 3, args: { path: "${target.path}" }, when: "resource.ext == 'md'" }
		]
	}
}
```

A new location gets its own name and description with `pnpm fw add menu-location <loc> --module <id>`, so it appears in the [Menu locations reference](manual://fanwit/reference/menu-locations) and in the editor.

## Item kinds

action, submenu, checkbox, radio, toggle, icon-row, segmented, slider (with a live preview command), stepper, input, color-swatches, list, progress, and your own kinds made with <Api symbol="defineMenuItemKind" />. A kind is a component plus what the menu system needs around it: a keyboard model, an ARIA role, and a fallback for native menus, which can't host components.

## Patches

```toml
[[patch]]
location = "tab/context"
op = "hide"
item = "tab.copyRelativePath"
```

Patch operations: hide, show, move, rename, icon, regroup, insert, props, pin and when. The Menu Editor writes them for you.

## Developer mode

Every menu ends with a developer group: **Edit this menu**, **Inspect element**, **Open component source** (dev builds) and **Copy selector**. Elements without a menu open just that group, and **Edit this menu** creates a location for them. Alt+click a row to jump to it in the editor.

```fanwit-run
menus.edit {"location": "canvas/selection"}
```

<Check question="A user hid an item from a menu, and the next app version adds two new items to it. What does the user see?" options={["The old menu, without the new items", "The new items, with their hidden item still hidden", "The default menu: updates reset menus"]} answer={1}>

The user's change is a patch applied over the contributed items, not a saved copy. New items arrive, and the patch keeps applying.

</Check>

## Pitfalls

- **Logic in the item.** Menu items run commands. If the action isn't a command yet, make it one, and it becomes reachable from keys and the palette too.
- **Hiding with `when`.** An item whose `when` is false is greyed out and explains why. Use `visibleWhen` to hide it.
- **Unnamed locations.** Declare locations you create, so users and plugin authors can find them.
