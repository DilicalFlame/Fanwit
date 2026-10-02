// Every Lucide icon as a lazy chunk. This module itself is imported lazily, so the map only
// loads when an icon outside the warm set is first requested (icon picker, plugins).
export const lucide = import.meta.glob("/node_modules/@lucide/svelte/dist/icons/*.svelte");
