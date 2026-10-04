---
title: Your first Rust program
section: Rust basics
order: 1
summary: Why FaNWiT's core is Rust, how a Rust program is built and run, and the basics you have already met in JavaScript under new names: variables, types, functions and control flow.
---
# Your first Rust program

The window you see is a web page; underneath it runs a program written in **Rust**. Every file FaNWiT reads or writes, every database query, every window it opens and the lock that keeps two copies of the app from editing one vault go through that program (`src-tauri/`). This part teaches the Rust it uses, in the order you will need it.

<Callout kind="why">

The page in the window is not trusted: a plugin or a bug could ask it to read any file on the computer. So the page cannot touch files at all. It asks the Rust side, which checks every path against the folders you chose before it does anything. That check has to be fast, and it must not have the kinds of bugs that let an attacker in. Rust is a language whose compiler refuses whole families of those bugs (reading freed memory, two threads changing the same value at once) before the program ever runs, and it runs as fast as C. That is why the core is Rust and the interface is TypeScript.

</Callout>

## Where to start

You just finished the web part, so this part assumes JavaScript and nothing else. If you already know some Rust, answer these; each one you get right lets you skim a chapter.

<Check question="let v = vec![1, 2]; let w = v; println!(&quot;&#123;:?&#125;&quot;, v); What happens?" options={["It prints [1, 2]", "It does not compile: v was moved into w", "It prints an empty vector"]} answer={1}>

If you knew that, skim **Ownership and borrowing**. If not, it is the most important chapter of this part.

</Check>

<Check question="What does the ? after a function call do in Rust?" options={["Makes the value optional", "Returns early with the error if the call failed, otherwise gives the value", "Prints a debug message"]} answer={1}>

If you knew that, skim **Errors without exceptions**.

</Check>

## Cargo: build, run, test

Rust code is built by **Cargo**, Rust's equivalent of pnpm and Vite in one. `Cargo.toml` lists the project's dependencies (called **crates**) like `package.json`; `cargo build` compiles, `cargo run` compiles and runs, `cargo test` runs the tests. In FaNWiT you rarely call it yourself: `pnpm tauri dev` builds the Rust side for you, and `cargo test --manifest-path src-tauri/Cargo.toml` runs its tests.

Rust is **compiled**: the whole program is checked and turned into a machine-code executable before it runs. Errors appear at compile time, with messages that are unusually good; read them, they usually say exactly what to change.

The editors in this part run your code on the official Rust Playground, so you need nothing installed yet.

<Playground mode="rust" id="rust-1-hello" title="Hello, Rust" height={200}>

```rust
fn main() {
    let app = "FaNWiT";
    let windows = 3;
    println!("{app} has {windows} windows open");
    println!("{} + {} = {}", 2, 3, 2 + 3);
}
```

</Playground>

Every program starts at `fn main()`. `println!` prints a line; the `!` means it is a **macro**, code that writes code at compile time, which is how it can check the `{}` placeholders against the values you pass. You will also meet `format!` (the same, but gives you the text), `vec!` (makes a list) and `assert!`.

<Callout kind="tip" title="Coming from JavaScript">

| JavaScript | Rust |
|---|---|
| `const x = 1` | `let x = 1;` (cannot change) |
| `let x = 1` | `let mut x = 1;` |
| `` `${a} and ${b}` `` | `format!("{a} and {b}")` |
| `console.log(x)` | `println!("{x}")`, or `println!("{x:?}")` for a debug view |
| `function f(a) { return a * 2 }` | `fn f(a: i32) -> i32 { a * 2 }` |

Statements end with `;`. Variables cannot change unless you say `mut`: the default is the safe one.

</Callout>

## Types

Rust needs to know every value's type when it compiles, but works most of them out by itself. Where values enter or leave a function you write them, like TypeScript at a module boundary.

<Playground mode="rust" id="rust-1-types" title="Types" height={290}>

```rust
fn main() {
    let count: u32 = 42;          // unsigned 32-bit integer: never negative
    let offset: i64 = -7;         // signed 64-bit integer
    let ratio: f64 = 0.75;        // a floating point number
    let ready: bool = true;
    let initial: char = 'F';      // one character, single quotes
    let name: &str = "notes.md";  // a piece of text you are looking at
    let mut path = String::from("/vault/"); // text you own and can grow
    path.push_str(name);

    println!("{count} {offset} {ratio} {ready} {initial}");
    println!("{path} is {} bytes of text", path.len());
}
```

</Playground>

There are two kinds of text, and FaNWiT's code is full of both: `String` owns its text and can change it; `&str` is a view of text that lives somewhere else. Why there are two is the subject of the next chapter. For now: function parameters are usually `&str`, and when you need to build or keep text, it is a `String`.

## Functions and expressions

A function names its parameters' types and its result's type after `->`. The last expression in a block, without a `;`, is the block's value; that is how most Rust functions return.

<Playground mode="rust" id="rust-1-functions" title="Functions" height={300}>

```rust
fn label(title: &str, keys: &str) -> String {
    if keys.is_empty() {
        title.to_string()
    } else {
        format!("{title} ({keys})")
    }
}

fn main() {
    println!("{}", label("Save note", "Ctrl+S"));
    println!("{}", label("About", ""));

    // if is an expression too: it gives a value
    let n = 7;
    let kind = if n % 2 == 0 { "even" } else { "odd" };
    println!("{n} is {kind}");

    for i in 1..=3 {        // 1, 2, 3
        println!("window {i}");
    }
}
```

</Playground>

`1..=3` is a **range** including 3; `1..3` stops before it. `loop { ... }` repeats until `break`, and `while cond { ... }` is as in JavaScript.

<Lab id="rust-1-fizz" title="Count the windows" expect="5 windows: 2 main, 3 child">

Write a function `describe(main: u32, child: u32) -> String` that returns text like `5 windows: 2 main, 3 child`, and print `describe(2, 3)` from `main`. If there is just one window in total, say `1 window` (no s).

<Playground mode="rust" id="rust-1-lab" title="describe" height={240}>

```rust
fn describe(main: u32, child: u32) -> String {
    String::new() // replace this
}

fn main() {
    println!("{}", describe(2, 3));
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
fn describe(main: u32, child: u32) -> String {
    let total = main + child;
    let word = if total == 1 { "window" } else { "windows" };
    format!("{total} {word}: {main} main, {child} child")
}
```

The `if` gives a value straight into `word`, and the `format!` without a `;` is what the function returns.

</details>

</Lab>

## In FaNWiT

Open `src-tauri/src/main.rs`. It is six lines: `main` calls `run()` in `src-tauri/src/lib.rs`, which builds the Tauri app. You will read `lib.rs` line by line in the Tauri part. By the end of this part, every line in it will be familiar.

<Callout kind="learn-more">

[The Rust Programming Language](https://doc.rust-lang.org/book/) (called *the book*) is the official, free guide: chapters [1](https://doc.rust-lang.org/book/ch01-00-getting-started.html) and [3](https://doc.rust-lang.org/book/ch03-00-common-programming-concepts.html) cover this one. [Rust by Example](https://doc.rust-lang.org/rust-by-example/) is the same ground as short runnable programs, and [Rustlings](https://rustlings.rust-lang.org) is a set of small exercises you fix on your own computer.

</Callout>
