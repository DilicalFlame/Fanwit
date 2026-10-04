import adapter from '@sveltejs/adapter-static';
import { manualMarkdown } from './src/fanwit/manual/mdsvex.mjs';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// manual pages (docs/**/*.md) are Svelte components: Markdown plus components
	extensions: ['.svelte', '.md'],
	preprocess: manualMarkdown(),
	kit: {
		// fallback serves every window route (/w/[kind]) as a SPA (defect D11); `fw docs build`
		// writes the docs site (the manual on the web host) to build-docs
		adapter: adapter({ fallback: 'index.html', pages: process.env.FW_DOCS ? 'build-docs' : 'build', assets: process.env.FW_DOCS ? 'build-docs' : 'build' }),
		// the versioned docs site lives in a subfolder (e.g. /repo/docs/v/1.2.0): fw docs build --base
		paths: { base: process.env.FW_DOCS_BASE ?? '' },
		alias: {
			$fanwit: 'src/fanwit',
			'$fanwit/*': 'src/fanwit/*',
			// `$app` is reserved by SvelteKit, so the app layer uses `$application`
			$application: 'src/app',
			'$application/*': 'src/app/*',
			$appconfig: 'app.config.ts'
		}
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
