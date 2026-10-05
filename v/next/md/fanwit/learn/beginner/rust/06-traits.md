# Traits and generics

Open almost any file in `src-tauri/src/fanwit/` and you will see signatures like `fn fw_vault_lock<R: Runtime>(app: AppHandle<R>, ...)`. That `<R: Runtime>` is a **generic** type with a **trait bound**. This chapter makes those readable.

<Callout kind="why">

A trait is a promise of behaviour: "this type can be shown as text", "this type can be turned into JSON", "this is a Tauri runtime". Code written against the promise works for every type that keeps it. FaNWiT's `err` helper accepts any error that can be shown as text, so one function serves file, database and lock errors alike; its commands work with any Tauri runtime, so tests can run them without a real window.

</Callout>

## Traits

A **trait** lists methods a type must have. `impl Trait for Type` provides them.

<Playground mode="rust" id="rust-6-trait" title="A trait" height={330}>

```rust
trait Describe {
    fn describe(&self) -> String;
    // a default method: types get it for free, and may replace it
    fn shout(&self) -> String {
        self.describe().to_uppercase()
    }
}

struct Command { id: String }
struct Window { label: String, w: u32, h: u32 }

impl Describe for Command {
    fn describe(&self) -> String { format!("command {}", self.id) }
}
impl Describe for Window {
    fn describe(&self) -> String { format!("window {} ({}x{})", self.label, self.w, self.h) }
}

fn main() {
    let c = Command { id: "notes.save".into() };
    let w = Window { label: "main".into(), w: 1280, h: 800 };
    println!("{}", c.describe());
    println!("{}", w.shout());
}
```

</Playground>

The standard library's traits are the ones you meet most: `Display` (how `{}` prints a value), `Debug` (`{:?}`), `Clone`, `Default`, `PartialEq` (`==`), `From` (conversions), `Drop` (the cleanup from the ownership chapter), `Iterator`. `#[derive(...)]` writes the obvious implementation of several of them for you.

## Generics with bounds

A **generic** function has a type parameter in angle brackets. A **bound** (`T: Trait`) says what the type must be able to do; inside, only that is allowed.

<Playground mode="rust" id="rust-6-generic" title="Generics" height={330}>

```rust
use std::fmt::Display;

// FaNWiT's helper: any error that can be shown as text becomes its message
fn err<E: Display>(e: E) -> String {
    e.to_string()
}

// the same bound, written with impl Trait: shorter, for simple cases
fn log_all(items: &[impl Display]) {
    for i in items {
        println!("- {i}");
    }
}

fn largest<T: PartialOrd + Copy>(items: &[T]) -> T {
    let mut best = items[0];
    for &i in items {
        if i > best { best = i; }
    }
    best
}

fn main() {
    let parse_error = "abc".parse::<u32>().unwrap_err();
    println!("{}", err(parse_error));
    println!("{}", err("plain text works too"));
    log_all(&[1, 2, 3]);
    log_all(&["a", "b"]);
    println!("{} {}", largest(&[3, 9, 4]), largest(&[1.5, 0.2]));
}
```

</Playground>

Generic code is copied out for each type it is used with when compiling, so it is as fast as code written for one type.

## Reading FaNWiT's signatures

```rust
#[tauri::command]
pub fn fw_vault_lock<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    state: tauri::State<State>,
    path: String,
) -> Result<VaultLock> { ... }
```

Read it as: "for any Tauri runtime `R`, this command receives the app handle and the calling window for that runtime, the shared state, and a path string from JavaScript, and returns a `VaultLock` or an error message". `Runtime` is a trait the real desktop runtime implements, and so does a mock one used in tests. You will almost always just copy the `<R: Runtime>` pattern; now you know what it means.

Two more forms you will see:

- `impl Fn(&str) -> bool`: "any closure taking a `&str` and returning a `bool`" (the vault lock's `alive` check).
- `Box<dyn Fn(...)>`: a closure whose type is decided at run time, kept on the heap. Used where different closures must sit in one list.

<Callout kind="tip" title="Coming from JavaScript">

A trait is close to a TypeScript `interface` that classes `implements`, except the implementation can be added to a type afterwards, even to types from other crates. `fn f<T: Display>(x: T)` is like `function f<T extends { toString(): string }>(x: T)`.

</Callout>

<Lab id="rust-6-lab" title="Implement Display" expect="notes.save (Save note) in Notes">

Implement `std::fmt::Display` for `Command` so that `println!("{c}")` prints the goal line. The method to write is `fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result`, and `write!(f, "...", ...)` writes into `f`.

<Playground mode="rust" id="rust-6-lab" title="Display" height={260}>

```rust
use std::fmt;

struct Command {
    id: String,
    title: String,
    category: String,
}

// impl fmt::Display for Command { ... }

fn main() {
    let c = Command { id: "notes.save".into(), title: "Save note".into(), category: "Notes".into() };
    println!("{c}");
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
impl fmt::Display for Command {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{} ({}) in {}", self.id, self.title, self.category)
    }
}
```

Implementing `Display` also gives you `.to_string()` for free, through a blanket implementation in the standard library: exactly what `err` relies on.

</details>

</Lab>

<Callout kind="learn-more">

The book's [chapter 10, generics, traits and lifetimes](https://doc.rust-lang.org/book/ch10-00-generics.html) and the [Display trait](https://doc.rust-lang.org/std/fmt/trait.Display.html).

</Callout>
