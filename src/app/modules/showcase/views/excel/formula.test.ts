import { expect, test } from "vitest";
import { evaluate } from "./formula";

test("formulas: arithmetic, refs, ranges, functions and error values", () => {
	const cells = { A1: "10", A2: "20", A3: "=A1+A2", B1: "=SUM(A1:A3)", B2: "=AVERAGE(A1:A2)*2", B3: "=-(A1-15)^2", C1: "=C2", C2: "=C1", C3: "=A1/0", D1: "hello", D2: "=D1+1", D3: "=NOPE(A1)", E1: "=MAX(A1:A2, 99, 3)" };
	expect(evaluate(cells, "A3")).toBe(30);
	expect(evaluate(cells, "B1")).toBe(60);
	expect(evaluate(cells, "B2")).toBe(30);
	expect(evaluate(cells, "B3")).toBe(25); // as in Excel, unary minus binds tighter than ^
	expect(evaluate(cells, "C1")).toBe("#CYCLE!");
	expect(evaluate(cells, "C3")).toBe("#DIV/0!");
	expect(evaluate(cells, "D1")).toBe("hello");
	expect(evaluate(cells, "D2")).toBe("#VALUE!");
	expect(evaluate(cells, "D3")).toBe("#NAME?");
	expect(evaluate(cells, "E1")).toBe(99);
	expect(evaluate(cells, "Z9")).toBe(""); // empty cell
	expect(evaluate({ A1: "=1+" }, "A1")).toBe("#ERR!");
});
