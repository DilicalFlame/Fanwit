# When clauses: a tiny language

Should **Save note** be in the menu right now? Should Ctrl+B toggle the sidebar or make text bold? FaNWiT answers questions like these with **when clauses**: short expressions such as `editorFocus && !readonly`, written as data next to a command, a key or a menu item. This chapter builds the interpreter for them, `kernel/when.ts`. It is the first real algorithm of the rebuild, and a classic one: you will write a small programming language.

<Callout kind="why">

Hard-coding "is the editor focused?" into every command spreads situation checks across the code, and they cannot be changed without changing code. Writing them as strings that are data means a keybinding file, a plugin manifest or a user's `keys.toml` can say when a binding applies, and the same clause can be checked for a menu, a key and the palette alike. VS Code works this way; FaNWiT's grammar is a superset of its basics (Section 4.5.3).

</Callout>

## The grammar

The file starts with the language's grammar, one rule per line:

<Source path="src/fanwit/kernel/when.ts" from=" *   expr := or" until=" *   atom :=" />

Read it from the top: an expression is an `or`; an `or` is one or more `and`s joined by `||`; an `and` is one or more `not`s joined by `&&`; and so on down to an `atom`, a key, a value or a parenthesised expression. Rules lower down **bind tighter**: `a || b && c` means `a || (b && c)`, because `and` is inside `or`. The grammar itself encodes operator precedence.

```tikz caption="From text to a function: tokens, then a tree of closures" alt="The text vault.open and ext in md, txt becomes a list of tokens, which the parser turns into a tree of and, in and key nodes, each a function"
\begin{tikzpicture}[x=1mm,y=1mm,
  tok/.style={fwnode,font=\scriptsize\ttfamily,inner sep=2pt,minimum height=6mm},
  nd/.style={fwnode,fwcore,font=\scriptsize\ttfamily,minimum height=6.5mm}]
\node[font=\small\ttfamily,text=fwInk] at (45,34) {vault.open \&\& ext in ['md', 'txt']};
\draw[fwarrow] (45,31) -- node[fwlabel,right]{tokenize} (45,26);
\begin{scope}[start chain=going right,node distance=1.2mm]
\node[tok,fwwarm,on chain] at (-6,22) {id vault.open};
\node[tok,fwwarm,on chain] {op \&\&};
\node[tok,fwwarm,on chain] {id ext};
\node[tok,fwwarm,on chain] {id in};
\node[tok,fwwarm,on chain] {op [};
\node[tok,fwwarm,on chain] {str md};
\node[tok,fwwarm,on chain] {op ,};
\node[tok,fwwarm,on chain] {str txt};
\node[tok,fwwarm,on chain] {op ]};
\end{scope}
\draw[fwarrow] (45,18) -- node[fwlabel,right]{parse} (45,13);
\node[nd] (and) at (45,8) {and: every};
\node[nd] (k) at (25,-3) {key vault.open};
\node[nd] (in) at (65,-3) {in};
\node[nd] (e) at (55,-14) {key ext};
\node[nd] (l) at (77,-14) {list ['md','txt']};
\draw (and) -- (k); \draw (and) -- (in); \draw (in) -- (e); \draw (in) -- (l);
\node[fwlabel] at (110,-3) {each node is a function\\\texttt{(lookup) => value}};
\end{tikzpicture}
```

## Step 1: tokens

A **tokenizer** reads characters and produces **tokens**, the words of the language: operators, identifiers, strings, numbers, regular expressions.

<Source path="src/fanwit/kernel/when.ts" from="type Tok =" until="v: RegExp }" />

<Callout kind="new" title="New here: discriminated unions">

`Tok` is a union of object types that all have a field `t` with a different literal value. TypeScript uses that field to narrow: after `if (t.t === "num")`, it knows `t.v` is a `number`; after `t.t === "re"`, a `RegExp`. This is TypeScript's equivalent of a Rust enum with data, and FaNWiT uses it for everything that is "one of several kinds" (layout actions, menu items, plugin messages).

</Callout>

<Source path="src/fanwit/kernel/when.ts" from="function tokenize(src: string)" to="}" />

