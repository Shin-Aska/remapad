# Remapad — Gamepad Browser Controller

Remapad is a Manifest V3 browser extension (designed for Firefox and Chrome) that allows you to control media streaming websites using any standard USB or Bluetooth gamepad (e.g. PlayStation DualSense, Xbox Series X/S, or Nintendo Switch controllers).

With Remapad, you can bind gamepad buttons to perform common browser actions, dispatch custom key combinations, or target specific CSS elements on a webpage.

---

## 🚀 Features

- **Gamepad Interception Hook:** Automatically hooks and disables default browser gamepad controls on active pages, ensuring that gamepad button presses don't trigger native scrolling or double-inputs.
- **Site-Specific Profiles:** Define and save customized mappings individually per streaming platform (e.g., custom maps specifically for Netflix or Prime Video) while using a unified default profile for other pages.
- **Interactive Visual Mapping Editor:** Real-time visual controller representation displaying active button presses, battery life, and connected status.
- **Physical Keyboard Capturer:** Tap any physical key combination on your keyboard (including modifier combinations like `Ctrl+Alt+S`) to record and bind it directly to a controller button.
- **Direct DOM Actions:** Bind a controller button to click, focus, scroll to, fill, or control a specific page element without relying on a synthetic keyboard event.
- **Video Controls CSS Selector Helpers:** Easily map buttons to specific site UI elements (such as Play/Pause, Next Episode, Subtitles, Skip Intro, Fullscreen) using pre-populated, tested element selectors.
- **Icon Layout Switcher:** Toggle glyph layouts between PlayStation (✕/○), Xbox (A/B), and Nintendo (Switch inverted) styles dynamically.

---

## 🛠 Installation

Remapad requires Firefox 128+ or a Chromium-based browser 111+ because it uses Manifest V3 MAIN-world content scripts to prevent page-level gamepad conflicts.

### Firefox (Add-on Developer Mode)
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file in the root of the project directory.

### Chrome (Developer Mode)
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** and select the root project directory.

---

## 📖 Usage Instructions

1. **Connect Gamepad:** Connect your controller via USB or Bluetooth. Tap any button to register it.
2. **Options Menu:** Click the Remapad extension icon in your browser toolbar, then click **Customize Mapping...** to open the Visual Mapping Editor.
3. **Customize Site Bindings:**
   - Select a website mapping in the sidebar (or add a new domain under **Website Mappings**).
   - In the Visual Mapping Editor, select the target site (or choose `Default` to edit default bindings).
   - Click a button callout on the controller to open the actions popover.
   - Choose a predefined shortcut, input a selector, or capture a keyboard key.
4. **Save:** Click **Save Changes** in the top-right to write configuration settings to storage.

The on-page navigation guide is hidden by default. Bind a button to **Toggle Navigation Guide** in the mapping editor when you want to show or hide it.

Keyboard-key mappings send synthetic page events, so they work with sites that accept scripted shortcuts but cannot bypass sites that require trusted physical keyboard input. Prefer **Direct DOM Action...** for a site control: it can click, focus, scroll to, fill, toggle an attribute, or play/pause a selected element without key simulation. Use Quick Map for a fast visible-player-control binding.

### Quick Map on the Page

Press **Start** while Remapad is enabled to map a live page control without leaving the site. Press the controller button to bind, choose **Click**, **Focus**, or **Hover**, select the page control, then save the generated selector. Press **Start** again or **Esc** to cancel. This is useful for player controls that ignore synthetic keyboard shortcuts.
