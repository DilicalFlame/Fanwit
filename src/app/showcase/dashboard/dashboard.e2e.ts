import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Dashboard preset renders", ({ page }) => renders(page, "Dashboard", "[aria-label='Revenue per day']"));
