import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Discord preset renders", ({ page }) => renders(page, "Discord", "[aria-label='Servers']"));
