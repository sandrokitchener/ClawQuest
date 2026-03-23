# Mobile APK Plan

## Current viability

An Android APK build is viable with the existing `desktop/` Tauri app as the base.

What is already working on this machine:

- `bunx tauri android init --ci` succeeds and generated the Android Studio project under `desktop/src-tauri/gen/android`.
- Tauri installed the Android Rust targets successfully.
- `bunx tauri android build --debug --apk --target aarch64 --ci` now compiles the Rust app for Android after adding a shared mobile-compatible Tauri entry point.
- A local arm64 release build now packages successfully as `app-arm64-release-unsigned.apk` once the compiled `.so` is copied into `jniLibs` to bypass the Windows symlink restriction.

Current local blocker:

- The Android build stops on Windows when Tauri tries to create a symlink into `desktop/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a`.
- Exact failure: Windows symlink creation is disabled for the current system/user.
- To finish local APK generation without the manual copy workaround, enable Windows Developer Mode or grant symlink privileges, then rerun the build.

## Code changes made on this branch

- Added a shared Tauri library entry point in `desktop/src-tauri/src/lib.rs`.
- Updated `desktop/src-tauri/src/main.rs` to call the shared entry point.
- Added a `[lib]` target with Android-friendly crate types in `desktop/src-tauri/Cargo.toml`.
- Cleaned up a non-Windows warning in `desktop/src-tauri/src/manager.rs`.

These changes move Claw Quest from a desktop-only binary layout to a structure that Tauri Android can compile.

## Product viability

The APK is technically buildable, but the current desktop interaction model is not yet mobile-viable end to end.

The main issue is transport:

- Desktop `Remote Gateway` mode still depends on a locally installed OpenClaw CLI.
- Skill install/remove writes to a local host workspace on disk.
- On Android, we should not assume a local OpenClaw install, a local Docker runtime, or a local workspace that matches the real remote agent workspace.

Conclusion:

- The mobile app should be remote-first.
- The setup wizard should make `Remote Gateway` the primary path.
- Quest sending should talk to the Gateway directly instead of shelling out to a local CLI.
- Skill inventory for mobile should come from the remote agent/workspace, not from Android local filesystem state.

## Recommended mobile UX

### 1. First-launch setup wizard

Show this before the main game UI on first launch or until setup is complete.

Suggested steps:

1. Welcome screen
2. Gateway URL
3. Gateway token (optional if public)
4. Test connection
5. Choose remote agent/workspace
6. Finish and enter the game

Persist:

- connection mode = `remote`
- gateway URL
- gateway token
- selected remote workspace or agent id

## 2. Default to docked/mobile layout

On mobile:

- start in docked mode by default
- hide desktop-only window controls
- treat the paper-doll and quest composer as the home screen
- keep status, level, and equipped skills visible without scrolling the entire page

## 3. Turn the skill shop into a bottom sheet

Instead of the current always-open left inventory panel:

- add a `Skill Shop` button near the bottom of the screen
- open the catalog as a bottom sheet
- let the sheet be dragged upward to expand
- keep drag-and-drop from the sheet to the character/loadout

Recommended mobile structure:

- top: character status and settings
- middle: character paper-doll
- below: equipped skills
- bottom dock: `Skill Shop`, `Quest`, `Settings`
- bottom sheet: searchable market catalog

## Required engineering changes

### Phase 1. Finish Android packaging

- Enable Windows symlink support or build from a machine where symlinks are allowed.
- Run:

```bash
cd desktop
bunx tauri android build --debug --apk --target aarch64 --ci
```

### Phase 2. Add platform-aware app mode

- Detect Android/mobile runtime in the React app.
- Default mobile builds to docked layout.
- Hide desktop-only actions:
  - close window
  - center window
  - desktop resizing assumptions

### Phase 3. Add the setup wizard

- Introduce a first-launch flow in `desktop/src/App.tsx`.
- Require remote gateway configuration before questing.
- Save a `mobileSetupComplete` flag separately from current desktop defaults.

### Phase 4. Replace local-only quest transport for mobile

- Add a mobile-safe quest path that talks directly to the Gateway.
- Do not rely on spawning a local OpenClaw CLI on Android.
- Keep the existing desktop local/remote/docker modes for desktop builds.

### Phase 5. Move skill state to remote data for mobile

- Fetch installed/equipped skills from the remote workspace or agent profile.
- Install/remove/equip should target the remote workspace, not Android local disk.
- If Gateway APIs do not support this yet, that backend work becomes the real blocker for a useful mobile release.

### Phase 6. Build the mobile layout

- Make docked layout the default mobile shell.
- Convert the merchant panel into a bottom sheet.
- Preserve drag-and-drop where touch allows it.
- If touch drag feels unreliable, add tap-to-equip as the fallback interaction.

## Biggest unknowns

These need to be answered before calling the mobile build production-ready:

- Does the OpenClaw Gateway already expose enough API surface for:
  - sending prompts directly
  - listing installed skills remotely
  - installing/removing skills remotely
  - switching or selecting the active agent/workspace
- If not, should mobile ship as:
  - quest-only first, with read-only loadout
  - or full remote loadout management after Gateway/API work

## Suggested next implementation slice

The best next slice on this branch is:

1. Add mobile runtime detection and default docked mode.
2. Add the first-launch setup wizard UI.
3. Add a mobile `Skill Shop` bottom-sheet shell.
4. Keep quest/install actions disabled behind clear messaging until direct Gateway transport exists.

That gives us a believable mobile prototype without pretending the desktop local-CLI model works on Android.
