# Operations

From a working app to something users install. Every step here runs from `fw` or the release workflow, so a release is repeatable, not a checklist someone remembers.

<Callout kind="why">

Releases fail on the steps people do by hand: a version bumped in one file but not another, a changelog written from memory, a signing step skipped. `fw release` and the workflows make the release one command and a tag, and the same steps run every time.

</Callout>

## Building

`pnpm fw build --all` builds the desktop installers and the static web build (`build/`).

## Performance budgets

| Operation | Budget | Measure |
|---|---|---|
| Module activation | 50 ms | `fw:module.activate` |
| Key press to command | 4 ms | `fw:keys.dispatch` |
| Context menu resolve | 16 ms | `fw:menus.resolve` |
| Load to a usable window | 4 s | `e2e/budgets.test.ts` |
| JavaScript loaded at startup | 4.5 MB | `e2e/budgets.test.ts` |

The first three are User Timing measures (`src/fanwit/kernel/budget.ts`), so they show in the DevTools Performance panel, and anything over budget is logged. `e2e/budgets.test.ts` runs in CI with every e2e run and fails when a median goes over; its report lists the medians and worst cases. Change a number in `BUDGETS` or the test, not in the code that is measured.

## Releasing

`pnpm fw release minor` bumps the version everywhere, writes the changelog from conventional commits and tags. Pushing the tag runs the release workflow, which builds the installers for each OS and drafts a GitHub release with the changelog.

## Updates

Add `tauri-plugin-updater` with your public key and endpoints in `tauri.conf.json`; the Update window explains the flow.

## Signing

Windows: Authenticode or Azure Trusted Signing. macOS: Developer ID and notarisation through the release workflow secrets.

## Web deployment

The web build is a static SPA with a fallback page; host it anywhere. The `web` workflow deploys it to GitHub Pages.

## The docs site

The same workflow publishes the documentation under `/docs`: `next` on every push to main, and each release on its tag, with earlier versions kept. To build it yourself:

```sh
pnpm fw docs build --version 1.2.0 --base /my-app/docs/v/1.2.0
pnpm fw docs publish site --version 1.2.0   # adds it to a multi version folder
```

See [Manual and docs](manual://fanwit/guides/manual#versions-and-publishing) for what users see.
