import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Photoshop preset renders", ({ page }) => renders(page, "Photoshop", "[aria-label^='Document']"));
