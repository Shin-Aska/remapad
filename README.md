<p align="center">
  <img src="icons/icon-128.png" width="112" alt="Remapad logo">
</p>

<h1 align="center">Remapad</h1>

<p align="center">
  A browser extension that lets you control web pages with a gamepad.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-ea4335">
  <img alt="Firefox 140+" src="https://img.shields.io/badge/Firefox-140%2B-ff7139">
  <img alt="Chrome 111+" src="https://img.shields.io/badge/Chrome-111%2B-4285f4">
  <img alt="Microsoft Edge 111+" src="https://img.shields.io/badge/Microsoft_Edge-111%2B-0078d7">
  <img alt="No runtime dependencies" src="https://img.shields.io/badge/runtime_dependencies-none-2ea44f">
  <img alt="GPL-3.0-only" src="https://img.shields.io/badge/license-GPL--3.0--only-blue">
</p>

---

Remapad is a cross-browser extension (Manifest V3) for USB and Bluetooth
controllers. You set up button mappings per site, navigate with a virtual
cursor, scroll, type with an on-screen keyboard, and interact with page
elements directly. It works on Firefox 140+ and Chromium-based browsers
(Chrome 111+, Edge 111+). No bundler, no dependencies, just plain HTML/CSS/JS.

## Install

| Browser | Link |
| --- | --- |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/remapad/) |
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/remapad-%E2%80%94-gamepad-browser/nbjngbeilcghlhgcofapgclljddnlaol) |
| Edge | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/remapad-%E2%80%94-gamepad-browser/ihhkjgcalmhooihpdcdifapgladiblgj) |

Source code lives on [GitLab](https://gitlab.com/Shin-Aska/remapad) (primary)
with a [GitHub mirror](https://github.com/Shin-Aska/remapad).

## Screenshots

### Mapping editor

Pick a button on the controller diagram and bind it to playback controls,
navigation, keyboard shortcuts, or direct DOM actions.

![Remapad visual controller mapping editor](docs/assets/controller-mapping.png)

### On-screen keyboard

![Remapad on-screen virtual keyboard](docs/assets/virtualkeyboard.png)

## Features

- Per-site profiles (Netflix, Prime Video, etc.) with a shared fallback
- Visual mapping editor that shows your actual controller layout
- Stick assignment: virtual cursor, scrolling, directional nav, or disabled
- DOM actions: click, focus, scroll-to, fill, toggle, or control elements
  directly instead of relying on keyboard shortcuts
- Keyboard capture for binding physical keys and combos like `Ctrl+Alt+S`
- On-screen keyboard for typing on pages that expect physical input
- Navigation HUD that shows active bindings without leaving the page
- Auto-detected controller glyphs (PlayStation, Xbox, Nintendo) with manual override
- Page-level gamepad isolation to prevent sites from double-handling input

## Getting started (dev)

No `npm install`, no build tools. Just clone and go.

### What you need

- Git
- Firefox 140+, Chrome 111+, or Edge 111+
- Bash + Python 3, or PowerShell
- A USB/Bluetooth gamepad for testing input

### Clone and build

```bash
git clone https://gitlab.com/ShinAska/remapad.git
cd remapad
```

Build all three browser variants:

```bash
bash scripts/build.sh        # or: .\scripts\build.ps1 on PowerShell
```

Build just one:

```bash
bash scripts/build.sh chrome
bash scripts/build.sh firefox
bash scripts/build.sh edge
```

Both build scripts accept `all` (default), `chrome`, `edge`, or `firefox`.
They validate both canonical manifests and produce:

| Target | Unpacked extension | Store package |
| --- | --- | --- |
| Chrome | `dist/chrome/` | `dist/remapad-chrome-<version>.zip` |
| Edge | `dist/edge/` | `dist/remapad-edge-<version>.zip` |
| Firefox | `dist/firefox/` | `dist/remapad-firefox-<version>.zip` |

### Loading the extension

**Chrome:** `chrome://extensions/` → Developer mode → Load unpacked → `dist/chrome/`

**Edge:** `edge://extensions/` → Developer mode → Load unpacked → `dist/edge/`

Edge is a separate install with its own extension storage. Settings don't
transfer from Chrome. The generated Edge manifest inherits Chrome's
`minimum_chrome_version` of `111`.

**Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
`dist/firefox/manifest.json`

After rebuilding, reload the extension from the browser's extension page.

For build pipeline diagrams, runtime flow, repo layout, and cross-browser
details, see [docs/architecture.md](docs/architecture.md).

## Dev workflow

1. Make a change.
2. Build for the browser you're testing.
3. Reload the unpacked extension.
4. Check the options page and controller input.
5. Test on a real site.
6. Run the full three-browser build before submitting.

There's no test suite yet, so include your browser version, OS, controller
model, connection type, and tested sites in any compatibility report.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full checklist.
For store releases, see the [release checklist](docs/release-checklist.md) and
[store listing notes](docs/store-listing.md).

## Privacy

Remapad stores config in local extension storage. Netflix and Prime Video are
built-in profiles; other sites are only accessed when you add them. No
analytics, no telemetry, no remote code. See [PRIVACY.md](PRIVACY.md).

## License

[GPL-3.0-only](LICENSE)
