import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Notion preset renders", ({ page }) => renders(page, "Notion", "[aria-label='Page title']"));
