---
title: Structs, enums and match
section: Rust basics
order: 3
summary: Your own types. Structs group data, enums say "one of these", methods live in impl blocks, and match handles every case, which the compiler checks.
---
# Structs, enums and match

JavaScript describes data with objects and TypeScript names their shapes with interfaces. Rust does both with **structs** and **enums**, and attaches functions to them in `impl` blocks. FaNWiT's Rust side is a handful of these types and the functions that work on them.

<Callout kind="why">

A vault lock can be in one of three situations: this window has it, another window has it (and which one), or another program has it. As an enum, those are the only three values the type can hold, the "another window" case carries the window's label with it, and every `match` on it must handle all three. Add a fourth later and the compiler lists every place that does not handle it yet. That is a whole class of "forgot a case" bugs gone.

</Callout>

## Structs

<Playground mode="rust" id="rust-3-struct" title="A struct with methods" height={330}>

```rust
#[derive(Debug, Clone, Default)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Rect {
    // an associated function: called on the type, often a constructor
    fn new(w: f64, h: f64) -> Self {
        Rect { x: 0.0, y: 0.0, w, h }
    }
    // a method: takes &self, called on a value
    fn area(&self) -> f64 {
        self.w * self.h
    }
    fn moved(&self, dx: f64, dy: f64) -> Rect {
        Rect { x: self.x + dx, y: self.y + dy, ..self.clone() }
    }
}

fn main() {
    let r = Rect::new(1280.0, 800.0);
    let m = r.moved(40.0, 40.0);
    println!("{:?}, area {}", m, r.area());
    println!("{:?}", Rect::default());
}
```

</Playground>

`#[derive(...)]` asks the compiler to write common code for you: `Debug` lets `{:?}` print it, `Clone` adds `.clone()`, `Default` makes `Rect::default()` with every field zero. FaNWiT's window code has this very struct (`Rect` in `src-tauri/src/fanwit/windows.rs`) to remember where each window was.

`&self` borrows the value the method is called on; `&mut self` would allow changing it, and `self` would take ownership. `..self.clone()` fills the remaining fields from another value, like `...` in JavaScript.

## Enums

An **enum** is a value that is one of several **variants**, and each variant can carry its own data.

<Playground mode="rust" id="rust-3-enum" title="An enum and match" height={340}>

```rust
#[derive(Debug)]
enum VaultLock {
    Ok,                         // this window has it
    Window { label: String },   // another window has it: which one
    Busy,                       // another program has it
}

fn message(lock: &VaultLock) -> String {
    match lock {
        VaultLock::Ok => "Opened.".to_string(),
        VaultLock::Window { label } => format!("Already open in window {label}: bringing it to the front."),
        VaultLock::Busy => "Another copy of the app is using this vault.".to_string(),
    }
}

fn main() {
    let cases = [VaultLock::Ok, VaultLock::Window { label: "main-2".into() }, VaultLock::Busy];
    for c in &cases {
        println!("{:?}: {}", c, message(c));
    }
}
```

</Playground>

This is, nearly word for word, `VaultLock` in `src-tauri/src/fanwit/fs.rs`. `match` compares a value against **patterns** and runs the first arm that fits; the pattern `VaultLock::Window { label }` also takes the label out. Delete one arm and run it: the compiler names the case you forgot.

## Option: a value that may be missing

Rust has no `null`. A value that may be absent is an `Option<T>`: either `Some(value)` or `None`, and you cannot use the value without first saying what happens when it is missing.

<Playground mode="rust" id="rust-3-option" title="Option" height={300}>

```rust
fn find_window<'a>(labels: &'a [&'a str], wanted: &str) -> Option<&'a str> {
    labels.iter().copied().find(|l| l.starts_with(wanted))
}

fn main() {
    let open = ["main", "settings", "manual"];

    match find_window(&open, "set") {
        Some(label) => println!("found {label}"),
        None => println!("no such window"),
    }

    // if let: when only one case matters
    if let Some(label) = find_window(&open, "man") {
        println!("focusing {label}");
    }

    // unwrap_or: a fallback value
    println!("{}", find_window(&open, "x").unwrap_or("main"));
}
```

</Playground>

The `'a` in that signature is a **lifetime**: it tells the compiler that the label returned lives as long as the list it came from. You will see a few of them in FaNWiT and rarely need to write one; most are worked out for you.

FaNWiT uses `Option` everywhere: `app.get_webview_window(label)` gives an `Option` because the window may not exist, and the code reads `if let Some(w) = app.get_webview_window(label) { w.show() }`.

<Callout kind="tip" title="Coming from JavaScript">

`Option<T>` is `T | undefined` that the compiler makes you check. `match` is a `switch` that must cover every case and can take values out of the thing it matches. `if let Some(x) = maybe` is `if (maybe !== undefined)` with `x` ready to use.

</Callout>

<Lab id="rust-3-lab" title="Window kinds" expect="child of main, focus: lock">

Add a variant `Child { parent: String, lock: bool }` to `Kind`, handle it in `describe`, and in `main` use the commented-out `k` instead of `Kind::Main`, so the program prints the goal line.

<Playground mode="rust" id="rust-3-lab" title="Kinds" height={300}>

```rust
enum Kind {
    Main,
    Panel,
}

fn describe(k: &Kind) -> String {
    match k {
        Kind::Main => "the main window".to_string(),
        Kind::Panel => "a panel".to_string(),
    }
}

fn main() {
    // let k = Kind::Child { parent: "main".to_string(), lock: true };
    let k = Kind::Main;
    println!("{}", describe(&k));
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
enum Kind {
    Main,
    Panel,
    Child { parent: String, lock: bool },
}

// in describe:
Kind::Child { parent, lock } => format!("child of {parent}, focus: {}", if *lock { "lock" } else { "none" }),
```

`lock` is a `&bool` inside the match (we matched on `&Kind`), so `*lock` reads the value it points to.

</details>

</Lab>

<Check question="You add a variant to an enum. What happens to a match on it elsewhere that does not handle the new variant?" options={["It silently does nothing for the new variant", "The program does not compile until it is handled (or a _ arm covers it)", "It panics when the new variant arrives"]} answer={1}>

Matches must be exhaustive. A `_ =>` arm handles "everything else", but then you lose the reminder, so FaNWiT's code lists variants where it can.

</Check>

<Callout kind="learn-more">

The book's [chapter 5, structs](https://doc.rust-lang.org/book/ch05-00-structs.html) and [chapter 6, enums and pattern matching](https://doc.rust-lang.org/book/ch06-00-enums.html).

</Callout>
