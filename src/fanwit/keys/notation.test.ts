import { expect, test } from "vitest";
import { canonicalStep, eventToSteps, formatSteps, parseBinding } from "./notation";

test("canonical steps sort modifiers and resolve mod per platform", () => {
	expect(canonicalStep("Shift+Mod+P", "windows")).toBe("ctrl+shift+p");
	expect(canonicalStep("mod+shift+p", "macos")).toBe("shift+meta+p");
	expect(canonicalStep("cmd+option+i", "macos")).toBe("alt+meta+i");
	expect(canonicalStep("mod+\\", "linux")).toBe("ctrl+\\");
	expect(canonicalStep("mod+[Backquote]", "windows")).toBe("ctrl+[Backquote]");
	expect(parseBinding("mod+k mod+s", "windows")).toEqual(["ctrl+k", "ctrl+s"]);
});

test("events map to logical and physical steps", () => {
	const ev = (o: Partial<KeyboardEvent>) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o }) as KeyboardEvent;
	expect(eventToSteps(ev({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true })).logical).toBe("ctrl+shift+p");
	expect(eventToSteps(ev({ key: "!", code: "Digit1", shiftKey: true })).logical).toBe("shift+1");
	expect(eventToSteps(ev({ key: "z", code: "KeyZ", ctrlKey: true })).physical).toBe("ctrl+[KeyZ]");
	expect(eventToSteps(ev({ key: "Control", code: "ControlLeft", ctrlKey: true })).modifierOnly).toBe(true);
});

test("labels", () => {
	expect(formatSteps(["ctrl+shift+p"], "windows")).toEqual(["Ctrl+Shift+P"]);
	expect(formatSteps(["shift+meta+p"], "macos")).toEqual(["⇧⌘P"]);
});
