/** MiniSearch options shared by the build (index) and the app (loadJSON): they must match. */
export const SEARCH_OPTIONS = {
	idField: "id",
	fields: ["title", "text", "page"],
	storeFields: ["type", "title", "page", "key", "anchor", "set", "section", "kind"],
	searchOptions: { boost: { title: 3, page: 1.5 }, prefix: true, fuzzy: 0.2 }
};
