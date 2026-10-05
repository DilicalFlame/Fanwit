const t=`/* Compact mode: smaller avatars, tighter rows, timestamp inline */
html[data-preset="discord"] [data-fw-view="showcase.discord.chat"] .py-1\\.5 { padding-block: 1px !important; }
html[data-preset="discord"] [data-fw-view="showcase.discord.chat"] .size-10 { width: 20px !important; height: 20px !important; font-size: 10px; }
html[data-preset="discord"] [data-fw-view="showcase.discord.chat"] .gap-4 { gap: 8px !important; }
html[data-preset="discord"] [data-fw-view="showcase.discord.chat"] .min-w-0 { display: flex; gap: 6px; align-items: baseline; }
html[data-preset="discord"] [data-fw-view="showcase.discord.chat"] .text-\\[15px\\] { font-size: 13px !important; }
html[data-preset="discord"] [data-fw-view="showcase.discord.members"] .size-8 { width: 22px !important; height: 22px !important; }
`;export{t as default};
