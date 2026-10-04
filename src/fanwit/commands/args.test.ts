import * as v from "valibot";
import { expect, test } from "vitest";
import { argMeta, argSpecs, coerceArgs, missingArgs, validateArgs } from "./args";
import type { ArgSpec } from "./types";

const spec: Record<string, ArgSpec> = {
	size: { type: "number", min: 8, max: 72, default: 14 },
	mode: { type: "enum", options: ["split", "replace"] },
	force: { type: "boolean" },
	path: { type: "path", kind: "file" }
};

test("strings from the CLI, deep links and TOML are coerced to the declared types", () => {
	expect(coerceArgs(spec, { size: "20", force: "no", path: "a.md" })).toEqual({ size: 20, force: false, path: "a.md" });
	expect(coerceArgs(spec, { size: "big" })).toEqual({ size: "big" }); // left for validation to report
});

test("missing arguments are those without a value, a default or a boolean type", () => {
	expect(missingArgs(spec, {})).toEqual(["mode", "path"]);
	expect(missingArgs(spec, { mode: "split", path: "a.md" })).toEqual([]);
});

test("validation applies defaults and explains what is wrong", () => {
	expect(validateArgs("t.open", spec, { mode: "split", path: "a.md" })).toEqual({ size: 14, force: false, mode: "split", path: "a.md" });
	expect(() => validateArgs("t.open", spec, { mode: "split", path: "a.md", size: 100 })).toThrow("must be at most 72");
	expect(() => validateArgs("t.open", spec, { mode: "merge", path: "a.md" })).toThrow("expected one of split, replace");
	expect(() => validateArgs("t.open", spec, { mode: "split" })).toThrow(expect.objectContaining({ code: "CMD_ARGS_MISSING" }));
});

test("a Valibot schema works the same way, and its metadata reaches the palette", () => {
	const schema = v.object({ file: v.pipe(v.string(), argMeta({ type: "path", kind: "file", title: "File to import" })), count: v.optional(v.pipe(v.number(), v.maxValue(5)), 1) });
	expect(argSpecs(schema)).toMatchObject({ file: { type: "path", kind: "file", title: "File to import", required: true }, count: { type: "number", max: 5, required: false, default: 1 } });
	expect(validateArgs("t.import", schema, { file: "a.csv" })).toEqual({ file: "a.csv", count: 1 });
	expect(() => validateArgs("t.import", schema, { file: "a.csv", count: 9 })).toThrow(expect.objectContaining({ code: "CMD_ARGS" }));
});
