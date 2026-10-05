# HTML and CSS

Every FaNWiT window, on the desktop too, is a web page: Tauri opens a native window and shows a page in it, drawn by the system's own browser engine. So the first thing to learn is how a page is made. Two languages do it: **HTML** says *what* is on the page, **CSS** says *how it looks*.

<Callout kind="why">

Building the interface from web pages means one interface for the desktop and the web, and the most widely known way of making interfaces there is. It also means the tools are already on your computer: every browser can show you the HTML and CSS of the page you are looking at (right click, **Inspect**). Try that on this page.

</Callout>

## HTML: elements in a tree

HTML is text with **tags**. `<p>` starts a paragraph and `</p>` ends it; together with what is between them they make an **element**. Elements sit inside elements, so a page is a tree: the browser reads the text and builds that tree in memory, called the **DOM** (Document Object Model). Everything you see is drawn from the DOM, and every change to the screen is a change to it.

```tikz caption="The browser reads HTML into a tree (the DOM), and draws the tree" alt="An HTML snippet on the left, the DOM tree it becomes in the middle, and the drawn page on the right"
\begin{tikzpicture}[x=1mm,y=1mm,
  el/.style={fwnode,font=\scriptsize\ttfamily,minimum height=6mm,inner sep=2pt},
  ln/.style={draw=fwInk!50,line width=0.5pt}]
% the source
\fill[fwInk!12,rounded corners=2pt] (0.8,-0.8) rectangle (46.8,39.2);
\filldraw[fill=fwCode,draw=fwInk!40,rounded corners=2pt] (0,0) rectangle (46,40);
\node[anchor=north west,font=\scriptsize\ttfamily,align=left,text=fwInk,inner sep=0] at (3,37) {%
  <main>\\
  \ \ <h1>Notes</h1>\\
  \ \ <ul>\\
  \ \ \ \ <li>Milk</li>\\
  \ \ \ \ <li>Bread</li>\\
  \ \ </ul>\\
  \ \ <button>Add</button>\\
  </main>};
\node[font=\small\bfseries,text=fwInk] at (23,46) {HTML text};
\draw[fwarrow] (49,20) -- node[fwlabel,above]{parse} (61,20);
% the tree
\node[el,fwcore] (main) at (85,36) {main};
\node[el] (h1) at (66,24) {h1};
\node[el] (ul) at (85,24) {ul};
\node[el] (btn) at (104,24) {button};
\node[el] (li1) at (78,12) {li};
\node[el] (li2) at (92,12) {li};
\node[fwlabel] at (66,17) {"Notes"};
\node[fwlabel] at (78,5) {"Milk"};
\node[fwlabel] at (92,5) {"Bread"};
\node[fwlabel] at (104,17) {"Add"};
\draw[ln] (main) -- (h1); \draw[ln] (main) -- (ul); \draw[ln] (main) -- (btn);
\draw[ln] (ul) -- (li1); \draw[ln] (ul) -- (li2);
\node[font=\small\bfseries,text=fwInk] at (85,46) {The DOM};
\draw[fwarrow] (114,20) -- node[fwlabel,above]{draw} (126,20);
% the page
\fill[fwInk!12,rounded corners=2pt] (128.8,-0.8) rectangle (170.8,39.2);
\filldraw[fill=white,draw=fwInk!50,rounded corners=2pt] (128,0) rectangle (170,40);
\fill[fwGrid,rounded corners=2pt] (128,34) rectangle (170,40); \fill[fwGrid] (128,34) rectangle (170,36);
\node[anchor=west,font=\small\bfseries,text=fwInk] at (131,28) {Notes};
\node[anchor=west,font=\scriptsize,text=fwInk] at (132,21) {\textbullet\ Milk};
\node[anchor=west,font=\scriptsize,text=fwInk] at (132,16) {\textbullet\ Bread};
\node[draw=fwSlate,fill=fwPaper,rounded corners=1.5pt,font=\scriptsize,anchor=west] at (131,7) {Add};
\node[font=\small\bfseries,text=fwInk] at (149,46) {The page};
\end{tikzpicture}
```

Tags can carry **attributes**, extra facts written inside the opening tag: `<a href="https://svelte.dev">` says where a link goes, `<input placeholder="Search">` sets the grey hint in an empty box, `<button disabled>` greys a button out. Some elements have no content and no closing tag, like `<input>` and `<img>`.

You need only a handful of elements to read FaNWiT's code:

