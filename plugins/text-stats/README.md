# Text Stats

Reading ease (Flesch), sentences and syllables for the note you are editing, shown in the status bar. **Show reading ease** gives the details.

The plugin is written in Rust (`wasm/src/lib.rs`) with the `fanwit-plugin` crate and compiled to WebAssembly (`plugin.wasm`). It runs inside a Web Worker, so even long notes are analysed off the main thread. It starts on the first `notes:changed` event, not when the app starts.

Rebuild it after changing the Rust code:

```sh
pnpm fw plugin build text-stats
```

You need the `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`.
