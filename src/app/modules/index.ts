import type { ModuleDefinition } from "$fanwit";
import hello from "./hello/module";
import notes from "./notes/module";

/** Your compile time modules. `pnpm fw add module <id>` appends here. */
export const appModules: ModuleDefinition[] = [hello, notes];
