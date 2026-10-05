# Tests and attributes

The last chapter of Rust basics covers what sits around the code: tests, and **attributes**, the `#[...]` lines above items. You have already seen `#[derive]` and `#[tauri::command]`; here are the rest FaNWiT uses.

<Callout kind="why">

The sandbox decides what the page may touch on a user's disk. A change that silently widens it would be a security hole nobody notices. So its rules are pinned by tests that run on every change (`cargo test`, in CI too). In Rust the tests sit in the same file as the code they test, so they are read, and updated, together.

</Callout>

## Writing tests

A test is a function marked `#[test]` that panics when something is wrong, usually through `assert!` or `assert_eq!`. Tests go in a module marked `#[cfg(test)]`, which is only compiled for `cargo test`. This editor runs tests when the code has no `main`:

<Playground mode="rust" id="rust-9-tests" title="Tests" height={330}>

```rust
pub fn inside(path: &str, roots: &[&str]) -> bool {
    roots.iter().any(|r| path == *r || path.starts_with(&format!("{r}/")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_in_a_root_is_inside() {
        assert!(inside("/vault/notes.md", &["/vault"]));
    }

    #[test]
    fn a_sibling_with_a_longer_name_is_not() {
        // "/vault-secret" starts with "/vault", but is not inside it
        assert!(!inside("/vault-secret/keys.txt", &["/vault"]));
    }

    #[test]
    fn the_root_itself_is_inside() {
        assert_eq!(inside("/vault", &["/vault"]), true);
    }
}
```

</Playground>

The second test is the interesting one: a plain `starts_with` would allow `/vault-secret` when only `/vault` was chosen. Writing the test first is how you find such holes. (FaNWiT's real check compares whole path components with `Path::starts_with`, which gets this right.)

FaNWiT's tests are in the same style; `src-tauri/src/fanwit/sandbox.rs` ends with:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembered_folders_are_visible_to_exists_before_activation() {
        // ... a temporary folder, remembered but not yet activated ...
        assert!(sb.check(&p).is_err(), "still not active for reads and writes");
        assert!(sb.check_known(&p).is_ok());
    }
}
```

The text after an assertion is the message shown when it fails, which is why test names and messages read like sentences. Run them all with `cargo test --manifest-path src-tauri/Cargo.toml --workspace`.

<Lab id="rust-9-lab" title="Pin a rule with a test" expect="test result: ok. 2 passed">

`is_hidden` should treat a name as hidden when it starts with a dot, except `.` and `..`. Add a second test, `dot_dirs_are_not_hidden`, asserting that `.` and `..` are not hidden, then fix `is_hidden` until both tests pass.

<Playground mode="rust" id="rust-9-lab" title="is_hidden" height={300}>

```rust
pub fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dotfiles_are_hidden() {
        assert!(is_hidden(".trash"));
        assert!(!is_hidden("notes.md"));
    }
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
pub fn is_hidden(name: &str) -> bool {
    name.starts_with('.') && name != "." && name != ".."
}

#[test]
fn dot_dirs_are_not_hidden() {
    assert!(!is_hidden("."));
    assert!(!is_hidden(".."));
}
```

</details>

</Lab>

## Attributes you will see

| Attribute | Means |
|---|---|
| `#[derive(Serialize, Debug, Default)]` | generate these traits' code |
| `#[serde(rename_all = "camelCase")]` | an option for serde's generated code |
| `#[tauri::command]` | make this function callable from the page (the Tauri part) |
| `#[cfg(test)]` | compile only for tests |
| `#[cfg(target_os = "macos")]` | compile only on macOS |
| `#[cfg(desktop)]` | compile only for desktop builds, not mobile (set by Tauri) |
| `#[cfg_attr(mobile, tauri::mobile_entry_point)]` | apply an attribute only when a condition holds |
| `#[allow(dead_code)]` | silence a warning, on purpose |

`#[cfg(...)]` removes code from the build entirely when its condition is false, like `import.meta.env.MODE` in the web part. FaNWiT's `lib.rs` uses `#[cfg(desktop)]` around the plugins only desktops have (single instance, global shortcuts, autostart), and its window code uses `#[cfg(target_os = "macos")]` for the macOS title bar.

## You can read FaNWiT's Rust now

Open `src-tauri/src/fanwit/sandbox.rs`. Every construct in it is from this part: a struct with `RwLock` fields and `#[derive(Default)]`, methods returning `Result`, closures and iterators, `format!` messages, `?`, and a test module. That is the goal of Rust basics. Next comes **Tauri**: how this Rust program opens windows, and how the page calls into it.

<Check question="Where do Rust unit tests usually live?" options={["In a separate tests folder only", "In a #[cfg(test)] module at the bottom of the file they test", "In the JavaScript test suite"]} answer={1}>

Unit tests sit with their code and can reach its private functions with `use super::*`. (A `tests/` folder holds integration tests that use the crate from outside.)

</Check>

<Callout kind="learn-more">

The book's [chapter 11, writing automated tests](https://doc.rust-lang.org/book/ch11-00-testing.html), and the reference on [conditional compilation](https://doc.rust-lang.org/reference/conditional-compilation.html).

</Callout>
