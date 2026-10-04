import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { fanwitDocs } from './src/fanwit/manual/vite-plugin';

export default defineConfig({
	plugins: [fanwitDocs(), tailwindcss(), sveltekit()],
	clearScreen: false,
	optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
	worker: { format: 'es' },
	server: { strictPort: true, fs: { allow: ['app.config.ts', 'docs', 'plugins'] } },
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		setupFiles: ['vitest.setup.ts']
	}
});
