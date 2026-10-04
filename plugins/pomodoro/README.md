# Pomodoro

A focus timer in the sidebar. It shows how a plugin can draw UI without touching the main thread.

- The timer runs in the plugin's worker.
- The worker sends a widget tree with `ctx.ui.render("pomodoro.panel", tree)`.
- The app draws that tree with its own buttons, progress bar and select, so it follows the theme and works from the keyboard.
- Clicks come back to the plugin through `ctx.ui.on`.

Open it from the view picker (Pomodoro), or run **Start or pause the focus timer**.
