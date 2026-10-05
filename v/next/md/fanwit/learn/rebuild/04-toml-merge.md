# TOML that keeps your comments

FaNWiT keeps its state in TOML files you can open and edit: settings, keybindings, menus, layouts. The app writes to those files too, every time you change a setting. This chapter solves the problem that creates: how does the app change one value without throwing away the comments, the order and the formatting you wrote?

<Callout kind="why">

The usual way to save a file is: parse it into a value, change the value, write the value back out. That loses everything that is not data, your comments first of all, and reorders keys. For a config file you edit by hand, that is unacceptable: "state is data" only works if the app treats your file with respect. The fix is a **format-preserving** editor: keep the parsed document, with its comments and spacing, and change only the keys whose values changed. Rust's `toml_edit` crate does exactly that, so FaNWiT writes its merge once, in Rust, and runs it everywhere.

</Callout>

```tikz caption="One Rust crate, two ways to run it" alt="The toml-merge crate is linked into the desktop app as a library, and compiled to WebAssembly for the browser and memory hosts"
\begin{tikzpicture}[x=1mm,y=1mm,
  b/.style={fwnode,text width=38mm,minimum height=13mm,font=\small}]
\node[b,fwcore] (crate) at (0,0) {\texttt{packages/toml-merge}\\[1pt]{\scriptsize Rust, uses toml\_edit}};
\node[b,fwhost] (desk) at (60,10) {desktop\\[1pt]{\scriptsize linked into the app (\texttt{fw\_toml\_merge})}};
\node[b,fwuser] (web) at (60,-10) {browser and tests\\[1pt]{\scriptsize \texttt{toml-merge.wasm}, loaded on first write}};
\draw[fwarrow] (crate) -- node[fwlabel,above,sloped]{rlib} (desk);
\draw[fwarrow] (crate) -- node[fwlabel,below,sloped]{cdylib, wasm32} (web);
\end{tikzpicture}
```

## The crate

FaNWiT's Rust is a **workspace**: several crates built together, sharing one `target` folder and one `Cargo.lock`. `src-tauri/Cargo.toml` lists them; add the first one now:

```toml
[workspace]
members = [".", "../packages/toml-merge"]
```

Create `packages/toml-merge/Cargo.toml`:

<Source path="packages/toml-merge/Cargo.toml" open="true" />

<Callout kind="new" title="New here: crate types">

`crate-type = ["cdylib", "rlib"]` builds the library two ways. **rlib** is a normal Rust library other crates link (the desktop app). **cdylib** is a library with a C-compatible interface, which is what a `.wasm` file needs to be: JavaScript can call its exported functions. `workspace = "../../src-tauri"` says which workspace this crate belongs to, since it lives outside that folder.

</Callout>

### Turning JSON into TOML values

The caller sends the whole desired value as JSON (the same JSON the web side has). `to_value` converts one JSON value into a TOML value:

<Source path="packages/toml-merge/src/lib.rs" from="fn to_value" to="}" />

<Callout kind="new" title="New here: match as an expression, and return inside it">

`Some(match v { ... })` wraps whatever the `match` produces in `Some`. One arm does something different: `Value::Null => return None` leaves the whole function early, because TOML has no null. `(*b).into()` converts a `bool` into a TOML value through the `From`/`Into` traits that `toml_edit` implements; `i.into()` does the same for integers.

</Callout>

### Choosing how to write a new key

When a key is new, the merge must decide its TOML shape: a `[table]`, an inline `{ table }`, an `[[array of tables]]` or a plain value. `new_item` decides by depth and content:

<Source path="packages/toml-merge/src/lib.rs" from="fn new_item" to="}" />

<Callout kind="new" title="New here: match guards and is_simple">

`Value::Object(o) if depth <= 2 || !is_simple(o) => ...` matches only when the condition after `if` holds; otherwise matching continues with the next arm. So an object near the top, or one containing other objects, becomes a real `[table]`, and a small flat object deeper down stays inline, `{ node = "side", size = "280px" }`, the way a person would write it.

</Callout>

### Changing only what changed

The heart is `merge_item` and `merge_table`. For each key in the new value: if the file already has it, merge into the existing item (keeping its comment, its "decor"); if not, insert a new one; keys that are gone from the value are removed.

<Source path="packages/toml-merge/src/lib.rs" from="fn merge_table" to="}" />

`merge_item` handles the cases. The interesting one is the last, a plain value: if it is equal to what is there, nothing is touched at all, so an unchanged file is written back byte for byte; otherwise the new value keeps the old one's decor, the spacing and the comment after it.

