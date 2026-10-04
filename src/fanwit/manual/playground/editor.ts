/**
 * The playground's editor: CodeMirror 6, loaded only when a playground is on screen. Colours come
 * from the app's tokens, so it follows every reading theme.
 */
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Token colours as CSS variables (reading.css), so light and dark reading themes both read well. */
const colours = HighlightStyle.define([
	{ tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier], color: "var(--cm-keyword)" },
	{ tag: [t.string, t.special(t.string), t.regexp], color: "var(--cm-string)" },
	{ tag: [t.number, t.bool, t.null, t.atom], color: "var(--cm-number)" },
	{ tag: [t.comment, t.lineComment, t.blockComment], color: "var(--cm-comment)", fontStyle: "italic" },
	{ tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "var(--cm-function)" },
	{ tag: [t.propertyName, t.attributeName], color: "var(--cm-property)" },
	{ tag: [t.typeName, t.className], color: "var(--cm-type)" },
	{ tag: [t.tagName, t.angleBracket], color: "var(--cm-tag)" },
	{ tag: [t.variableName, t.definition(t.variableName), t.punctuation, t.operator, t.bracket], color: "var(--foreground)" },
	{ tag: t.invalid, color: "var(--destructive)" }
]);

const theme = EditorView.theme({
	"&": { fontSize: "var(--doc-code-size, 13.5px)", backgroundColor: "var(--muted)", color: "var(--foreground)", height: "100%" },
	".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
	".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "none" },
	".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklab, var(--primary) 7%, transparent)" },
	"&.cm-focused": { outline: "none" },
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection) !important" },
	".cm-cursor": { borderLeftColor: "var(--foreground)" },
	".cm-tooltip": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" }
});

export interface Editor {
	text(): string;
	set(text: string): void;
	destroy(): void;
}

/** An editor in `parent`; Ctrl/Cmd+Enter calls `run`. */
export function createEditor(parent: HTMLElement, o: { doc: string; lang: "js" | "svelte"; run: () => void; change: (text: string) => void; label: string }): Editor {
	const view = new EditorView({
		parent,
		doc: o.doc,
		extensions: [
			basicSetup,
			keymap.of([{ key: "Mod-Enter", run: () => (o.run(), true) }, indentWithTab]),
			o.lang === "svelte" ? html() : javascript(),
			theme,
			syntaxHighlighting(colours),
			EditorView.updateListener.of((u) => u.docChanged && o.change(u.state.doc.toString())),
			EditorView.contentAttributes.of({ "aria-label": o.label })
		]
	});
	return {
		text: () => view.state.doc.toString(),
		set: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
		destroy: () => view.destroy()
	};
}
