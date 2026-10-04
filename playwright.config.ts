import { defineConfig } from "@playwright/test";

/** Web end to end tests against the static build (Section 20.8). */
export default defineConfig({
	testDir: ".",
	// e2e/ for app wide flows, *.e2e.ts next to the code for tests that live (and get stripped) with their part
	testMatch: ["e2e/**/*.test.ts", "src/**/*.e2e.ts", "plugins/**/*.e2e.ts"],
	testIgnore: ["**/.trash/**", "**/node_modules/**"],
	timeout: 30_000,
	use: { baseURL: "http://localhost:4173", viewport: { width: 1280, height: 800 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
	webServer: { command: "pnpm build && pnpm preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true, timeout: 180_000 }
});
