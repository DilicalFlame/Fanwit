import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Web browser preset renders", ({ page }) => renders(page, "Web browser", "[aria-label='Address']"));
