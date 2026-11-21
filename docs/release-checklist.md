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
- [ ] At release time, check every store dashboard. Use the current source
      version for a first submission. For an update, verify that the version
      in both canonical manifests is higher than the version already published
      in each store.
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

### Browser Navigation Mode and Browse release gate

Run these checks separately in desktop Chrome, Edge, and Firefox. Record the
browser/OS versions, controller model, USB or Bluetooth connection, tested sites,
and any duplicate Gamepad API entries. These are required manual checks, not a
record that hardware validation has already passed.

- [ ] With a fresh profile, deny Navigation Mode’s broad website-access prompt.
      Choose **Save Site Binding Only** and confirm the binding saves, other
      staged changes stay staged, and the mode stays off. Open the dialog again,
      grant access, then choose **Cancel**. Confirm the binding was discarded
      and the website access granted for this attempt was released. If the
      browser asks to restore previous site access, allow it and check that the
      original sites still work.
- [ ] Grant access in the tab-binding dialog and select **Save and Turn On
      Navigation Mode**. Confirm the binding and mode save from the dialog, the
      editor displays the selected site's Navigation profiles, and the mode
      works after refreshing a non-built-in test site.
- [ ] Confirm the popup reflects runtime readiness, global Off, per-site Off,
      and revoked broad access. Re-grant broad access from browser extension
      settings and confirm this external regrant alone leaves the mode off.
      Explicitly enable the mode in Remapad and Save Changes; verify recovery.
- [ ] Create two independent navigation profiles on one site; record a held
      multi-button shortcut for next/previous profile. Confirm one switch per
      hold, neutral release before another switch, stable profile selection
      across reload, and independent profiles on a second site.
- [ ] Map an individual button to Swap to Next Profile, and another to Swap to
      Previous Profile. Confirm a fresh press switches immediately once, holding
      does not repeat, and release permits the next press. Confirm the recorded
      multi-button shortcut switches after the hold shown in Profile Shortcuts.
- [ ] On Windows, connect an Xbox/XInput-compatible controller. If Chromium
      exposes duplicate controller entries, confirm only the device producing
      fresh input controls the page. Disconnect/reconnect and change active
      controllers; held A/B or D-pad input must not trigger an unintended action.
- [ ] Alt-tab away and return while holding a button. Repeat after focusing the
      URL field or another control. Release before trying a new action; confirm
      there are no carried-over clicks, returns, or tab changes.
- [ ] Open Browse from both popup and Navigation Guide. With only D-pad/A/B,
      enter text, use Done to reach suggestions, switch an open tab, open a typed
      address in a new tab, edit the source URL, and return to the source. Confirm
      each successful destination closes Browse. Reopen it and verify LT/RT,
      the source page’s saved Close Browser Tab combination, and Close Browse.
      Close the source tab and confirm Browse disables its source actions.
- [ ] Expand Suggestion sources with D-pad/A. Independently deny, grant, and
      revoke bookmarks, history, and search. Confirm denied/revoked sources
      disappear, addresses still work, searches use the browser default provider,
      and no history queries are persisted. Confirm controller A on an Allow
      button keeps focus and explains how to open the prompt with Enter or a
      click.
- [ ] Type quickly while tab titles/URLs change. Confirm late suggestions do not
      overwrite the current query, unchanged rows keep their DOM/focus, and an
      updated focused result stays selected when still present.
- [ ] Verify the side keyboard at desktop width and stacked layout at a narrow
      width. Confirm visible focus and no horizontal overflow. Restart the
      browser and repeat Navigation Mode activation and profile checks.

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
