---
title: Operations
section: Operations
order: 1
summary: Building, releasing, updating, signing and deploying, including the docs site.
---
# Operations

From a working app to something users install. Every step here runs from `fw` or the release workflow, so a release is repeatable, not a checklist someone remembers.

<Callout kind="why">

Releases fail on the steps people do by hand: a version bumped in one file but not another, a changelog written from memory, a signing step skipped. `fw release` and the workflows make the release one command and a tag, and the same steps run every time.

</Callout>

## Building

`pnpm fw build --all` builds the desktop installers and the static web build (`build/`).

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
