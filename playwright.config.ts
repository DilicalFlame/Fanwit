import { defineConfig } from "@playwright/test";

/** Web end to end tests against the static build (Section 20.8). */
export default defineConfig({
	testDir: "e2e",
	timeout: 30_000,
	use: { baseURL: "http://localhost:4173", viewport: { width: 1280, height: 800 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
	webServer: { command: "pnpm build && pnpm preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 180_000 }
});
