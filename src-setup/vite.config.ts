// The Setup app front end (Section 16.9): its own entry, the product's tokens and components.
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	root: at("."),
	base: "./",
	plugins: [tailwindcss(), svelte({ dynamicCompileOptions: ({ filename }) => (filename.includes("node_modules") ? undefined : { runes: true }) })],
	resolve: { alias: { $lib: at("../src/lib"), $fanwit: at("../src/fanwit") } },
	clearScreen: false,
	server: { port: 3100, strictPort: true, fs: { allow: [at("..")] } },
	build: { outDir: at("dist"), emptyOutDir: true, target: "es2022" }
});
