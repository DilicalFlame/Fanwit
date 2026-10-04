import type { Kernel } from "./kernel.svelte";

/**
 * The typed `ctx` every module and plugin receives in `activate(ctx)`. Every call is attributed
 * to its owner, and everything it registers (commands, listeners, views, keys, ...) is disposed
 * when the module deactivates or a plugin is turned off. It is an interface over the kernel's
 * context factory, so its members are listed here and kept in step with the code.
 *
 * @example
 * ```ts
 * export default function activate(ctx: ModuleContext) {
 *   ctx.commands.handle("notes.newDaily", async () => {
 *     const path = `Daily/${new Date().toISOString().slice(0, 10)}.md`;
 *     await ctx.layout.openView("notes.editor", { path });
 *   });
 *   ctx.subscriptions.push(ctx.events.on("notes:saved", ({ path }) => ctx.log.info("saved", path)));
 * }
 * ```
 * @see manual://fanwit/guides/kernel
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleContext extends ReturnType<Kernel["createContext"]> {}
