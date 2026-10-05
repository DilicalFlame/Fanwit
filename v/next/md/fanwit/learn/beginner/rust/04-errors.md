# Errors without exceptions

In JavaScript, any line may throw, and nothing in a function's signature says so. Rust has no exceptions. A function that can fail returns a `Result`: either `Ok(value)` or `Err(error)`. The caller cannot get at the value without deciding what to do about the error.

<Callout kind="why">

Almost everything FaNWiT's Rust side does can fail: a file is missing, a folder is not allowed, a database is locked, the disk is full. Each failure must reach the interface as a clear message, never as a crash of the whole app. Because a `Result` is part of every signature, the compiler shows you each place a failure can happen, and `?` makes passing it on a single character, so handling errors properly is also the easy way.

</Callout>

## Result and match

<Playground mode="rust" id="rust-4-result" title="Result" height={300}>

```rust
fn parse_port(text: &str) -> Result<u16, String> {
    match text.trim().parse::<u16>() {
        Ok(port) if port >= 1024 => Ok(port),
        Ok(port) => Err(format!("port {port} needs administrator rights; use 1024 or above")),
        Err(e) => Err(format!("\"{text}\" is not a port number: {e}")),
    }
}

fn main() {
    for input in ["3000", "80", "abc"] {
        match parse_port(input) {
            Ok(p) => println!("listening on {p}"),
            Err(msg) => println!("error: {msg}"),
        }
    }
}
```

</Playground>

`Ok(port) if port >= 1024` is a **guard**: the arm matches only when the condition holds.

## ? : pass the error up

Writing a `match` for every call that can fail would bury the real code. The `?` operator does the common thing: on `Ok`, give me the value; on `Err`, return that error from this function right now.

<Playground mode="rust" id="rust-4-question" title="The ? operator" height={330}>

```rust
use std::collections::HashMap;

fn read_setting(files: &HashMap<&str, &str>, name: &str) -> Result<String, String> {
    let text = files.get(name).ok_or(format!("{name} does not exist"))?;
    let (key, value) = text.split_once('=').ok_or(format!("{name}: expected key = value"))?;
    Ok(format!("{} is {}", key.trim(), value.trim()))
}

fn main() {
    let mut files = HashMap::new();
    files.insert("settings.toml", "theme = dark");
    files.insert("broken.toml", "theme dark");

    for name in ["settings.toml", "broken.toml", "missing.toml"] {
        match read_setting(&files, name) {
            Ok(v) => println!("ok: {v}"),
            Err(e) => println!("error: {e}"),
        }
    }
}
```

</Playground>

`ok_or(...)` turns an `Option` into a `Result` (`None` becomes the error you give), and `?` then returns early with it. Two lines, two failure cases handled.

## How FaNWiT reports errors

Different crates have different error types: `std::io::Error` for files, `rusqlite::Error` for the database. The interface only needs a message. So `src-tauri/src/fanwit/mod.rs` defines:

```rust
pub type Result<T> = std::result::Result<T, String>;

/// Converts any error into the string the frontend receives.
pub fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
```

and every command converts at the point of failure with `map_err(err)`, then `?`:

```rust
let p = state.sandbox.check(&path)?;                 // already a FaNWiT Result: ? as is
std::fs::create_dir_all(&d).map_err(err)?;           // io::Error -> String, then ?
let text = std::fs::read_to_string(&p).map_err(err)?;
```

When a command returns `Err(message)`, Tauri rejects the JavaScript promise with that message, and the interface shows it. You will follow that whole path in the Tauri part.

## unwrap and expect

`.unwrap()` takes the value and **panics** (stops the thread with a message) on an error; `.expect("why")` is the same with your message. Use them only where failure is a bug, not a situation: in tests, or for a lock that only fails if another thread already panicked. FaNWiT's commands never unwrap a file operation; its `lib.rs` uses `.expect("error while building tauri application")`, because without the app there is nothing to report to.

<Callout kind="tip" title="Coming from JavaScript">

`Result<T, E>` is a promise that has already settled: `Ok` is resolved, `Err` is rejected, and you cannot read it without handling both. `?` is `await` that rethrows: it unwraps the good case and passes the bad one up.

</Callout>

<Lab id="rust-4-lab" title="Check a path" expect="denied: /etc/passwd is outside /vault">

Finish `check(path, root)`: return `Err` with the message in the goal when `path` does not start with `root`, and `Ok(path)` otherwise. Then make `open` use `?` on it, so `main` prints `denied: ...` for the second path. (FaNWiT's real check also resolves `..` and links first; this is the idea.)

<Playground mode="rust" id="rust-4-lab" title="A tiny sandbox" height={320}>

```rust
fn check<'a>(path: &'a str, root: &str) -> Result<&'a str, String> {
    Ok(path) // replace this
}

fn open(path: &str) -> Result<String, String> {
    let ok = path; // use check(path, "/vault") with ? here
    Ok(format!("opened {ok}"))
}

fn main() {
    for p in ["/vault/notes.md", "/etc/passwd"] {
        match open(p) {
            Ok(m) => println!("{m}"),
            Err(e) => println!("denied: {e}"),
        }
    }
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
fn check<'a>(path: &'a str, root: &str) -> Result<&'a str, String> {
    if path.starts_with(root) { Ok(path) } else { Err(format!("{path} is outside {root}")) }
}

fn open(path: &str) -> Result<String, String> {
    let ok = check(path, "/vault")?;
    Ok(format!("opened {ok}"))
}
```

</details>

</Lab>

<Check question="Inside a function returning Result<String, String>, you call std::fs::read_to_string(p), which returns Result<String, io::Error>. Why does read_to_string(p)? not compile in FaNWiT, and what fixes it?" options={["Files cannot be read in commands", "The error types differ (io::Error vs String); .map_err(err)? converts it first", "? only works on Option"]} answer={1}>

`?` returns the error as it is, so it must match the function's error type (or convert to it). `map_err(err)` turns the `io::Error` into its message, a `String`.

</Check>

<Callout kind="learn-more">

The book's [chapter 9, error handling](https://doc.rust-lang.org/book/ch09-00-error-handling.html), and [the ? operator](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html#a-shortcut-for-propagating-errors-the--operator).

</Callout>
