/**
 * The public Fanwit API (`$fanwit`). Everything an app module needs; see Appendix B.
 */
export { defineModule, type ModuleDefinition, type Contributions } from "./kernel/module";
export type { ModuleContext } from "./kernel/context-api";
export type { Kernel } from "./kernel/kernel.svelte";
export type { Events } from "./kernel/events";
export type { Services } from "./kernel/services";
export { FanwitError, isFanwitError } from "./kernel/errors";
export { toDisposable, DisposableStore, type Disposable } from "./kernel/disposable";
export { compileWhen, evalWhen } from "./kernel/when";
export { ctxkeys } from "./kernel/context.svelte";
export { argMeta } from "./commands/args";
export type { CommandDefinition, CommandHandler, Invocation, ArgSpec, UndoRecord } from "./commands/types";
export { defineSettings, s } from "./settings/define";
export { defineWindowKind, useWindow, type WindowKindSpec } from "./windows/windows.svelte";
export { defineMenuItemKind, type MenuItemKind, type MenuKindProps, type MenuItem } from "./menus/menus.svelte";
export { defineLayout, defineLayoutNode } from "./layout/define";
export type { ViewContribution } from "./layout/views";
export { sql } from "./data/db";
export { defineAppConfig, type AppConfig } from "./config";
export { getKernel, useDisposable, menu } from "./ui.svelte";
export { default as Icon } from "./icons/Icon.svelte";
