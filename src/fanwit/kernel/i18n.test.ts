import { expect, test } from "vitest";
import { I18nService } from "./i18n.svelte";

test("messages: params, plurals, select, fallback and pseudo locale", () => {
	const i = new I18nService();
	i.add("en", { "notes.deleted": "{count, plural, one {# note} other {# notes}} deleted", greet: "Hello, {name}", who: "{g, select, f {She} other {They}} left" });
	expect(i.t("notes.deleted", { count: 1 })).toBe("1 note deleted");
	expect(i.t("notes.deleted", { count: 3 })).toBe("3 notes deleted");
	expect(i.t("greet", { name: "Asha" })).toBe("Hello, Asha");
	expect(i.t("who", { g: "x" })).toBe("They left");
	expect(i.t("missing.key", {}, "Fallback")).toBe("Fallback");
	i.locale = "pseudo";
	expect(i.t("greet", { name: "A" })).toMatch(/^［Héllö, Å~+］$/);
	i.locale = "ar";
	expect(i.dir).toBe("rtl");
});
