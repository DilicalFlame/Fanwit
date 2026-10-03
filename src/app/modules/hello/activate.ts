import type { ModuleContext } from "$fanwit";

export default function activate(ctx: ModuleContext) {
	ctx.commands.handle("hello.greet", ({ name }: { name: string }) => {
		ctx.notify.toast({ title: `Hello, ${name}!`, kind: "success" });
		return { greeted: name }; // returned to palette, CLI (--json) and tests
	});
}
