# Building and shipping

The last step of the foundations: turning the project into something you can give to people. You will not need every detail now, but knowing what the build makes explains a few folders and settings you have already seen.

<Callout kind="why">

A user downloads one file and double clicks it. Everything else, the Rust program, the built web pages, icons, helper programs, an uninstaller, the file associations and the `fanwit://` link scheme, has to be inside it and set up correctly on Windows, macOS and Linux. Tauri's bundler does the standard part; FaNWiT's Installer Kit adds what a real app needs on top (prerequisites, repair, update).

</Callout>

## dev and build

| Command | What happens |
|---|---|
| `pnpm tauri dev` | runs `pnpm dev`, compiles the Rust side in debug mode, opens the app on the dev server. Rust changes restart the app; web changes update in place. |
| `pnpm tauri build` | runs `pnpm build`, compiles Rust in release mode (optimised, slower to build), and **bundles**: the executable with the web files embedded, plus installers for your system (`.msi`/`.exe` on Windows, `.dmg`/`.app` on macOS, `.deb`/`.AppImage`/`.rpm` on Linux). |

The output is in `src-tauri/target/release/bundle/`. Release builds are much faster than debug builds, so measure performance there.

The `bundle` section of `tauri.conf.json` sets icons, the identifier (`com.<you>.<app>`, which must be unique and stable: it names the app's data folders) and per-platform options. `pnpm fw rename` changes the app name and identifier everywhere at once.

## Programs that ship inside the app

**Sidecars** are extra programs that ship with the app. Tauri can bundle them (`bundle.externalBin`, with one file per target platform, like the installer helper in `src-tauri/binaries/fanwit-install-x86_64-pc-windows-msvc.exe` that the Installer Kit adds). FaNWiT's native plugins are sidecars named `fanwit-plugin-<id>` next to the app's executable (`src-tauri/src/fanwit/sidecar.rs`), and it only ever runs them by id, never by a path from the page (the security chapter).

FaNWiT also builds a second Rust program from the same crate: `src-tauri/src/bin/fanwit-cli.rs`, the command line companion. `fanwit-cli notes.save` connects to the running app through a local socket and runs a command there, the same command the palette would run.

## Testing the Rust side

`cargo test --manifest-path src-tauri/Cargo.toml --workspace` runs the Rust tests of the app and of the crates beside it (`packages/toml-merge`, the installer). CI runs it on every push, with the web tests and `pnpm check`.

## Where to go from here

You have finished the foundations: the web, Svelte and SvelteKit, Rust and Tauri. Next, **Rebuild FaNWiT** puts them together: starting from an empty folder, you build a smaller FaNWiT step by step, a host seam, a kernel, commands, a palette, layouts, settings, a sandboxed file system, each step working before the next.

<Lab id="tauri-6-lab" title="Build an installer">

On your own machine:

<Steps>

1. Run `pnpm tauri build`. It takes a while the first time (a release build of every crate).
2. Open `src-tauri/target/release/bundle/` and install the result.
3. Start the installed app from your start menu or applications folder, not from the terminal. Find its config folder, named after the identifier in `tauri.conf.json`: `%APPDATA%\<identifier>` on Windows, `~/Library/Application Support/<identifier>` on macOS, `~/.config/<identifier>` on Linux. Your `settings.toml` is there.
4. Uninstall it again, and check that your settings folder stays (uninstalling never deletes user data).

</Steps>

</Lab>

<Check question="Why must the identifier in tauri.conf.json never change after release?" options={["It is part of the license", "The app's config and data folders are named after it: changing it makes the app forget everything", "Tauri refuses to build"]} answer={1}>

The identifier names where the operating system keeps the app's files. A new identifier is, to the OS, a new app with empty settings.

</Check>

<Callout kind="learn-more">

Tauri's guides to [distributing](https://v2.tauri.app/distribute/), [embedding external binaries](https://v2.tauri.app/develop/sidecar/) and [the configuration file](https://v2.tauri.app/reference/config/). FaNWiT's [Installer Kit](manual://fanwit/guides/installer) builds on the bundler.

</Callout>
