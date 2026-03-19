<p align="center">
  <img src="desktop/src/assets/claw-quest-title.png" alt="Claw Quest" width="420">
</p>

<p align="center">
  <a href="https://github.com/sandrokitchener/ClawQuest/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/sandrokitchener/ClawQuest/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center"><em>Send adventurers on quests with magical equipment called skills. Claw Quest is a desktop front end for OpenClaw that turns skill management into a little RPG loadout screen instead of a pile of shell commands.</em></p>

![Claw Quest adventurer and loadout detail](Screenshot%202026-03-19%20120742.png)

## What this is

Claw Quest is a Windows-first desktop companion for OpenClaw. It auto-detects an OpenClaw workspace, shows installed skills as equipment around a character, lets you browse and drag in new skills from ClawHub, and sends prompts back through OpenClaw from the same screen.

The point is not to replace OpenClaw. The point is to sit beside it and make a few common tasks feel much better:

- browse what is installed
- search the registry and install or remove skills
- see rough security state for installed skills
- send a prompt to your agent without leaving the app

This repository still contains the original ClawHub registry and web app as well. Claw Quest is the desktop layer on top of that existing codebase.

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

To build a release executable instead:

```bash
bun run desktop:build
```

You will need Bun and a working Rust toolchain. Desktop-specific setup notes live in [`desktop/README.md`](desktop/README.md).

## Releases and source

The repo should contain the source, assets, docs, and lockfiles needed to recreate the app. Built `.exe`, `.msi`, installer bundles, and `desktop/src-tauri/target/` should stay out of git and be published through GitHub Releases or another download host instead.

## Attributions

Credits for bundled fonts, sound tools, and other third-party materials live in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

## Roadmap

Claw Quest starts with OpenClaw, but the longer-term plan is to let the same desktop shell work with other agent managers too. The first targets are `RustClaw`, `TinyClaw`, and `ZeroClaw`.

## More docs

- [`desktop/README.md`](desktop/README.md)
- [`docs/README.md`](docs/README.md)
- [`docs/quickstart.md`](docs/quickstart.md)
- [`docs/cli.md`](docs/cli.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
