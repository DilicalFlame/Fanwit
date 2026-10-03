/** The manual lives in the app (principle P8). */
import { defineModule } from "../kernel/module";

export const manualModule = defineModule({
	id: "fanwit.manual",
	title: "Manual",
	contributes: {
		views: [
			{ id: "fanwit.manual", title: "Manual", icon: "book-open", component: () => import("../views/Manual.svelte"), singleton: true },
			{ id: "fanwit.manualToc", title: "Manual", icon: "book-open", component: () => import("../views/ManualToc.svelte"), regions: ["sidebar"], singleton: true }
		],
		windows: [{ kind: "manual", base: "aux", view: "fanwit.manual", title: "Manual", size: [1100, 760], instance: "single" }]
	}
});
