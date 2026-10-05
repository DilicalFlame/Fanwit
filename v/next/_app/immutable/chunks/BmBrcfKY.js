import{l as a}from"./lGwIKZ5O.js";const l=a({bookmarks:["Welcome.md"],notes:{"Welcome.md":`# Welcome

This is a mock vault. Notes link with [[Ideas]] and [[Layouts]].

- Open a note from the file tree
- Drag a tab to split the editor
- Toggle reading view with the book icon

See also [[Daily/2026-10-04]].`,"Ideas.md":`# Ideas

- A plugin gallery
- Linked [[Layouts]] for every app
- Back to [[Welcome]]`,"Layouts.md":`# Layouts

Every preset is a TOML document: regions, splits, tab sets, floats.

Related: [[Ideas]], [[Projects/Showcase]].`,"Projects/Showcase.md":`# Showcase

Figma, Blender, Photoshop, Notion, Obsidian, Discord, a browser, Excel, a dashboard and a terminal.

Up: [[Layouts]]`,"Daily/2026-10-04.md":`# 2026-10-04

- [x] Rename the workbench preset
- [ ] Write the [[Projects/Showcase]] notes`}}),i=/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g,c=e=>e.endsWith(".md")?e:`${e}.md`,d=e=>[...e.matchAll(i)].map(o=>c(o[1].trim())),m=(e,o,t=!1)=>e.sys.layout.openView("showcase.obsidian.note",{note:o},t?{target:"beside"}:{});function p(e){const o=e.sys.layout,t=o.activeDocument?o.doc.pane[o.activeDocument]:void 0;if(t?.view==="showcase.obsidian.note")return String(t.props?.note);const n=Object.values(o.doc.pane).find(s=>s.view==="showcase.obsidian.note");return n?String(n.props?.note):null}export{i as L,p as a,d as l,m as o,l as v};
