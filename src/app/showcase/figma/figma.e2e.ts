import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Figma preset renders", ({ page }) => renders(page, "Figma", "[aria-label='Design canvas']"));
