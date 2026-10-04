---
title: Modules, crates and serde
section: Rust basics
order: 7
summary: How Rust code is split into files (mod, pub, use), how crates are added in Cargo.toml, and serde, the crate that turns Rust values into JSON for the page and back.
---
# Modules, crates and serde

Rust code is split into **modules** (files and folders), and pulls in other people's code as **crates**. One crate matters more than any other for FaNWiT: **serde**, which turns Rust values into JSON and JSON into Rust values. Every command the page calls goes through it in both directions.

<Callout kind="why">

The page speaks JavaScript and the core speaks Rust; between them goes JSON. Writing the conversion by hand for every type would be a lot of error-prone code. With serde, you add `#[derive(Serialize, Deserialize)]` to a struct or enum and the conversion is generated, checked against the type, and kept in step when you add a field.

</Callout>

## Modules: mod, pub, use

<FileTree>

- src-tauri/src/
  - main.rs (the program: calls run())
  - lib.rs (mod fanwit; builds the app)
  - fanwit/
    - mod.rs (pub mod fs; pub mod db; ... and shared helpers)
    - fs.rs
    - db.rs
    - sandbox.rs
    - windows.rs

</FileTree>

- `mod fanwit;` in `lib.rs` says "there is a module `fanwit`" and Rust looks for `fanwit.rs` or `fanwit/mod.rs`.
- Everything is private to its module unless marked `pub`. `pub mod fs;` makes the `fs` module visible to the rest of the crate; `pub fn` and `pub struct` do the same for one item, and `pub` on a field makes the field visible.
- `use` brings names into scope: `use std::path::{Path, PathBuf};`, or `use super::{err, Result};` for names from the parent module, which is how every file in `fanwit/` reaches the shared helpers in `mod.rs`.
- Paths use `::`: `fanwit::fs::fw_fs_read_text` is a function in a module in a module.

## Crates and Cargo.toml

`src-tauri/Cargo.toml` lists dependencies, with versions and optional **features**:

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rusqlite = { version = "0.40", features = ["bundled", "hooks"] }
toml_edit = "0.22"
notify = "8"                  # watches files for changes
trash = "5"                   # moves files to the OS trash
fanwit-toml-merge = { path = "../packages/toml-merge" }   # a crate in this repository
```

`cargo add <crate>` adds one. A `path` dependency is a crate in the same repository: FaNWiT keeps its TOML merging in `packages/toml-merge` so the web host can compile the same code to WebAssembly. Crates are found on [crates.io](https://crates.io) and documented on [docs.rs](https://docs.rs).

## serde: values to JSON and back

The Rust Playground has serde installed, so this runs:

<Playground mode="rust" id="rust-7-serde" title="serde" height={360}>

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct FsStat {
    size: u64,
    is_dir: bool,
    modified_ms: u64,
}

#[derive(Serialize, Debug)]
#[serde(tag = "status", rename_all = "lowercase")]
enum VaultLock {
    Ok,
    Window { label: String },
    Busy,
}

fn main() {
    let stat = FsStat { size: 2048, is_dir: false, modified_ms: 1_760_000_000_000 };
    println!("{}", serde_json::to_string(&stat).unwrap());

    let back: FsStat = serde_json::from_str(r#"{"size": 10, "isDir": true, "modifiedMs": 0}"#).unwrap();
    println!("{back:?}");

    for lock in [VaultLock::Ok, VaultLock::Window { label: "main-2".into() }] {
        println!("{}", serde_json::to_string(&lock).unwrap());
    }
}
```

</Playground>

Look at the JSON: `rename_all = "camelCase"` turns Rust's `is_dir` into JavaScript's `isDir`, so each side keeps its own naming style. `tag = "status"` writes an enum as an object with a `status` field, `{"status":"window","label":"main-2"}`, which is exactly what FaNWiT's TypeScript side checks: `if (r.status === "window") focus(r.label)`. `r#"..."#` is a **raw string**, where `"` needs no escaping.

<Callout kind="tip" title="Coming from JavaScript">

`serde_json::to_string(&v)` is `JSON.stringify(v)`, and `serde_json::from_str::<T>(s)` is `JSON.parse(s)` that also checks the result has the shape of `T`, and fails with a clear message if it does not. Tauri calls both for you on every command.

</Callout>

<Lab id="rust-7-lab" title="A settings file" expect="&#123;&quot;theme&quot;:&quot;dark&quot;,&quot;fontSize&quot;:16,&quot;restoreTabs&quot;:true&#125;">

Give `Settings` the right derive and serde attribute so the program prints the goal, with JavaScript-style names.

<Playground mode="rust" id="rust-7-lab" title="Settings to JSON" height={240}>

```rust
use serde::Serialize;

struct Settings {
    theme: String,
    font_size: u32,
    restore_tabs: bool,
}

fn main() {
    let s = Settings { theme: "dark".into(), font_size: 16, restore_tabs: true };
    println!("{}", serde_json::to_string(&s).unwrap());
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings { ... }
```

</details>

</Lab>

<Callout kind="learn-more">

The book's [chapter 7, packages, crates and modules](https://doc.rust-lang.org/book/ch07-00-managing-growing-projects-with-packages-crates-and-modules.html), [The Cargo Book](https://doc.rust-lang.org/cargo/), and [serde.rs](https://serde.rs), especially [attributes](https://serde.rs/attributes.html) and [enum representations](https://serde.rs/enum-representations.html).

</Callout>