It walks the string with an index `i`, and at each position tries, in order: skip spaces; a two-character operator (`&&`, `==`, ...); after `=~`, a regular expression literal `/.../flags`; a one-character operator; a quoted string with `\` escapes; a number; an identifier. Identifiers may contain dots, dashes, colons and slashes, because context keys are named like `resource.ext` and `view.notes:editor`. Anything else is a syntax error, with the position.

## Step 2: a parser that builds closures

The parser is **recursive descent**: one function per grammar rule, each calling the rules below it. `or` calls `and` until there is no more `||`; `and` calls `not` until there is no more `&&`; and so on.

<Source path="src/fanwit/kernel/when.ts" from="	function or(): Parsed {" until="	function not(): Parsed {" />

The interesting part is what each function returns: not a value, but a **function** `fn: (lookup) => value`, plus the text it came from. An `or` node's function asks its children in turn (`kids.some(...)`); a key's function looks the key up when called. Parsing happens once; evaluating is just calling the resulting function with a way to read keys.

<Source path="src/fanwit/kernel/when.ts" from="	function cmp(): Parsed {" until="fn: fns[op]" />

Comparisons pick their function from a table. `==` compares "loosely" (`loose()` turns numbers and booleans into strings, and a missing key into `""`), so `selection.count == 2` works whether the key holds `2` or `"2"`, and a key that is not set equals `''`.

<Callout kind="new" title="New here: nested functions sharing state">

`or`, `and`, `not`, `cmp` and `atom` are declared inside `parse`, so they all share its `toks` and `p` (the position in the token list) without passing them around. Each call moves `p` forward as it consumes tokens. Function declarations are **hoisted**: `or` can call `and` even though `and` is written below it.

</Callout>

## Step 3: compile once, evaluate often

<Source path="src/fanwit/kernel/when.ts" from="export function compileWhen" to="}" />

Clauses are evaluated constantly: on every key press, for every menu item, for every command in the palette as you type. So each source string is parsed once and cached. The compiled clause also records which **keys** it reads (useful for knowing what to re-check when a key changes) and can **explain** itself: `explain` walks an `and` and returns the first part that is false, which is how a disabled menu item can say *disabled because `vault.open` is false*.

The whole file:

<Source path="src/fanwit/kernel/when.ts" />

## Try it

This is a cut-down evaluator in the same style: tokens, a recursive parser, closures. Add a `||` rule above `and` so the last line prints `true`.

<Lab id="rebuild-when-or" title="Add the || operator" expect="true false true">

<Playground mode="ts" id="rebuild-when-or" title="A tiny when parser" height={420}>

```ts
type Lookup = (k: string) => unknown;
type Fn = (l: Lookup) => boolean;

function compile(src: string): Fn {
	const toks = src.match(/&&|\|\||!|[\w.]+/g) ?? [];
	let p = 0;
	const and = (): Fn => {
		const kids = [not()];
		while (toks[p] === "&&") { p++; kids.push(not()); }
		return (l) => kids.every((k) => k(l));
	};
	const not = (): Fn => {
		if (toks[p] === "!") { p++; const inner = not(); return (l) => !inner(l); }
		const key = toks[p++];
		return (l) => !!l(key);
	};
	return and(); // start from or() once you have written it
}

const ctx: Record<string, unknown> = { "vault.open": true, inputFocus: false };
const l: Lookup = (k) => ctx[k];
console.log(compile("vault.open && !inputFocus")(l), compile("inputFocus")(l), compile("inputFocus || vault.open")(l));
```

</Playground>

<details>
<summary>Show a solution</summary>

```ts
const or = (): Fn => {
	const kids = [and()];
	while (toks[p] === "||") { p++; kids.push(and()); }
	return (l) => kids.some((k) => k(l));
};
return or();
```

</details>

</Lab>

## Checkpoint

The tests exist already in the repository; add `src/fanwit/kernel/when.test.ts`:

<Source path="src/fanwit/kernel/when.test.ts" />

```sh
pnpm vitest run src/fanwit/kernel/when
```

<Check question="Why does a || b && c mean a || (b && c) in this parser?" options={["Because && is checked first at run time", "Because the or rule is made of and rules: and binds tighter, so it is parsed deeper in the tree", "Because of the cache"]} answer={1}>

Precedence comes from the grammar's shape. `or()` collects `and()` results, so a whole `b && c` is one child of the `or`.

</Check>
