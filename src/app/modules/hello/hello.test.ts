import { expect, test } from "vitest";
import { createTestKernel } from "$fanwit/testing";
import hello from "./module";

test("hello.greet returns who was greeted", async () => {
	const k = await createTestKernel({ modules: [hello] });
	// the toast needs the notify system; stub it for the test kernel
	k.extend(() => ({ notify: { toast: () => {} } }));
	expect(await k.commands.run("hello.greet", { name: "Asha" })).toEqual({ greeted: "Asha" });
});
