import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// fallback serves every window route (/w/[kind]) as a SPA (defect D11)
		adapter: adapter({ fallback: 'index.html' }),
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
