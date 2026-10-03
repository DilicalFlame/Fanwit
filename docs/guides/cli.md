---
title: Command line
section: Guides
order: 14
---
# Command line

The app binary exposes commands marked `cli: true`:

```
fanwit-cli hello greet --name Asha --json
fanwit-cli layout open-view --view fanwit.logs --region panel
fanwit-cli commands list
fanwit-cli completions bash
```

The client talks to the running app over a local socket and starts it headless when needed. Exit codes: 0 success, 1 failed, 2 usage, 3 disabled, 4 unknown, 5 permission denied, 130 cancelled.

Deep links `fanwit://run/<command>?arg=value` reach only commands marked `uri: true`, and commands with `confirm` always ask.
