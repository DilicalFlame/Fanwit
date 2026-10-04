---
title: Collections, closures and iterators
section: Rust basics
order: 5
summary: Vec and HashMap, the functions you can pass around (closures), and iterators, Rust's map and filter, which FaNWiT's sandbox uses to decide whether a path is allowed.
---
# Collections, closures and iterators

You know `map`, `filter` and arrow functions from JavaScript. Rust has the same tools with types attached: **closures** for functions written inline, **iterators** for walking collections, and the two collections FaNWiT uses most, `Vec` and `HashMap`.

<Callout kind="why">

FaNWiT's sandbox answers "may the page touch this path?" thousands of times a session. Its answer is one line: is the path inside any of the allowed folders? Iterators let that line say exactly that, `roots.iter().any(|r| path.starts_with(r))`, and compile to a loop as fast as one written by hand.

</Callout>

## Vec and HashMap

<Playground mode="rust" id="rust-5-collections" title="Vec and HashMap" height={330}>

```rust
use std::collections::HashMap;

fn main() {
    // Vec: a growable list
    let mut roots: Vec<String> = Vec::new();
    roots.push("/home/ada/notes".to_string());
    roots.push("/home/ada/work".to_string());
    println!("{} roots, first {}", roots.len(), roots[0]);

    // HashMap: keys to values
    let mut owners: HashMap<String, String> = HashMap::new();
    owners.insert("/home/ada/notes".into(), "main".into());
    owners.insert("/home/ada/work".into(), "main-2".into());

    match owners.get("/home/ada/work") {
        Some(window) => println!("work is open in {window}"),
        None => println!("work is not open"),
    }
    owners.remove("/home/ada/notes");
    println!("{owners:?}");
}
```

</Playground>

`get` returns an `Option`, because the key may be missing; `roots[0]` panics when the list is empty, so FaNWiT uses `.first()` (an `Option`) when that can happen.

## Closures

A **closure** is an anonymous function, written `|arguments| body`. It can use variables from around it.

<Playground mode="rust" id="rust-5-closures" title="Closures" height={270}>

```rust
fn main() {
    let root = "/vault";
    let inside = |path: &str| path.starts_with(root);   // uses root from outside

    println!("{}", inside("/vault/a.md"));
    println!("{}", inside("/etc/hosts"));

    let mut opened = 0;
    let mut open = |name: &str| {   // changes opened, so the closure is mut
        opened += 1;
        println!("opened {name}");
    };
    open("a.md");
    open("b.md");
    println!("{opened} files opened");
}
```

</Playground>

A function can take a closure as a parameter. FaNWiT's vault lock does: `claim(&self, lock: &Path, window: &str, alive: impl Fn(&str) -> bool)` takes "a function that says whether a window still exists", so the lock code does not need to know about Tauri windows at all, and a test can pass `|_| false`.

When a closure has to outlive the place it was made (a thread, a file watcher callback), it is written `move |...|`: it takes ownership of what it uses instead of borrowing it.

## Iterators

`.iter()` walks a collection without taking it; adapters like `map` and `filter` describe what to do; and something at the end runs it: `collect()` into a new collection, `any`, `find`, `count`, `sum`.

<Playground mode="rust" id="rust-5-iterators" title="Iterators" height={330}>

```rust
fn main() {
    let roots = vec!["/home/ada/notes", "/home/ada/work"];
    let path = "/home/ada/work/plan.md";

    // the sandbox's question, in one line
    let allowed = roots.iter().any(|r| path.starts_with(r));
    println!("allowed: {allowed}");

    let files = vec!["a.md", "b.txt", "c.md", "notes.tmp"];
    let markdown: Vec<&str> = files.iter().copied().filter(|f| f.ends_with(".md")).collect();
    println!("{markdown:?}");

    let sizes = [120, 4096, 88];
    let total: u32 = sizes.iter().sum();
    let listed: Vec<String> = files.iter().enumerate().map(|(i, f)| format!("{}. {f}", i + 1)).collect();
    println!("{total} bytes; {}", listed.join(", "));
}
```

</Playground>

`collect()` needs to know what to build, which is why the variable has a type (`Vec<&str>`). Nothing happens until a final step asks for values: an iterator chain is a description, not a loop that already ran.

Here is the real check, from `src-tauri/src/fanwit/sandbox.rs`:

```rust
pub fn check(&self, path: &str) -> Result<PathBuf> {
    let c = canon(Path::new(path));
    let inside = |roots: &RwLock<Vec<PathBuf>>| roots.read().unwrap().iter().any(|r| c.starts_with(r));
    if inside(&self.app_roots) || inside(&self.active) {
        Ok(c)
    } else {
        Err(format!("Access denied: \"{}\" is outside the app and open vault folders.", path))
    }
}
```

A closure (`inside`) that runs an iterator (`.iter().any(...)`) over a list, inside a `Result`. You can now read every piece of it except `RwLock`, which is in the concurrency chapter.

<Callout kind="tip" title="Coming from JavaScript">

`arr.map(f)` is `v.iter().map(f).collect::<Vec<_>>()`; `arr.some(f)` is `.any(f)`; `arr.find(f)` is `.find(f)` and gives an `Option`; `Object.entries(o)` is iterating a `HashMap`, which gives `(key, value)` pairs.

</Callout>

<Lab id="rust-5-lab" title="Group files by type" expect="md: 2, txt: 1, toml: 1">

Count the files by extension into a `HashMap<&str, u32>`, then print the counts in the order of the goal. Use `rsplit_once('.')` to get the extension and `*counts.entry(ext).or_insert(0) += 1` to count.

<Playground mode="rust" id="rust-5-lab" title="Count" height={280}>

```rust
use std::collections::HashMap;

fn main() {
    let files = ["a.md", "b.txt", "c.md", "settings.toml"];
    let mut counts: HashMap<&str, u32> = HashMap::new();
    // count here

    let order = ["md", "txt", "toml"];
    let line: Vec<String> = order.iter().map(|e| format!("{e}: {}", counts.get(e).unwrap_or(&0))).collect();
    println!("{}", line.join(", "));
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
for f in files {
    if let Some((_, ext)) = f.rsplit_once('.') {
        *counts.entry(ext).or_insert(0) += 1;
    }
}
```

`entry` finds the slot for the key (adding `0` if it is new) and gives a mutable reference to its value; `*` writes through it.

</details>

</Lab>

<Callout kind="learn-more">

The book's [chapter 8, collections](https://doc.rust-lang.org/book/ch08-00-common-collections.html) and [chapter 13, closures and iterators](https://doc.rust-lang.org/book/ch13-00-functional-features.html); the [Iterator](https://doc.rust-lang.org/std/iter/trait.Iterator.html) reference lists every adapter.

</Callout>
