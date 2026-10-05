# The Installer Kit: one engine

Tauri can bundle an app as an MSI, an NSIS setup, a `.dmg`, a `.deb` and an `.rpm`. Real apps need more than copying files: add a command to `PATH`, install a prerequisite if it is missing, register a file type, start a service, and undo all of it cleanly. Each package format has its own scripting language for that, and its own way of getting it wrong. This chapter builds `src-tauri/install`, the **engine**: one Rust binary, `fanwit-install`, that every package format calls to do the actual work.

<Callout kind="why">

If the NSIS script, the MSI custom actions, the deb's `postinst` and `install.sh` each implement "add to PATH", that is four implementations to keep correct, and four ways to break an uninstall. The Installer Kit keeps **all** system changes in one engine, described once in `installer.toml`, and the package formats become thin wrappers that call it. The engine can also run against a **simulated** machine, so "what happens on a standard user account with no network?" is a unit test, not a virtual machine.

</Callout>

```tikz caption="One description, one engine, every artefact" alt="installer.toml describes components, options and steps. The fanwit-install engine reads it, checks the machine, builds a plan, applies actions with a journal, and writes a receipt. NSIS, MSI, deb, rpm, install.sh, the Setup app and the app's own first run all call the same engine."
\begin{tikzpicture}[x=1mm,y=1mm,b/.style={fwnode,minimum height=10mm,font=\scriptsize,text width=24mm}]
\node[b,fwuser] (toml) at (0,0) {\texttt{installer.toml}};
\node[b,fwcore,text width=34mm,minimum height=28mm] (eng) at (44,0) {\textbf{fanwit-install}\\[2pt]checks, plan\\journaled actions\\rollback, receipt};
\foreach \t/\y in {NSIS and MSI/16,deb and rpm/8,install.sh/0,Setup app/-8,app first run/-16} \node[b,fwgrey,minimum height=6mm,text width=22mm] (a\y) at (96,\y) {\t};
\draw[fwarrow] (toml) -- (eng);
\foreach \y in {16,8,0,-8,-16} \draw[fwarrow] (a\y.west) -- (eng.east);
\end{tikzpicture}
```

## The description

<Source path="installer.toml" />

`installer.toml` sits at the root of the project, with a schema for your editor (chapter 47):

- **`[installer]`** picks a preset (classic, branded, one click, developer tool, enterprise, portable), the artefacts to build, the scope (per user, per machine, or ask), and the Setup app's pages.
- **`[[component]]`** entries are what the user can choose, such as the app itself (required) and the CLI.
- **`[[option]]`** entries are settings of the install. Each is at once a control on a Setup page, a `--set` flag, an MSI property and an environment variable, so silent and scripted installs take the same options as the wizard.
- **`[[step]]`** entries are what to do. Each has a `type` (`path`, `prereq`, `download`, `run`, `sidecar`, `shortcut`, `service`, `env`, `registry`, `font`, `certificate`, `autostart`, `plist`, or your own `custom` type), a `when` clause on options and components (chapter 7's syntax), `platforms`, and the **phases** it runs in: `package` (during the native install), `firstRun` (the app's first launch), or `update`. A step that cannot run where it is, such as a macOS drag install that runs nothing, is deferred to a later phase.

<Source path="src-tauri/install/src/manifest.rs" />

The manifest parser validates what it can before anything runs: every download must be pinned by a SHA-256, step dependencies (`after`) must not form a cycle, and `when` clauses must parse.

## The machine, real or simulated

<Source path="src-tauri/install/src/system.rs" from="pub trait System" to="}" />

The engine never touches the machine directly. It asks a `System`: which OS, is a program on `PATH`, are we administrator, what is in the registry, can we reach this URL, and to `perform` an action. `Real` implements it for the machine the engine runs on. `Scenario` implements it from a TOML file describing an imaginary machine:

<Source path="installer/scenarios/no-admin.toml" />

<Source path="installer/scenarios/uv-missing.toml" />

`pnpm fw installer plan --os windows --scenario no-admin,offline` plans an install for a Windows standard user with no network, on whatever machine you are using.

<Callout kind="new" title="New here: trait objects, &dyn System">

