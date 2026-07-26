# Release Checklist

Use this checklist for every Chrome Web Store and Firefox Add-ons release.
Generated files under `dist/` are release artifacts and must not be committed.

## 1. Prepare the release

- [ ] Update the version in both browser manifests.
- [ ] Confirm the name, description, and version match across manifests.
- [ ] Review `PRIVACY.md` after every permission, storage, or network change.
- [ ] Update screenshots when the visible controls or defaults change.
- [ ] Push `PRIVACY.md`, then confirm the public privacy-policy and support URLs
      in `docs/store-listing.md` work without signing in.

## 2. Build both packages

PowerShell:

```powershell
./scripts/build.ps1
```

Bash:

```bash
bash scripts/build.sh
```

Expected release files:

- `dist/remapad-chrome-<version>.zip`
- `dist/remapad-firefox-<version>.zip`

Each ZIP must contain `manifest.json` at its root. Upload the Chrome ZIP only to
the Chrome Web Store and the Firefox ZIP only to Firefox Add-ons.

## 3. Static validation

Run Mozilla's current extension linter against the generated Firefox directory:

```powershell
npx --yes web-ext@10.5.0 lint --source-dir dist/firefox
```

The release target is zero errors and zero warnings.

Check every JavaScript source file with the installed Node.js runtime:

```powershell
$files = rg --files -g '*.js' -g '!dist/**'
foreach ($file in $files) { node --check $file }
```

Review the final diff and ensure it contains no generated `dist/` files,
credentials, telemetry endpoint, remote executable code, or unexplained new
permission.

## 4. Chrome runtime test

Google Chrome 137 and later ignore the `--load-extension` command-line flag.
Use the extension management page instead:

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Remove any older Remapad test installation.
4. Select **Load unpacked** and choose `dist/chrome/`.
5. Open Remapad's options page and its service-worker console.
6. Confirm there are no manifest, startup, or unhandled JavaScript errors.

With a physical controller connected:

- [ ] Press a button after focusing Chrome so the Gamepad API exposes it.
- [ ] Confirm the options-page controller indicator names the controller.
- [ ] Confirm button presses and both stick axes react in the input preview.
- [ ] If the OS exposes multiple paired controllers, confirm input switches the
      preview to the controller currently being used.
- [ ] On a mapped page, confirm the left stick moves the virtual cursor.
- [ ] Confirm the right stick scrolls vertically and horizontally.
- [ ] Confirm mapped face buttons execute once per press.
- [ ] Add a non-built-in domain and approve the site-access prompt.
- [ ] Reload that domain and confirm Remapad activates.
- [ ] Delete the mapping and confirm the extension no longer runs there.
- [ ] Verify Netflix and Prime Video still use their built-in mappings.

Record the Chrome version, operating system, controller model, connection mode,
and tested sites.

## 5. Firefox runtime test

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `dist/firefox/manifest.json`.
4. Open Remapad's options page and the extension console.
5. Repeat the controller, stick, mapping, and site-permission checks from the
   Chrome test.

Desktop Firefox 140 and Firefox for Android 142 are the minimum supported
versions because those versions support the manifest data-consent declaration.

## 6. Store submission

Use `docs/store-listing.md` for the single-purpose statement, permission
justifications, privacy answers, reviewer path, and prepared asset filenames.

Before pressing submit:

- [ ] Chrome privacy disclosures match `PRIVACY.md`.
- [ ] Firefox data collection is declared as `required: ["none"]`.
- [ ] The reviewer instructions require no private account or hidden test mode.
- [ ] The 128 × 128 icon, compliant screenshots, and 440 × 280 promotional tile
      are uploaded to the correct fields.
- [ ] The ZIP being uploaded was produced after the final source change.
- [ ] The uploaded version number has never been published previously.

Keep the release unlisted or in a limited testing channel until the physical
controller checks pass on both browsers.