| Element | What it is |
|---|---|
| `<div>` | a box with no meaning of its own, for grouping and layout |
| `<span>` | the same for a piece of text inside a line |
| `<p>`, `<h1>` to `<h6>` | a paragraph, headings from largest to smallest |
| `<button>` | something to press; works with the keyboard by itself |
| `<input>`, `<select>`, `<textarea>` | things to type or choose in |
| `<ul>` / `<ol>` with `<li>` | lists, unordered and numbered |
| `<a href>` | a link |
| `<nav>`, `<main>`, `<aside>`, `<header>` | boxes that say what they are, so screen readers can jump between them |

<Callout kind="tip">

Prefer the element that says what something is. A `<button>` can be clicked, focused with **Tab** and pressed with **Enter** or **Space** without any code; a `<div>` styled to look like one can do none of that. FaNWiT's check (`pnpm check`) fails when an interactive element is missing these things.

</Callout>

## CSS: rules that style elements

CSS is a list of **rules**. Each rule has a **selector** that picks elements, and **declarations** (`property: value;`) that style them:

```css
button {            /* every <button> */
	color: white;
	background: rebeccapurple;
	border-radius: 6px;
}
.danger { background: crimson; }   /* elements with class="danger" */
#search { width: 100%; }           /* the element with id="search" */
li:hover { background: #eee; }     /* a list item while the pointer is over it */
```

The editor below is a Svelte component, but everything in it is plain HTML and CSS. Change the colours, add `class="danger"` to the second button, and press **Run**.

<Playground mode="svelte" id="web-1-css" title="HTML and CSS" height={260}>

```svelte
<h2>Two buttons</h2>
<p>The rules below style every button, and the one marked <code>danger</code>.</p>
<button>Save</button>
<button>Delete</button>

<style>
	button {
		color: white;
		background: rebeccapurple;
		border: none;
		border-radius: 6px;
		padding: 6px 14px;
	}
	.danger { background: crimson; }
	button:hover { opacity: 0.85; }
</style>
```

</Playground>

### Boxes and layout

Every element is drawn as a box: its content, then **padding** (space inside the border), the **border**, and **margin** (space outside). Placing boxes side by side or in rows is the job of **flexbox**: give a box `display: flex` and its children line up in a row (or a column with `flex-direction: column`), `gap` spaces them, and `flex: 1` lets one child take the space that is left. FaNWiT's title bar, tab strips and status bar are all flex rows.

<Lab id="web-1-toolbar" title="A toolbar" expect="Toolbar ready">

Make the three buttons sit in one row with space between them, and push **Settings** to the right edge. Use `display: flex` and `gap` on the `<div>`, and `margin-left: auto` on the last button. When you are happy, change the heading to **Toolbar ready**.

<Playground mode="svelte" id="web-1-toolbar" title="Toolbar" height={240}>

```svelte
<h3>A toolbar</h3>
<div class="bar">
	<button>Open</button>
	<button>Save</button>
	<button class="end">Settings</button>
</div>

<style>
	.bar {
		border: 1px solid #ccc;
		border-radius: 8px;
		padding: 6px;
	}
	button { display: block; }
</style>
```

</Playground>

<details>
<summary>Show a solution</summary>

```css
.bar { display: flex; gap: 6px; border: 1px solid #ccc; border-radius: 8px; padding: 6px; }
.end { margin-left: auto; }
```

and remove `button { display: block; }`, which put each button on its own line.

</details>

</Lab>

### Tailwind: CSS as class names

Open almost any `.svelte` file in FaNWiT and you will see long `class` attributes instead of `<style>` blocks: `class="flex items-center gap-2 px-3 text-sm"`. That is **Tailwind CSS**: each class is one small CSS rule (`flex` is `display: flex`, `gap-2` is `gap: 0.5rem`, `px-3` is padding left and right). It keeps styles next to the markup they style and makes every spacing and colour come from one shared scale. The colours are named after FaNWiT's design tokens, like `bg-background` and `text-muted-foreground`, so themes can change them all at once.

<Check question="A button in FaNWiT has class=&quot;flex items-center gap-1.5 px-3&quot;. What lays out the icon and the text inside it?" options={["A <style> block in the same file", "Tailwind classes: flex lines them up in a row, items-center centres them vertically, gap-1.5 spaces them", "The browser's default button style"]} answer={1}>

Each Tailwind class is one CSS declaration. `flex` makes the button a flex row, `items-center` aligns its children vertically, `gap-1.5` puts space between them and `px-3` pads its sides.

</Check>

<Callout kind="learn-more">

[MDN's HTML basics](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Creating_the_content) and [CSS basics](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Styling_the_content) go further, and [Flexbox Froggy](https://flexboxfroggy.com) teaches flexbox as a game. The [Tailwind docs](https://tailwindcss.com/docs) list every class.

</Callout>
