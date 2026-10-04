import { test } from "@playwright/test";
import { renders } from "../../../../e2e/helpers";

test("Obsidian preset renders", ({ page }) => renders(page, "Obsidian", "[aria-label='Graph of notes']"));
