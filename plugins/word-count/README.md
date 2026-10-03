# Word Count

Shows the number of words and the reading time of the active note in the status bar.

This plugin runs in a **Web Worker** (`isolation = "worker"`): it cannot touch the page or call
the backend directly. Every call it makes is checked against the permissions in `plugin.toml`:
`vault.read` (to read the note) and `statusbar` (to show its item).
