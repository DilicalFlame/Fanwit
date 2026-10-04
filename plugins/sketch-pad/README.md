# Sketch Pad

A drawing canvas written as an ordinary web page (`ui.html`, `ui.css` and `ui.js`). It shows the iframe kind of plugin UI:

- The page runs in a sandboxed frame from another origin. It cannot reach the app, the file system or the network.
- `<script src="_fw/ui.js">` gives the page `window.fanwit`, the same permission-checked ctx that a worker gets.
- The app's theme reaches the page as CSS variables (`--background`, `--primary` and so on).
- Strokes are saved with `fanwit.storage`, and the worker half (`main.js`) owns the **Clear the sketch** command.

You can use any framework. Build it to plain files next to `plugin.toml`.
