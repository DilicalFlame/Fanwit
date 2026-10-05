# JavaScript

HTML and CSS describe a page; **JavaScript** makes it do things. It runs in the page, can read and change the DOM, and answers clicks and keys. Svelte components are JavaScript with markup around it, and most of FaNWiT (everything outside `src-tauri`) is TypeScript, which is JavaScript with types. This chapter covers the part of the language FaNWiT uses every day.

<Callout kind="why">

You will not write `document.querySelector(...)` and change elements by hand much: Svelte does that for you. What you will write all the time is ordinary JavaScript: functions that take data and return data, objects that describe things (a command, a setting, a layout), arrays of them, and code that waits for a file or the Rust core to answer. That is what this chapter practises.

</Callout>

## Values and variables

Every editor here runs: press **Run** and what the code passes to `console.log` appears beside it.

<Playground mode="js" id="web-2-values" title="Values" height={250}>

```js
const name = "FaNWiT";       // text (a string)
let windows = 1;             // a number
const ready = true;          // true or false (a boolean)
const nothing = null;        // deliberately empty

windows = windows + 2;       // let can change, const cannot
console.log(name, "has", windows, "windows");
console.log(`Template strings put ${name.length} values inside text`);
console.log(typeof name, typeof windows, typeof ready);
```

</Playground>

Use `const` unless the variable really has to change, then `let`. (Old code uses `var`; you will not need it.) `===` compares without surprises (`1 === "1"` is `false`); avoid `==`.

## Functions

A **function** is a named piece of code that takes inputs and gives back a result. The short form, an **arrow function**, is everywhere in FaNWiT: `(a, b) => a + b`.

<Playground mode="js" id="web-2-functions" title="Functions" height={250}>

```js
function greet(name) {
	return `Hello, ${name}!`;
}
const shout = (text) => text.toUpperCase() + "!";
const twice = (f, x) => f(f(x));   // functions are values: pass them around

console.log(greet("Ada"));
console.log(shout("save"));
console.log(twice((n) => n * 10, 3));
```

</Playground>

That last line matters more than it looks. Passing a function to be called later is how you say "when this happens, do that": `button.onclick = () => save()`, or in FaNWiT, `ctx.commands.handle("notes.save", () => save())` registers what a command does.

## Objects and arrays

An **object** groups named values; an **array** is an ordered list. Most of FaNWiT's data is objects in arrays: a module *declares* its commands as an array of objects like `{ id: "notes.save", title: "Save note" }`.

<Playground mode="js" id="web-2-data" title="Objects and arrays" height={300}>

```js
const commands = [
	{ id: "notes.save", title: "Save note", category: "Notes" },
	{ id: "notes.delete", title: "Delete note", category: "Notes" },
	{ id: "theme.select", title: "Select theme", category: "View" }
];

console.log(commands.length, "commands; the first is", commands[0].title);

// map: a new array, one result per item; filter: only the items that pass
const titles = commands.map((c) => c.title);
const notes = commands.filter((c) => c.category === "Notes");
console.log(titles);
console.log(notes.map((c) => c.id));

// destructuring takes values out; spread copies them into something new
const { id, title } = commands[2];
const renamed = { ...commands[2], title: "Pick a theme" };
console.log(id, "|", title, "->", renamed.title);
```

</Playground>

`map`, `filter`, `find` and `some` read better than loops once you know them, and FaNWiT's code uses them constantly. `...` (spread) makes a copy with some parts changed, which is how FaNWiT changes its layout and settings without editing the old value in place.

<Lab id="web-2-palette" title="A tiny command palette" expect="2 matches: Save note, Select theme">

Write `search(text)` so it returns the commands with a **word** in their title that starts with the text, ignoring upper and lower case. `"s"` should find *Save note* and *Select theme*, but not *Delete note*: none of its words starts with an *s*. Hint: `title.toLowerCase().split(" ")` gives the words, and `.some((w) => w.startsWith(q))` asks whether any of them starts with `q`.

