# Release Checklist

Use this checklist for every Chrome Web Store, Microsoft Edge Add-ons, and
Firefox Add-ons release. Generated files under `dist/` are release artifacts and
must not be committed.

## 1. Prepare the release

- [ ] Update the version in both canonical browser manifests.
- [ ] Confirm the name, description, and version match across canonical
      manifests; the Edge manifest is generated from Chrome during the build.
- [ ] Keep one source version for the coordinated Chrome, Edge, and Firefox
      packages, while tracking each store submission and approval separately.
- [ ] At release time, check every store dashboard. Do not lower a store
      version or assume the stores have the same publication history. The
      current source version is `1.0.2`; an initial Edge submission may use it
      only when it is still the current build and has not already been published
      to Edge. For a later changed release, raise both canonical source manifests
      together above the versions already published in their respective stores.
- [ ] Review `PRIVACY.md` after every permission, storage, or network change.
- [ ] Update screenshots when the visible controls or defaults change.
- [ ] Push `PRIVACY.md`, then confirm the public privacy-policy and support URLs
      in `docs/store-listing.md` work without signing in.

## 2. Build all three packages

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
- `dist/remapad-edge-<version>.zip`
- `dist/remapad-firefox-<version>.zip`

Each ZIP must contain `manifest.json` at its root. Upload the Chrome ZIP only to
the Chrome Web Store, the Edge ZIP only to Microsoft Edge Add-ons, and the
Firefox ZIP only to Firefox Add-ons.

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
3. Use an isolated test profile; do not remove a user's installed extension or
   mappings to get a clean state.
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
- [ ] Complete the permission and lifecycle checks below.
- [ ] Verify Netflix and Prime Video still use their built-in mappings.

Record the Chrome version, operating system, controller model, connection mode,
and tested sites.

## 5. Edge runtime test

Test current stable desktop Microsoft Edge only. Record the exact Edge version,
operating system, controller model, connection mode, and tested sites. Do not
infer compatibility with older or mobile Edge releases.

1. Open `edge://extensions/`.
2. Enable **Developer mode**.
3. Use an isolated test profile; do not replace or remove a user's Chrome or
   Edge installation and mappings.
4. Select **Load unpacked** and choose `dist/edge/`.
5. Open Remapad's options page and its service-worker console.
6. Confirm there are no manifest, startup, or unhandled JavaScript errors.
7. Repeat the controller, stick, mapped-action, Netflix, and Prime Video checks
   from the Chrome test.

## 6. Permission and lifecycle checks in Chrome and Edge

Run these checks with a new, non-built-in test hostname. Built-in Netflix and
Prime Video permissions are required hosts and do not satisfy this scenario.

- [ ] Deny the optional site-access prompt. Confirm no new mapping is saved and
      no content scripts are registered for that hostname.
- [ ] Create a new mapping, approve the prompt, save it, reload the site, and
      confirm Remapad activates there.
- [ ] Revoke that granted optional permission. Reload the site and confirm the
      registration is removed and Remapad no longer injects.
- [ ] Create and save a new mapping again, then delete it. Confirm the saved
      mapping and its optional permission are removed, then reload and confirm
      non-injection.
- [ ] With DevTools closed, allow the extension service worker to stop and wake,
      then confirm the saved mapping still works. Restart the browser and repeat
      the mapping check.

The controller portions of these checks require a physical gamepad. If one is
unavailable, record only the controller release gate as pending; simulated input
does not complete it. Still complete the permission and lifecycle checks through
the options page and extension DevTools.

## 7. Firefox runtime test

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `dist/firefox/manifest.json`.
4. Open Remapad's options page and the extension console.
5. Repeat the controller, stick, mapping, and site-permission checks from the
   Chrome test.

Desktop Firefox 140 and Firefox for Android 142 are the minimum supported
versions because those versions support the manifest data-consent declaration.

## 8. Store submission

Use `docs/store-listing.md` for the single-purpose statement, permission
justifications, privacy answers, reviewer path, and prepared asset filenames.

Before pressing submit:

- [ ] Chrome privacy disclosures match `PRIVACY.md`.
- [ ] Edge listing privacy disclosures and permission explanations match
      `PRIVACY.md` and `docs/store-listing.md`.
- [ ] Firefox data collection is declared as `required: ["none"]`.
- [ ] The reviewer instructions require no private account or hidden test mode.
- [ ] The 128 × 128 icon, compliant screenshots, and 440 × 280 promotional tile
      are uploaded to the correct fields.
- [ ] The ZIP being uploaded was produced after the final source change.
- [ ] The uploaded version number has never been published previously in that
      store.

Publisher account enrollment and submission are user-owned actions. Each store
reviews and approves independently, so a submitted or pending package is not a
published release. Add a Microsoft Edge Add-ons store URL only after Partner
Center assigns a real one; do not invent a store ID or URL.

Keep each release unlisted or in a limited testing channel until the physical
controller checks pass in the affected desktop browsers.
