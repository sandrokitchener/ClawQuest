<p align="center">
  <img src="desktop/src/assets/claw-quest-title.png" alt="Claw Quest" width="420">
</p>

<p align="center">
  <a href="https://github.com/sandrokitchener/ClawQuest/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/sandrokitchener/ClawQuest/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center"><em>Send adventurers on quests with magical equipment called skills. Claw Quest turns an OpenClaw agent into a little pixel hero, lets you outfit that hero with installed skills, and gives the whole workflow the feeling of a fantasy armory instead of a terminal full of incantations.</em></p>

## Claw Quest

Claw Quest is a desktop companion for OpenClaw built with Bun, React, Vite, Tauri, and Rust. It watches your skill loadout, lets you browse and install skills through a game-like market, and sends quest prompts back through OpenClaw from the same screen. The goal is simple: make managing an agent feel playful without hiding the real tools underneath.

This repository also still contains the original ClawHub registry and web app. The desktop layer sits on top of that work rather than replacing it, so the repo now carries both the fantasy-themed desktop manager and the underlying registry code.

## Run it locally

From the repo root:

```bash
bun install
bun run desktop:dev
```

To build a desktop release instead:

```bash
bun run desktop:build
```

You will need Bun and a working Rust toolchain. The desktop-specific setup notes live in [`desktop/README.md`](desktop/README.md).

## Screenshots

![Claw Quest full window](docs/screenshots/claw-quest-window.png)

![Claw Quest adventurer and loadout detail](docs/screenshots/claw-quest-adventurer.png)

## Shipping it

The repo should contain the source, docs, assets, and lockfiles needed to recreate the app from source. Built `.exe`, `.msi`, installer bundles, and `desktop/src-tauri/target/` should stay out of git and be published through GitHub Releases or another download host instead.

## Attributions

Credits for bundled fonts, sound tools, and other third-party materials live in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).

## Roadmap

Claw Quest starts with OpenClaw, but the long-term plan is to let the same desktop shell work with other agent managers too. The first targets are `RustClaw`, `TinyClaw`, and `ZeroClaw`.

## ClawHub and docs

If you are here for the original registry and web app, the rest of the repo is still intact:

- [`desktop/README.md`](desktop/README.md)
- [`docs/README.md`](docs/README.md)
- [`docs/quickstart.md`](docs/quickstart.md)
- [`docs/cli.md`](docs/cli.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
