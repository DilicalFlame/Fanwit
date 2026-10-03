import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	clearScreen: false,
	optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
	worker: { format: 'es' },
	server: { strictPort: true, fs: { allow: ['app.config.ts', 'docs', 'plugins'] } },
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
