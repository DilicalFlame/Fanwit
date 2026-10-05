# Ownership and borrowing

This is the one idea in Rust that JavaScript has no equivalent for, and the one that makes the rest of the language make sense. Take it slowly; everything after builds on it.

<Callout kind="why">

JavaScript frees memory with a *garbage collector*: something that runs now and then, finds values nobody uses and throws them away. Rust has none. Instead, every value has exactly one **owner**, and the value is freed the moment its owner goes away. The compiler tracks who owns what and who is only looking, and refuses programs where someone could look at a value after it is gone, or change it while someone else is reading. You get memory safety and no pauses, and the same rules stop two threads changing one value at once. FaNWiT's Rust side handles many windows and file watchers at the same time; these rules are why that is safe.

</Callout>

## One owner

<Playground mode="rust" id="rust-2-move" title="A move" height={230}>

```rust
fn main() {
    let a = String::from("notes.md");
    let b = a;              // the String moves to b; a no longer owns anything
    println!("{b}");
    // println!("{a}");     // remove the // : the compiler refuses, "value borrowed here after move"
}
```

</Playground>

Remove the `//` before the last line and run it. The error is the point: after `let b = a`, there is still exactly one owner, so `a` cannot be used. Passing a value to a function moves it the same way.

Small values that are cheap to copy (numbers, `bool`, `char`) are **copied** instead of moved, so `let y = x` leaves `x` usable. A `String` or a `Vec` owns memory elsewhere, and copying that silently would be slow, so you ask for it: `a.clone()`.

```tikz caption="Moving gives the value away; borrowing lends it and gets it back" alt="On the left, a String moves from a to b and a is crossed out. On the right, a lends the String to a function with an ampersand and keeps owning it"
\begin{tikzpicture}[x=1mm,y=1mm,
  var/.style={fwnode,font=\small\ttfamily,minimum width=12mm},
  heap/.style={fwnode,fwwarm,font=\scriptsize\ttfamily,minimum width=24mm}]
% move
\node[font=\small\bfseries,text=fwInk] at (22,32) {move: \texttt{let b = a;}};
\node[var,fill=fwPaper,draw=fwSlate,text=fwSlate] (a) at (5,20) {a};
\draw[fwRed,line width=1pt] (0,15) -- (10,25);
\node[var,fwcore] (b) at (40,20) {b};
\node[heap] (h1) at (22,4) {"notes.md"};
\draw[fwarrow] (b) -- (h1);
\draw[fwdash] (a) -- node[fwlabel,left]{gone} (h1);
% borrow
\node[font=\small\bfseries,text=fwInk] at (95,32) {borrow: \texttt{show(\&a);}};
\node[var,fwcore] (a2) at (78,20) {a};
\node[var,fwuser,text width=18mm] (f) at (113,20) {show(path)};
\node[heap] (h2) at (95,4) {"notes.md"};
\draw[fwarrow] (a2) -- node[fwlabel,left]{owns} (h2);
\draw[fwdash,fwAccent] (f) -- node[fwlabel,right]{looks, for a while} (h2);
\end{tikzpicture}
```

## Borrowing: looking without taking

Most of the time a function only needs to look at a value. It takes a **reference**, written `&`, and the caller keeps ownership.

<Playground mode="rust" id="rust-2-borrow" title="Borrowing" height={290}>

```rust
fn extension(path: &str) -> &str {
    match path.rfind('.') {
        Some(i) => &path[i + 1..],   // a view into the same text, no copy
        None => "",
    }
}

fn add_suffix(path: &mut String) {
    path.push_str(".bak");          // &mut: allowed to change it
}

fn main() {
    let mut path = String::from("notes.md");
    println!("{} is a .{} file", path, extension(&path));
    add_suffix(&mut path);
    println!("now {path}");
}
```

</Playground>

This is where `&str` comes from: a `&String` can be used wherever a `&str` is expected, and `&path[i + 1..]` is a view of part of the text. Nothing is copied, and the compiler makes sure the view is not used after `path` is gone.

### The two rules

At any moment, a value can have **either** any number of `&` references (readers) **or** exactly one `&mut` reference (a writer), never both. That is the whole of it.

<Playground mode="rust" id="rust-2-rules" title="One writer or many readers" height={260}>

```rust
fn main() {
    let mut windows = vec!["main".to_string()];
    let first = &windows[0];        // a reader
    // windows.push("settings".to_string()); // remove the // : a writer while a reader exists
    println!("first window: {first}");
    windows.push("settings".to_string()); // fine here: first is no longer used
    println!("{windows:?}");
}
```

</Playground>

Uncomment the push in the middle and the compiler stops you. It is not being fussy: pushing may move the list's items to a bigger block of memory, and `first` would then point at memory that was freed. In JavaScript the equivalent bug (changing a list while something walks it) just behaves strangely at run time.

<Callout kind="tip" title="Coming from JavaScript">

In JavaScript, objects are shared by reference and anyone holding one may change it. In Rust, sharing and changing are separated by the type: `&T` means "I may read", `&mut T` means "I am the only one, and I may write". When the compiler complains about borrowing, ask: who owns this, and does anyone else hold a reference right now?

</Callout>

## Drop: cleanup when the owner goes away

When an owner goes out of scope, Rust runs the value's cleanup, called **drop**: memory is freed, files are closed, locks are released. It always happens, even when a function returns early because of an error.

<Playground mode="rust" id="rust-2-drop" title="Drop" height={290}>

```rust
struct VaultLock {
    vault: String,
}

impl Drop for VaultLock {
    fn drop(&mut self) {
        println!("released the lock on {}", self.vault);
    }
}

fn main() {
    println!("opening");
    {
        let _lock = VaultLock { vault: "my-notes".into() };
        println!("working in the vault");
    } // _lock's scope ends here: drop runs
    println!("done");
}
```

</Playground>

FaNWiT relies on exactly this. `src-tauri/src/fanwit/fs.rs` keeps each vault's lock as an open file in a map; to release the lock it removes the entry from the map, and dropping the file releases the operating system's lock. There is no "remember to unlock" code to forget, and if the app crashes, the OS frees it too.

<Lab id="rust-2-lab" title="Fix the borrow" expect="notes.md has 8 characters; still have notes.md">

This program does not compile. Change `length` so it **borrows** its argument instead of taking ownership, and change the call to match. Do not use `clone`.

<Playground mode="rust" id="rust-2-lab" title="Fix it" height={220}>

```rust
fn length(text: String) -> usize {
    text.len()
}

fn main() {
    let name = String::from("notes.md");
    println!("{name} has {} characters; still have {name}", length(name));
}
```

</Playground>

<details>
<summary>Show a solution</summary>

`fn length(text: &str) -> usize` and call it as `length(&name)`. The function only looks, so a reference is enough, and `name` stays owned by `main`.

</details>

</Lab>

<Check question="A function only needs to read a String. Which parameter type is usual?" options={["String: take ownership", "&str: borrow a view of the text", "&mut String: borrow it to change"]} answer={1}>

Taking `String` would move the caller's value away; `&mut` would ask for exclusive access it does not need. `&str` accepts a `&String`, a string literal, or part of another string.

</Check>

<Callout kind="learn-more">

The book's [chapter 4, Understanding ownership](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html), with [references and borrowing](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html) and [slices](https://doc.rust-lang.org/book/ch04-03-slices.html). Rust by Example on [Drop](https://doc.rust-lang.org/rust-by-example/trait/drop.html).

</Callout>