<Playground mode="js" id="web-2-palette" title="Search" height={280}>

```js
const commands = [
	{ id: "notes.save", title: "Save note" },
	{ id: "notes.delete", title: "Delete note" },
	{ id: "theme.select", title: "Select theme" }
];

function search(text) {
	// return the matching commands
	return [];
}

const found = search("s");
console.log(`${found.length} matches: ${found.map((c) => c.title).join(", ")}`);
```

</Playground>

<details>
<summary>Show a solution</summary>

```js
function search(text) {
	const q = text.toLowerCase();
	return commands.filter((c) => c.title.toLowerCase().split(" ").some((w) => w.startsWith(q)));
}
```

FaNWiT's real palette ranks by a fuzzy match instead (`src/fanwit/workbench/fuzzy.ts`), but the shape is the same: commands in, a filtered list out.

</details>

</Lab>

## Classes

A **class** is a template for objects that have both data and functions (called **methods**). FaNWiT's services are classes: there is one `CommandService`, one `LayoutService`, and so on, each holding its state and the methods that change it.

<Playground mode="js" id="web-2-class" title="A class" height={270}>

```js
class Counter {
	count = 0;                 // a field: every Counter has its own
	constructor(step) {
		this.step = step;      // runs once, when the object is made
	}
	add() {
		this.count += this.step;
		return this.count;
	}
}

const byTwo = new Counter(2);
byTwo.add();
byTwo.add();
console.log("count is", byTwo.count);
```

</Playground>

## Modules: import and export

A program larger than one file is split into **modules**, one file each. A module **exports** what others may use, and others **import** it:

```js
// math.js
export const double = (n) => n * 2;
export default function square(n) { return n * n; }

// app.js
import square, { double } from "./math.js";
console.log(square(3), double(3));   // 9 6
```

The name in braces must match an export; the one without braces is the file's `default` export and can be called anything. Every `.ts` and `.svelte` file in FaNWiT is a module, and paths starting with `$fanwit/` are a shortcut for `src/fanwit/` (the *SvelteKit basics* part shows where that is set up).

## Waiting: promises, async and await

Reading a file, asking the Rust core something or fetching from the internet takes time, and the page must not freeze meanwhile. Such functions return a **promise**: a value that arrives later. Inside an `async` function, `await` pauses that function (and only that function) until the promise settles.

<Playground mode="js" id="web-2-async" title="async and await" height={280}>

```js
// a stand-in for "read a file": answers after 500 ms
const readFile = (name) => new Promise((resolve) => setTimeout(() => resolve(`contents of ${name}`), 500));

async function load() {
	console.log("asking for the file...");
	const text = await readFile("notes.md");
	console.log("got:", text);
	return text.length;
}

const pending = load();
console.log("load() returned before the file arrived:", pending instanceof Promise);
console.log("length:", await pending);
```

</Playground>

The order of the lines in the output is the point: `load()` returns at once, and the rest of the code keeps running while the file is on its way. When something fails, `await` throws, and `try { ... } catch (e) { ... }` catches it like any other error. Almost every call from FaNWiT's interface to its Rust core is `await host.invoke(...)`.

<Check question="What does an async function return when you call it?" options={["The value after its last await, immediately", "A promise, at once; the value comes later", "Nothing, until it finishes"]} answer={1}>

Calling an async function starts it and returns a promise right away. `await` on that promise (inside another async function) gives you the value when it is ready.

</Check>

<Callout kind="learn-more">

[javascript.info](https://javascript.info) is a thorough, free course with exercises; its chapters on [objects](https://javascript.info/object), [array methods](https://javascript.info/array-methods), [modules](https://javascript.info/modules-intro) and [async/await](https://javascript.info/async-await) cover this chapter in depth. MDN's [JavaScript guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) is the reference.

</Callout>
