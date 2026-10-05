const a=`/* Quiet chrome, readable line length */
html[data-preset="obsidian"] [data-fw-tabset],
html[data-preset="obsidian"] [data-fw-region] { border-color: transparent !important; }
html[data-preset="obsidian"] [data-fw-strip] { opacity: 0.55; transition: opacity 150ms; }
html[data-preset="obsidian"] [data-fw-strip]:hover { opacity: 1; }
html[data-preset="obsidian"] [data-fw-view="showcase.obsidian.note"] .fw-prose,
html[data-preset="obsidian"] [data-fw-view="showcase.obsidian.note"] textarea { max-width: 42rem; margin-inline: auto; font-size: 16px; line-height: 1.7; }
html[data-preset="obsidian"] [data-fw-view="showcase.obsidian.note"] .fw-prose h1,
html[data-preset="obsidian"] [data-fw-view="showcase.obsidian.note"] .fw-prose h2 { border: 0; font-weight: 500; letter-spacing: -0.01em; }
html[data-preset="obsidian"] [data-fw-region="sidebar"] { font-size: 13px; }
`;export{a as default};
