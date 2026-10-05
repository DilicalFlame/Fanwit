# Labs

Labs let you try every system interactively and copy the code.

<Callout kind="why">

Reading about a focus policy or a menu kind is slower than trying it. Each lab is a working bench for one system, with every option exposed and the matching code or TOML to copy. You can find out what an option does before writing anything. Labs are core, but `pnpm fw strip` turns them off (`features.labs` in `app.config.ts`) when your app no longer needs them.

</Callout>

## layoutLab

Edit `workspace.toml` on the left and watch the layout and the action log.

## windowLab

Child, panel and sheet windows with every focus policy and blocked feedback.

## menuLab

The canvas selection menu with colour swatches, a slider with live preview and an icon row.

## notificationLab

Every route and kind, progress with cancellation, dedupe.

## componentGallery

shadcn-svelte and workbench components in the active theme.

## dbExplorer

Tables per scope and a query editor; read only unless developer mode.

## commandLab

Any command with a generated form and its CLI equivalent.

## installerLab

Edit `installer.toml`, switch presets, toggle simulated machines (the scenarios in `installer/scenarios`) and read the plan per OS, scope and phase. The Generated glue tab shows the NSIS, WiX, deb, rpm and pkg files that `fw installer build` wrote. Nothing on this computer changes. See [the Installer Kit](manual://guides/installer).
