<p align="center">
  <img src="desktop/src/assets/claw-quest-title.png" alt="Claw Quest" width="420">
</p>

<p align="center">
  <a href="https://github.com/sandrokitchener/ClawQuest/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/sandrokitchener/ClawQuest/ci.yml?branch=main&style=for-the-badge&label=Desktop%20CI" alt="Desktop CI"></a>
  <a href="https://github.com/sandrokitchener/ClawQuest/blob/main/desktop/package.json"><img src="https://img.shields.io/github/package-json/v/sandrokitchener/ClawQuest?filename=desktop%2Fpackage.json&style=for-the-badge&label=Desktop%20Version" alt="Desktop Version"></a>
  <a href="https://github.com/sandrokitchener/ClawQuest/stargazers"><img src="https://img.shields.io/github/stars/sandrokitchener/ClawQuest?style=for-the-badge" alt="GitHub Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center"><em>Send adventurers on quests with magical equipment called skills. Claw Quest is a desktop front end for OpenClaw that turns skill management into a little RPG loadout screen instead of a pile of shell commands.</em></p>

![Claw Quest desktop window](docs/screenshots/claw-quest-window.png)

## Desktop-first repo

Claw Quest is a Windows-first desktop companion for OpenClaw. It auto-detects an OpenClaw workspace, shows installed skills as equipment around a character, lets you browse and install skills from ClawHub, and sends prompts back through OpenClaw from the same screen.

This repository still contains the supporting ClawHub and registry code that the desktop app talks to, but the primary product in this repo right now is the Tauri desktop app in [`desktop/`](desktop/).

The point is not to replace OpenClaw. The point is to sit beside it and make a few common tasks feel better:

- browse what is installed
- search the registry and install or remove skills
- see rough security state for installed skills
- send a prompt to your agent without leaving the app

## Current scope

Right now Claw Quest is aimed at people who already use OpenClaw and want a desktop manager for it. The app works best when the Gateway is already running and the OpenClaw workspace is reachable from the host machine. Local OpenClaw installs are the smoothest path, but the app can also be pointed at a remote Gateway or a Docker-based setup.

Skill install and remove are still host-filesystem operations, so Docker users should bind-mount the same workspace and skills directory that the app can see.

## Prerequisites

Before you try to build Claw Quest, you should have:

- [Bun](https://bun.sh/)
- a working Rust toolchain with Cargo
- the Windows build prerequisites needed by Tauri
- an OpenClaw setup the app can talk to, whether that is a local install, a reachable Gateway, or a Docker container with a shared workspace

## Quick start

From the repo root:

```bash
bun install
bun run desktop:dev
```

This launches the Tauri desktop app in development mode.

## Build the desktop app

From the repo root:

```bash
bun run desktop:build
```

That runs a full Tauri production build. If you only want the direct Windows executable without installer bundles:

```bash
cd desktop
bunx tauri build --no-bundle
```

The direct executable ends up at:

```text
desktop\src-tauri\target\release\claw-quest.exe
```

## Useful commands

From the repo root:

```bash
bun run desktop:ui:dev
bun run desktop:ui:build
bun run desktop:check
```

- `desktop:ui:dev` runs the Vite UI only
- `desktop:ui:build` builds the desktop frontend only
- `desktop:check` runs the desktop TypeScript and Rust checks

Desktop-specific setup and connection-mode notes live in [`desktop/README.md`](desktop/README.md).

## Build details

The README badges above are live repo signals:

- `Desktop CI` tracks the Windows GitHub Actions build for the Tauri app
- `Desktop Version` is pulled from `desktop/package.json`
- `GitHub Stars` shows how many people have starred the repo

The desktop executable path and the local build commands above are still the source of truth if you are building from source.

## Releases and source

The repo should contain the source, assets, docs, and lockfiles needed to recreate the app. Built `.exe`, `.msi`, installer bundles, and `desktop/src-tauri/target/` should stay out of git and be published through GitHub Releases or another download host instead.

## Attributions

Credits for bundled fonts, sound tools, and other third-party materials live in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=sandrokitchener/ClawQuest&type=date&legend=top-left)](https://www.star-history.com/#sandrokitchener/ClawQuest&type=Date)

## More docs

- [`desktop/README.md`](desktop/README.md)
- [`docs/README.md`](docs/README.md)
- [`docs/quickstart.md`](docs/quickstart.md)
- [`docs/cli.md`](docs/cli.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
