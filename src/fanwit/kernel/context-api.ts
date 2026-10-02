import type { Kernel } from "./kernel.svelte";

/** The typed `ctx` every module and plugin receives; every call is attributed to its owner. */
export type ModuleContext = ReturnType<Kernel["createContext"]>;
