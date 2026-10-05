import { expect, test, vi } from "vitest";
import { FanwitError, exitCodeFor, isFanwitError, toFanwitError } from "./errors";
import { LogService } from "./logger";

test("a FanwitError carries a code, a hint and a docs link, and survives JSON", () => {
	const e = new FanwitError("NOTES_NOT_FOUND", { message: "No note at a.md.", hint: "Create it first.", docs: "manual://fanwit/guides/vaults" });
	expect(e).toBeInstanceOf(Error);
	expect(e.message).toBe("No note at a.md.");
	expect(JSON.parse(JSON.stringify(e))).toEqual({ code: "NOTES_NOT_FOUND", message: "No note at a.md.", hint: "Create it first.", docs: "manual://fanwit/guides/vaults" });
});

test("an error that crossed a boundary is still recognised by its name", () => {
	const copied = structuredClone({ name: "FanwitError", message: "x", code: "CANCELLED" });
	expect(isFanwitError(copied)).toBe(true);
	expect(isFanwitError(new Error("plain"))).toBe(false);
});

test("anything thrown becomes a FanwitError, and codes map to CLI exit codes", () => {
	expect(toFanwitError(new Error("boom")).code).toBe("UNKNOWN");
	expect(toFanwitError("text", "IO").message).toBe("text");
	// errors from Rust commands arrive as strings that may start with their code
	const denied = toFanwitError("PERMISSION_DENIED: access to notes__items is prohibited");
	expect(denied).toMatchObject({ code: "PERMISSION_DENIED", message: "access to notes__items is prohibited" });
	expect(exitCodeFor(denied)).toBe(5);
	expect(toFanwitError("No such file: a.md").code).toBe("UNKNOWN");
	expect(exitCodeFor(new FanwitError("CMD_UNKNOWN", { message: "" }))).toBe(4);
	expect(exitCodeFor(new FanwitError("CANCELLED", { message: "" }))).toBe(130);
	expect(exitCodeFor(new Error("other"))).toBe(1);
});

test("the logger redacts secrets, keeps fields, and honours levels per scope", () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const logs = new LogService();
	logs.level = "info";
	logs.levels = { noisy: "error" };
	const log = logs.scoped("vault");
	log.info("opened with token=abc123", { path: "/vault" });
	log.debug("not recorded: below info");
	logs.scoped("noisy").warn("not recorded: below this scope's level");
	expect(logs.records).toHaveLength(1);
	expect(logs.records[0]).toMatchObject({ scope: "vault", level: "info", message: "opened with token=***", fields: { path: "/vault" } });
	vi.restoreAllMocks();
});