`Engine::new(manifest, sys: &dyn System, sel)` takes **any** type that implements `System`, chosen at run time. `&dyn System` is a **trait object**: a pointer to the value plus a table of its methods, so the engine calls `sys.admin()` without knowing whether a real machine or a scenario answers. Generics (`<S: System>`) would also work, but would compile a separate engine for each, and the Setup app switches between real and simulated at run time. [The Rust Book: trait objects](https://doc.rust-lang.org/book/ch18-02-trait-objects.html)

</Callout>

## Actions: every change, undoable

<Source path="src-tauri/install/src/system.rs" from="pub enum Action" to="}" />

Every change the engine makes is one `Action`: copy, download (with a SHA-256), extract, run a command, remove, symlink, add or remove a `PATH` entry, write a file, set or delete a registry value, set an environment variable. Step types compile down to these (`steps.rs`), so a shortcut, a service or a font gets journaling, rollback, receipts and elevation for free.

Actions record what they replaced: `WriteFile` keeps the previous content, and `RegSet` the previous value, or the fact that it created the key. Undo therefore **restores** what was there before, instead of deleting it. An uninstall never removes a `PATH` entry or a registry value that existed before the install.

<Source path="src-tauri/install/src/steps.rs" />

## Plan, then apply

<Source path="src-tauri/install/src/engine.rs" from="pub enum Status" to="}" />

`plan` checks each step without changing anything. A prerequisite already installed and recent enough is **Satisfied** (and marked "not ours", so uninstall leaves it alone). A missing one is **Missing**, an old one **Outdated**, one that has to wait for a later phase **Deferred**, and one that cannot happen here (no download for this OS, no sidecar bundled) **Blocked**. The plan also totals download size, disk space, network use, and whether elevation or a reboot will be needed, which is what the Setup app's summary page shows before you click Install.

<Source path="src-tauri/install/src/engine.rs" from="    pub fn run(&mut self, phase: &str" until="                match self.run_elevated_batch" />

`run` applies the plan step by step:

- **Journal first.** Each action is written to a journal before it is performed. If the process is killed halfway, the journal says exactly what to undo.
- **Rollback on failure.** If a step fails, or the user cancels, every action of this session is undone in reverse order, and the machine is as it was.
- **One elevation prompt.** When a step needs administrator rights and the engine is not elevated, it collects that step and every later elevated step whose dependencies are met into one batch, and runs it in one elevated helper (`elevate.rs`). The user sees one prompt (UAC on Windows, `pkexec` or `sudo` elsewhere), not one per step.
- **Receipt.** On success, a receipt records the version, scope, components, options and every step with its actions and whether it is "ours". Repair and update read it to keep your choices. Uninstall reads it to undo exactly what this install did.

Exit codes follow Windows Installer's conventions on every OS: 0 success, 1602 cancelled, 1603 fatal, 3010 reboot needed. Package managers and deployment tools already understand them.

<Source path="src-tauri/install/src/engine.rs" />

<Source path="src-tauri/install/src/elevate.rs" />

## Choices: defaults, receipt, answers, flags

<Source path="src-tauri/install/src/lib.rs" from="pub fn selection(" to="}" />

What gets installed is decided in layers: the manifest's defaults, then the previous install's receipt (so a repair keeps your choices), then an **answer file** (for unattended installs across many machines), then command line flags. An unknown option or component is an error, not ignored, so a typo in a deployment script fails loudly instead of installing the wrong thing.

## The command line

<Source path="src-tauri/install/src/cli.rs" />

`fanwit-install plan`, `run --phase`, `uninstall [--purge]` and `receipt` are what the package formats call, and what you can run yourself. `custom.rs` lets an app add its own step types in Rust, and `fw installer add-step <type> <id>` writes one.

<Source path="src-tauri/install/src/custom.rs" />

## Checkpoint

<Source path="src-tauri/install/src/tests.rs" />

```sh
cargo test --manifest-path src-tauri/install/Cargo.toml
pnpm fw installer plan --os windows --scenario no-admin
```

The engine's tests run on simulated machines: an existing prerequisite is used and not uninstalled, an outdated one is replaced, an offline machine defers a download to first run, a failure rolls back in reverse order, and uninstall reverses only what this install did. CI also runs real installs and uninstalls on Windows, macOS and three Linux distributions (`installer.yml`, chapter 49).

<Check question="Your installer adds a folder to PATH. The user already had that folder on PATH before installing. What does uninstall do?" options={["Removes it from PATH", "Leaves it: the step was Satisfied at install time, so the receipt marks it as not ours", "Asks the user"]} answer={1}>

At install time the plan found the folder already on `PATH`, so the step was Satisfied and recorded as not ours, with no actions. Uninstall reverses only actions this install performed, so the user's own `PATH` entry stays.

</Check>
