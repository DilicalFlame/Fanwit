import type { ModuleDefinition } from "$fanwit";

/**
 * Your compile time modules: every `modules/<id>/module.ts` and `showcase/<part>/module.ts`.
 * Found by glob so `pnpm fw add module` and `pnpm fw strip` never edit this file.
 */
const found = {
	...import.meta.glob<ModuleDefinition>("./*/module.ts", { eager: true, import: "default" }),
	...import.meta.glob<ModuleDefinition>("../showcase/*/module.ts", { eager: true, import: "default" })
};
export const appModules: ModuleDefinition[] = Object.values(found);
