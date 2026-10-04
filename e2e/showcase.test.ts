import { test } from "@playwright/test";
import { renders } from "./helpers";

/** The core preset. Each showcase part ships its own `<part>.e2e.ts` next to its code. */
test("VS Code preset renders", ({ page }) => renders(page, "VS Code", "[data-fw-region='sidebar']"));
