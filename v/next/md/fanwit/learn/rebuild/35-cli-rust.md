# The command line, from Rust

Chapter 24 built `runCli`, which turns `notes rename-file a.md --to b.md` into a command run inside the app. This chapter builds the path a terminal takes to get there: launch flags, the single instance rule, a local socket, and `fanwit-cli`, the console program you actually type.

<Callout kind="why">

A desktop app's main binary is a poor command line tool. On Windows it is built for the GUI subsystem, so it cannot print to the terminal at all. Starting a second copy for every command would also mean booting a whole app, and another process fighting over the same vault. So the running app does the work, and a small separate binary only carries the request there and prints the answer. The result is identical whether the app was already open or not.

</Callout>

## Launch flags

<Source path="src-tauri/src/fanwit/cli.rs" from="impl LaunchArgs" to="}" />

These flags are read first, in `run()` (chapter 31), because they shape everything after them:

- `--profile <name>` separates the config and data folders (chapter 31);
- `--headless` starts in the tray without a window (autostart uses it);
- `--safe-mode` starts without plugins;
- `--set key=value` overrides a setting for this run (chapter 16's `cli` layer);
- `--devtools` enables developer tools in a release build;
- anything else not starting with `--` is a file, a folder, or a `fanwit://` link to open.

Unknown flags are ignored rather than mistaken for paths, so a flag added in a newer version does not open a vault called `--new-thing`.

<Callout kind="new" title="New here: peekable iterators, split_once and match guards on strings">

`argv.iter().skip(1).peekable()` makes an iterator you can also advance by hand. Inside the loop, `it.next()` takes the **value** after `--set` or `--profile`.

`"ui.zoom=110".split_once('=')` returns `Some(("ui.zoom", "110"))`, splitting only at the first `=`, so values may contain `=` themselves.

`s if s.starts_with("--set=") => ...` is a match arm with a guard on a string. The arms are tried in order, so the plain `"--set"` arm wins before it, and the catch-all `s if s.starts_with("--")` swallows unknown flags before the final arm takes paths.

</Callout>

## One instance

Launching the app while it is already running must not start a second copy. The single instance plugin (first in `run()`, chapter 31) notices the second launch, hands its arguments to the first, and exits:

<Source path="src-tauri/src/fanwit/cli.rs" from="pub fn on_second_instance" to="}" />

Relative paths are resolved against the **second** launch's working directory (where you typed the command), remembered as user chosen for the sandbox (chapter 32), and sent to the main window as `fw://open-paths`. The main window brings itself forward and runs `app.openPaths` (chapter 25). Double clicking a file associated with the app takes the same route.

## The socket

<Source path="src-tauri/src/fanwit/cli.rs" from="pub fn start_server" to="}" />

At setup, the app listens on a **local socket**: a named pipe on Windows, an abstract socket on Linux, a socket file in the temp folder on macOS. The `interprocess` crate hides the differences. The name comes from the bundle identifier, so two FaNWiT based apps never answer each other's terminals. Each connection gets its own thread.

<Source path="src-tauri/src/fanwit/cli.rs" from="fn serve<R: Runtime>" to="}" />

The protocol is **one JSON object per line**, which is easy to write, read and debug:

- `ping`, `focus` and `quit` are answered by Rust directly.
- `run` waits (up to 20 seconds) for the main window's kernel to report ready with `fw_cli_ready`. A headless start takes a moment to boot. Paths in the arguments are remembered as user chosen, and the request goes to the main window as `fw://cli` with a new id.
- The main window's `runCli` (chapter 24) streams messages back through `fw_cli_send(id, message)`: `progress` while a long command runs, then `done` with the output and exit code. Rust forwards each one to the socket until it sees `done`.

<Callout kind="new" title="New here: mpsc channels">

`let (tx, rx) = channel::<String>();` creates a **channel**: `tx` sends values, and `rx` receives them in order on another thread. (`mpsc` means multiple producer, single consumer.) The socket thread stores `tx` under the request id and then loops over `rx`, blocking until messages arrive. `fw_cli_send` runs on a Tauri command thread, finds `tx` by id and sends. The two threads never share anything else, and the loop ends when `done` arrives or the sender is dropped. [The Rust Book: channels](https://doc.rust-lang.org/book/ch16-02-message-passing.html)

`r#"{"type":"pong"}"#` is a **raw string**: backslashes and quotes inside are literal, so JSON can be written without escaping.

</Callout>

<Source path="src-tauri/src/fanwit/cli.rs" />

## The console binary

<Source path="src-tauri/src/bin/fanwit-cli.rs" />

`fanwit-cli` is a separate binary in the same crate (`src-tauri/src/bin/`), built for the console subsystem, so it can print. It decides what to do from its arguments:

- **`--version`** answers on its own.
- **Nothing, or only paths:** start the GUI with them. The single instance rule forwards them to a running app, so `fanwit-cli ~/notes` opens a folder.
- **A command:** connect to the socket. If nothing is listening, start the app with `--headless`, wait up to 30 seconds for the socket, run the command, then send `quit` so the app it started does not linger in the tray.

While the command runs, `progress` messages redraw one line on stderr (`\r` returns to the start of the line, and `\x1b[K` clears the rest). Output goes to stdout, so `fanwit-cli commands list --json | jq` works, and the exit code is the one `runCli` chose (chapter 24): 0 for success, 2 for bad arguments, 4 for an unknown command, 5 for a denied one.

<Callout kind="new" title="New here: ExitCode, env! and IsTerminal">

`fn main() -> ExitCode` returns the process exit code instead of calling `std::process::exit`, which would skip destructors (such as flushing stdout).

`env!("FW_IDENTIFIER")` reads an environment variable at **compile time**. `build.rs` sets it from `tauri.conf.json` (chapter 31), so the client always looks for the socket of the app it was built with.

`std::io::stdin().is_terminal()` asks whether a person is typing or another program is piping input. The request records it (`tty`, `noInput`) and passes it to the app. Today `runCli` never prompts in any case, but the information is there for a future interactive mode.

</Callout>

## Checkpoint

<Source path="src-tauri/src/fanwit/cli.rs" from="#[cfg(test)]" />

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib cli::
cargo build --manifest-path src-tauri/Cargo.toml --bin fanwit-cli
./src-tauri/target/debug/fanwit-cli commands list
./src-tauri/target/debug/fanwit-cli theme set-mode --mode dark
```

With the app closed, the second command starts it headless, runs, and quits it again. With the app open, the theme changes in front of you.

<Check question="A script runs fanwit-cli vault backup in a CI job, with no terminal attached. A command needs an argument it was not given. What happens?" options={["The app opens the palette and waits for an answer", "runCli runs every CLI command with interactive: false, so it fails at once with a missing argument error and exit code 2", "The command runs with the argument undefined"]} answer={1}>

Commands from the CLI always run with `interactive: false` (chapter 24), so the pipeline never opens a prompt nobody would see. A missing required argument fails at once with exit code 2, which the CI job can check.

</Check>
