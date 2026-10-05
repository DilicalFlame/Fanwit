# Threads, locks and async

Several windows call into the Rust side at the same time, a file watcher reports changes in the background, and a slow database query must not freeze everything else. FaNWiT's Rust side is therefore **concurrent**: several things run at once. Rust's ownership rules extend to this, and catch at compile time the bug that haunts concurrent programs in other languages: two threads changing the same data at once.

<Callout kind="why">

All of FaNWiT's shared data lives in one struct, `State` (in `src-tauri/src/fanwit/mod.rs`), which Tauri hands to every command. Commands may run on different threads at the same moment, so every field that changes is wrapped in a lock: `Mutex`, `RwLock` or an atomic. The compiler will not let you share a plain `Vec` between threads; you have to choose one of these, and the choice is visible in the type.

</Callout>

## Threads

<Playground mode="rust" id="rust-8-threads" title="Threads" height={270}>

```rust
use std::thread;
use std::time::Duration;

fn main() {
    let watcher = thread::spawn(|| {
        for i in 1..=3 {
            println!("watcher: change {i}");
            thread::sleep(Duration::from_millis(10));
        }
        "watcher done"
    });

    println!("main keeps working");
    let result = watcher.join().unwrap();   // wait for the thread, take its result
    println!("{result}");
}
```

</Playground>

`thread::spawn` runs a closure on a new thread. The closure must own what it uses (`move`), because the thread may outlive the function that started it. FaNWiT spawns threads for its file watchers, its sidecar processes and the CLI bridge.

## Sharing: Arc and Mutex

To share one value between threads you need two things: **Arc** (shared ownership: the value lives until the last owner is gone) and a lock to change it safely. A **Mutex** lets one thread at a time in; `lock()` waits for its turn and gives a guard, and the lock is released when the guard is dropped.

<Playground mode="rust" id="rust-8-mutex" title="Arc and Mutex" height={320}>

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let open_files = Arc::new(Mutex::new(Vec::<String>::new()));

    let mut handles = Vec::new();
    for w in ["main", "settings", "manual"] {
        let files = Arc::clone(&open_files);         // another owner for the thread
        handles.push(thread::spawn(move || {
            let mut list = files.lock().unwrap();    // one thread at a time
            list.push(format!("{w}.toml"));
        }));                                          // guard dropped: unlocked
    }
    for h in handles { h.join().unwrap(); }

    let mut list = open_files.lock().unwrap().clone();
    list.sort();
    println!("{list:?}");
}
```

</Playground>

Remove the `Mutex` (use `Arc<Vec<String>>`) and try to push: it does not compile, because an `Arc` alone only allows reading. That is the compiler stopping a data race.

FaNWiT's variants, all inside `State`:

| Type | Use | In FaNWiT |
|---|---|---|
| `Mutex<T>` | one reader or writer at a time | open databases, file watchers, pending paths |
| `RwLock<T>` | many readers at once, or one writer | the sandbox's allowed folders: read on every file call, written rarely |
| `AtomicU32` | a number changed without a lock | the next watcher id (`next.fetch_add(1, Ordering::Relaxed)`) |

Tauri wraps `State` itself in what it needs to share it with every command, which is why FaNWiT's `State` has no `Arc` of its own.

## async: waiting without blocking

A thread that waits for a slow query does nothing useful. **async** functions can pause at `.await` and let the thread run other work meanwhile, like JavaScript's async functions. Tauri runs `async` commands on a pool of threads; FaNWiT's database commands are async and move the actual SQLite work to a thread meant for blocking work:

```rust
#[tauri::command]
pub async fn fw_db_query(state: tauri::State<'_, State>, handle: u32, sql: String, /* ... */) -> Result<Vec<Map<String, Value>>> {
    let c = conn(&state, handle)?;
    tauri::async_runtime::spawn_blocking(move || {
        let c = c.lock().unwrap();
        // ... run the query, collect rows ...
    })
    .await
    .map_err(err)?
}
```

Read it with what you know: an async command, a `Mutex`-guarded connection, a `move` closure on a blocking thread, `.await` for its result, and `map_err(err)?` for the error. Nothing here is new any more.

<Callout kind="tip" title="Coming from JavaScript">

JavaScript has one thread per page, so two pieces of your code never run at the same instant and you never need locks. Rust programs often use many threads; `Mutex` is the price, and the compiler makes sure you pay it everywhere you must. `async`/`.await` mean the same thing in both languages.

</Callout>

<Lab id="rust-8-lab" title="A safe counter" expect="4 windows opened">

Four threads each open one window. Make `opened` an `Arc<Mutex<u32>>` (or an `Arc<AtomicU32>`) so the program compiles and prints the goal.

<Playground mode="rust" id="rust-8-lab" title="Counter" height={280}>

```rust
use std::thread;

fn main() {
    let mut opened = 0;
    let mut handles = Vec::new();
    for _ in 0..4 {
        handles.push(thread::spawn(move || {
            opened += 1;
        }));
    }
    for h in handles { h.join().unwrap(); }
    println!("{opened} windows opened");
}
```

</Playground>

<details>
<summary>Show a solution</summary>

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let opened = Arc::new(Mutex::new(0));
    let mut handles = Vec::new();
    for _ in 0..4 {
        let opened = Arc::clone(&opened);
        handles.push(thread::spawn(move || {
            *opened.lock().unwrap() += 1;
        }));
    }
    for h in handles { h.join().unwrap(); }
    println!("{} windows opened", opened.lock().unwrap());
}
```

The original compiles but prints 0: each thread got its own copy of the number. Sharing needs an `Arc`, and changing a shared value needs a lock.

</details>

</Lab>

<Callout kind="learn-more">

The book's [chapter 16, fearless concurrency](https://doc.rust-lang.org/book/ch16-00-concurrency.html) and [chapter 17, async and await](https://doc.rust-lang.org/book/ch17-00-async-await.html).

</Callout>
