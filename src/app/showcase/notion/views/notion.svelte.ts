/** Notion showcase: pages made of blocks. */
export type BlockType = "h1" | "h2" | "p" | "todo" | "bullet" | "quote";
export interface Block {
	id: string;
	type: BlockType;
	text: string;
	done?: boolean;
}
export interface Page {
	id: string;
	title: string;
	icon: string;
	parent?: string;
	blocks: Block[];
}

let seq = 100;
export const uid = () => `n${++seq}`;
const b = (type: BlockType, text: string, done?: boolean): Block => ({ id: uid(), type, text, done });

export const notion = $state({
	current: "home",
	open: { home: true, projects: true } as Record<string, boolean>,
	pages: [
		{ id: "home", title: "Getting started", icon: "👋", blocks: [b("h1", "Welcome to your workspace"), b("p", "Click any line to edit it. Enter adds a block, Backspace on an empty block removes it."), b("todo", "Create a page from the sidebar", true), b("todo", "Change a block type with its handle"), b("quote", "Layouts are data: this whole app is one workspace.toml.")] },
		{ id: "projects", title: "Projects", icon: "📁", blocks: [b("h2", "Active"), b("bullet", "Website refresh"), b("bullet", "Mobile app beta")] },
		{ id: "roadmap", title: "Roadmap", icon: "🗺️", parent: "projects", blocks: [b("h2", "Q3"), b("todo", "Ship the showcase"), b("todo", "Write the docs")] },
		{ id: "notes", title: "Meeting notes", icon: "📝", parent: "projects", blocks: [b("p", "Decisions and follow ups.")] },
		{ id: "reading", title: "Reading list", icon: "📚", blocks: [b("bullet", "The Design of Everyday Things"), b("bullet", "Refactoring UI")] }
	] as Page[]
});

export const currentPage = () => notion.pages.find((p) => p.id === notion.current) ?? notion.pages[0];

export function newPage(parent?: string) {
	const p: Page = { id: uid(), title: "", icon: "📄", parent, blocks: [b("p", "")] };
	notion.pages.push(p);
	if (parent) notion.open[parent] = true;
	notion.current = p.id;
}
