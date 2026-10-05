# Notifications

One API, many surfaces: toasts, OS notifications, the notification centre, banners, status items, badges, taskbar progress and window attention.

<Callout kind="why">

If each feature decides for itself whether to show a toast or an OS notification, the user gets toasts while away from the app and OS banners while working in it. With one API, your code says *what* happened and how important it is. A routing policy decides *where* it appears, based on whether the window has focus, Do not disturb, and the user's per channel choices. The policy lives in one place, so it can respect the user everywhere.

</Callout>

## Sending

```ts
ctx.notify.send({ title: "Export finished", body: "**report.pdf** saved", kind: "success" });
ctx.notify.toast("Copied");                                    // just a toast
const p = ctx.notify.progress({ title: "Indexing", cancellable: true });
ctx.notify.error(e);                                           // a FanwitError's hint and "Open docs"
```

```fanwit-run
notify.send {"title": "Hello from the manual", "kind": "success"}
```

## Where it goes

With the default route (`auto`):

| Situation | Toast | OS notification | Centre |
|---|---|---|---|
| Do not disturb is on | no | only `urgent` priority | yes |
| The window has focus | yes | no | warnings and errors |
| The app is in the background | no | yes (high priority also asks for attention) | yes |

Set `route` to `toast`, `os`, `center` or `toast+os` to choose yourself. Warnings and errors always stay in the centre, so they can't be missed.

## Channels

Each notification belongs to a channel (`default`, `system`, `jobs`, or one your module contributes in `notificationChannels`). Users can turn toasts, OS notifications and sounds on or off per channel, and set a minimum priority. A channel per kind of message lets users silence one feature without missing the others.

<Callout kind="under-the-hood">

`send` resolves the channel and priority first; a disabled channel or a priority below its minimum stops there. It then applies the route, and finally the channel's toast and OS switches. Repeats of the same error are merged rather than stacked. The centre keeps 30 days of history.

</Callout>

## Pitfalls

- **Toasts for errors.** A toast disappears. Use `ctx.notify.error(e)`: it keeps the error in the centre with its hint and a docs link.
- **One channel for everything.** Users can only silence what you separate.
- **Progress without cancel.** If the work can stop, pass `cancellable: true` and watch for the cancel.
