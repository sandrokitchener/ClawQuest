<p align="center">
  <img src="src/assets/claw-quest-title.png" alt="Claw Quest" width="420">
</p>

<p align="center"><em>Send adventurers on quests with magical equipment called skills. Claw Quest is a tiny fantasy armory for OpenClaw, where your agent dons enchanted tools, shops the market for new gear, and returns from the road with tales of work well done.</em></p>

`Claw Quest` is a pixel-art desktop manager for OpenClaw skills built with Bun, React, Vite, Tauri, and Rust. It gives you a skill market, an adventurer paper-doll loadout, local install and removal tools, and a quest box that can send prompts back to OpenClaw without dropping you back into the terminal.

## Requirements

You will need [Bun](https://bun.sh/), a Rust toolchain with Cargo, and the Windows prerequisites needed by Tauri. For live quest sending, Claw Quest should be pointed at either a local OpenClaw install, a reachable remote Gateway, or a Docker container running OpenClaw.

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

## Attributions

Credits for the bundled sounds and fonts live in [`../ATTRIBUTIONS.md`](../ATTRIBUTIONS.md).

## Tech stack

- React
- Vite
- Bun
- Tauri
- Rust
