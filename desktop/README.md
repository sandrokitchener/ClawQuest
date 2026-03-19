<p align="center">
  <img src="src/assets/claw-quest-title.png" alt="Claw Quest" width="420">
</p>

<p align="center"><em>Send adventurers on quests with magical equipment called skills. Claw Quest is a tiny fantasy armory for OpenClaw, where your agent dons enchanted tools, shops the market for new gear, and returns from the road with tales of work well done.</em></p>

`Claw Quest` is a pixel-art desktop manager for OpenClaw skills built with Bun, React, Vite, and Tauri.

It gives you a drag-and-drop skill market, an adventurer loadout screen, local skill install/remove tools, and a quest box that can talk to OpenClaw through a local build, a remote gateway, or a Docker container.

## What it does

- auto-detects your OpenClaw workspace and installed skills
- shows installed skills as equipment around the adventurer
- lets you drag market skills onto the adventurer to install and equip them
- lets you drag equipped skills to the trash can to remove them
- shows registry security scan state for installed skills
- sends quest prompts to OpenClaw from inside the app

## Prerequisites

- [Bun](https://bun.sh/)
- Rust toolchain with Cargo
- Windows build tools needed by Tauri

For live quest sending you also need one of these:

- a local OpenClaw CLI install
- a reachable remote OpenClaw Gateway
- a Docker container with OpenClaw inside it

## Install dependencies

From the repo root:

```bash
bun install
```

## Run in development

From the repo root:

```bash
bun run desktop:dev
```

## Build the desktop app

From the repo root:

```bash
bun run desktop:build
```

The built executable ends up in:

```text
desktop\src-tauri\target\release\claw-quest.exe
```

## Screenshots

![Claw Quest full window](../docs/screenshots/claw-quest-window.png)

![Claw Quest adventurer and loadout detail](../docs/screenshots/claw-quest-adventurer.png)

## Source control and distribution

Recommended practice:

- commit the source code, docs, icons, and lockfiles
- do not commit `desktop/src-tauri/target/`, packaged installers, or built executables
- document the build steps in the repo so anyone can recreate the app
- distribute compiled installers through GitHub Releases or your own download host

## Coming soon

- support for agent managers beyond OpenClaw
- early integration plans for `RustClaw`, `TinyClaw`, and `ZeroClaw`
- a shared skill-management layer so the same playful UI can outfit more than one claw-based stack

## Connection modes

Claw Quest supports three quest transport modes in `Build Settings`.

### Local build

Use this when OpenClaw is installed on the same machine as Claw Quest.

Recommended:

- leave `Build path` empty and use `Auto-find`
- point `Workdir` at your OpenClaw workspace if needed
- make sure `openclaw gateway` is already running

### Remote Gateway

Use this when the Gateway is running on another machine.

Fill in:

- `Connection mode`: `Remote Gateway`
- `Gateway URL`: your reachable gateway URL
- `Gateway token`: token if the gateway requires one

Notes:

- this mode still needs an OpenClaw CLI installed locally
- the app uses a temporary remote-mode OpenClaw config behind the scenes to send quests through that gateway

### Docker container

Use this when OpenClaw is running inside Docker.

Fill in:

- `Connection mode`: `Docker container`
- `Docker container`: container name
- `Docker command`: usually `openclaw`
- `Container workdir`: optional, for example `/workspace`

Recommended Docker setup:

- bind-mount the OpenClaw workspace to a host folder
- keep the skills directory on that mounted workspace
- run the Gateway inside the container before sending quests

Why the bind mount matters:

- the quest transport can run inside Docker
- but skill install/remove in Claw Quest still writes to the host filesystem
- so the host and container should share the same workspace and skills folder

## Sound credits

The desktop sound effects in `desktop/src/assets` were made with [Bfxr](https://www.bfxr.net/).

## Tech stack

- React
- Vite
- Bun
- Tauri
- Rust