<Source path="packages/toml-merge/src/lib.rs" from="        (slot, v) => {" until="*slot = item;" />

And the public function:

<Source path="packages/toml-merge/src/lib.rs" from="pub fn merge_text" to="}" />

<Callout kind="new" title="New here: let ... else">

`let Value::Object(o) = value else { return Err(...) };` is a pattern match that must succeed: if `value` is an object, `o` is bound and the function continues; otherwise the `else` block runs, and it must leave the function. It replaces a `match` with one useful arm.

</Callout>

### Calling Rust from JavaScript, with no glue

The last part of the file is the WebAssembly interface. There is no binding generator: three functions exchange JSON through the module's memory.

<Source path="packages/toml-merge/src/lib.rs" from="// ----- WebAssembly ABI" until="((p as u64) << 32) | n as u64" />

Read it as a conversation through shared memory:

1. JavaScript calls `alloc(len)`: Rust reserves `len` bytes and returns their address.
2. JavaScript writes the input JSON there and calls `merge(ptr, len)`.
3. Rust reads the input, merges, writes the output JSON into a new buffer, and returns **two numbers packed into one**: the address in the upper 32 bits, the length in the lower 32.
4. JavaScript reads the output and calls `dealloc` to free it.

<Callout kind="new" title="New here: unsafe, raw pointers and forget">

- `*mut u8` is a **raw pointer**: an address with none of a reference's guarantees. The compiler cannot check it, so code that uses one to read memory is marked `unsafe`: you, not the compiler, promise it is correct.
- `#[no_mangle] pub extern "C" fn` exports a function under its exact name with the C calling convention, so the WebAssembly module exposes `alloc`, `merge` and `dealloc` to JavaScript.
- `std::mem::forget(v)` tells Rust **not** to free a value when it goes out of scope. The buffer must outlive the function, because JavaScript reads it afterwards; `Vec::from_raw_parts` later rebuilds the `Vec` so dropping it frees the memory.
- `#[cfg(target_arch = "wasm32")]` compiles these only for WebAssembly; the desktop never sees them.

This is the only `unsafe` code in FaNWiT's own crates, and it is small on purpose: four lines that hand memory across a boundary, around ordinary safe Rust.

</Callout>

The tests at the bottom pin the promise: comments survive, only changed keys change.

<Source path="packages/toml-merge/src/lib.rs" />

Run them:

```sh
cargo test --manifest-path packages/toml-merge/Cargo.toml
```

### Build the WebAssembly file

```sh
rustup target add wasm32-unknown-unknown
cargo build --manifest-path packages/toml-merge/Cargo.toml --release --target wasm32-unknown-unknown
cp src-tauri/target/wasm32-unknown-unknown/release/fanwit_toml_merge.wasm src/fanwit/host/toml-merge.wasm
```

The `.wasm` file is committed, so nobody else needs the Rust toolchain to build the web side. Rebuild it only when the crate changes.

## The JavaScript side

`src/fanwit/host/toml-merge.ts` loads the module on first use and speaks the protocol:

<Source path="src/fanwit/host/toml-merge.ts" open="true" />

<Callout kind="new" title="New here: ?init imports, BigInt and ??=">

- `import init from "./toml-merge.wasm?init"` is a Vite feature: it gives a function that instantiates the WebAssembly module. Nothing is downloaded until `init()` is called.
- `merge` returns a Rust `u64`, which arrives in JavaScript as a **BigInt** (a whole number of any size, written `32n`). `r >> 32n` shifts it right by 32 bits to get the address; `r & 0xffffffffn` keeps the lower 32 bits, the length. `Number(...)` turns each back into an ordinary number.
- `exports ??= init()...` assigns only if `exports` is still `undefined`: the module is instantiated once, by whichever write comes first, and every later call reuses the same promise.
- `res.ok!` asserts to TypeScript that `ok` is there (the `!`), because the line above has just handled the error case.

</Callout>

## Checkpoint

<Source path="src/fanwit/host/toml-merge.test.ts" />

```sh
pnpm vitest run src/fanwit/host
```

All the host tests pass now, including the TOML test from the last chapter: `MemoryFs.writeToml` keeps `# my settings` and `# the default` while changing the theme.

<Check question="The user's settings.toml has a comment above every key. They change one setting in the app. What does FaNWiT write?" options={["A fresh file with the new values, comments gone", "The same file with only that one value changed; everything else byte for byte", "Nothing until the app closes"]} answer={1}>

The merge keeps the parsed document and touches only keys whose values changed, keeping each value's surrounding decor. An unchanged key is not even rewritten.

</Check>
