# Store Listing Notes

This file is the source of truth for the Chrome Web Store, Microsoft Edge Add-ons,
and Firefox Add-ons listing forms. Keep it aligned with the manifests and
`PRIVACY.md`.

## Single purpose

Remapad lets a user control supported websites with a standard gamepad,
including navigation, mapped page actions, scrolling, a virtual cursor, and an
on-screen keyboard.

## Short description

Navigate websites with a gamepad using custom mappings, stick navigation, a
virtual cursor, and an on-screen keyboard.

## Chrome permission justifications

### `storage`

Stores controller mappings, per-site configuration, navigation settings, and
tutorial progress locally in the browser.

### `activeTab`

Reads the current tab's hostname after the user opens Remapad, so the popup can
show and change the status of that site.

### `scripting`

Registers the packaged controller runtime on sites the user has enabled. No code
is downloaded or executed remotely.

### Required host access

Access to Netflix and Prime Video supports Remapad's two built-in site profiles.
It is used only for controller navigation and the page actions configured by the
user.

### Optional host access

Users can add any website. Remapad requests access only to the specific hostname
the user adds, at the moment they add it. The optional wildcard declaration
allows those explicit per-site requests without granting access to every site.

## Chrome privacy form

- Personally identifiable information: **No**
- Health information: **No**
- Financial and payment information: **No**
- Authentication information: **No**
- Personal communications: **No**
- Location: **No**
- Web history: **No data is transmitted or collected by the developer**
- User activity: **No data is transmitted or collected by the developer**
- Website content: **No data is transmitted or collected by the developer**
- Data usage certification: certify compliance with the Chrome Web Store User
  Data Policy and Limited Use requirements
- Privacy policy URL:
  `https://gitlab.com/ShinAska/remapad/-/blob/main/PRIVACY.md`
- Support URL: `https://www.richardorilla.website`

Remapad processes active-site information and page content locally to provide
its visible features. It does not transmit that information off the user's
device.

## Firefox data consent

The Firefox manifest declares:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

This is accurate only while Remapad has no telemetry, analytics, advertising,
remote favicon service, or other transmission of user data. Firefox 140 is the
minimum supported desktop version and Firefox for Android 142 is the minimum
Android version because those releases support this built-in consent
declaration.

## Microsoft Edge Add-ons listing

### Long description (English)

Remapad turns a standard USB or Bluetooth gamepad into a browser controller for desktop Microsoft Edge. A compatible gamepad is required. Use the left stick to move a virtual cursor and the right stick to scroll. Map face buttons, the D-pad, shoulder buttons, triggers, and stick clicks to the page actions you use most, including navigation, playback controls, fullscreen, tab changes, and search. Controls can be enabled or disabled globally and customized for each supported website.

Remapad includes built-in profiles for Netflix and Prime Video. You can add another website from the options page one hostname at a time; Edge asks you to approve access when that site is added. The extension uses the granted access to perform the controller actions you configure, including clicking page controls and moving through links, cards, menus, and other focusable elements. Website behavior depends on the controls exposed by each site.

When a page has a text field, Remapad can open an on-screen keyboard that you navigate with the gamepad. The options page lets you inspect and edit mappings, navigation behavior, cursor settings, keyboard settings, and tutorial progress. Settings and mappings are stored in Edge's local extension storage so they remain available on that device.

Remapad has no login, subscription, analytics, advertising, telemetry, or developer-operated service. The active-site hostname, gamepad input, settings, and page elements needed for the visible controller features are processed locally in the browser. Remapad does not collect, sell, share, or transmit that information to the developer or to third parties. All executable code and runtime assets are packaged with the extension; Remapad does not download or execute remote code. Remapad is an independent project and is not affiliated with Microsoft, Netflix, Amazon, or any other supported website.

### Short description

Navigate streaming sites with a gamepad. Map buttons, customize site profiles,
and control playback, scrolling, and navigation.

### Permissions and data disclosures

- `storage`: stores controller mappings, per-site configuration, navigation and
  cursor settings, keyboard settings, and tutorial progress locally in Edge.
- `activeTab`: reads the active tab's hostname when the user invokes Remapad,
  so the popup can show and change the status for that site.
- `scripting`: registers Remapad's packaged controller runtime on sites that the
  user has enabled and granted. No code is downloaded or executed remotely.
- Required host access for Netflix and Prime Video: supplies the two built-in
  site profiles and performs only the controller navigation and page actions
  configured by the user on those hosts.
- Optional host access (`*://*/*`): supports adding another website one
  hostname at a time. Edge prompts for the specific site when the user adds it;
  the wildcard declaration does not mean that Remapad uses every site.

Remapad does not request or use additional permissions for data collection.
The extension does not collect data for the developer, and it does not send
active-site information, web history, gamepad input, settings, or page content
off the device. There is no remote code. These statements match [PRIVACY.md](https://gitlab.com/ShinAska/remapad/-/blob/main/PRIVACY.md).

Privacy policy: `https://gitlab.com/ShinAska/remapad/-/blob/main/PRIVACY.md`
Support: `https://www.richardorilla.website`

### Reviewer test path (no login required)

1. Connect a standard USB or Bluetooth gamepad before opening the extension.
2. Install the submitted package, or load `dist/edge` from `edge://extensions`
   with Developer mode enabled while reviewing the release build.
3. Open `https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension` for a public, no-login navigation and scrolling check. Open Remapad's options page, add `learn.microsoft.com`, and approve the site-access prompt.
4. Move the left stick to control the virtual cursor and the right stick to
   scroll. Press the configured face buttons and confirm the mapped page
   actions. Use the options page to inspect or change the mapping.
5. For text entry, add `www.google.com` from the options page, approve access,
   focus its public search field, and invoke the mapped on-screen keyboard. No
   account is needed.
6. The extension has no hidden test mode, account, subscription, or external
   service. Reviewers can test the visible features with the public pages above.
   A signed-in streaming account is not required for this path.

### Edge listing asset mapping

Microsoft's [publication requirements](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) currently specify a square extension logo with a minimum size of 128 × 128 pixels (300 × 300 recommended), a 440 × 280 small promotional tile, and screenshots sized 640 × 480 or 1280 × 800, with up to six screenshots. Recheck these fields in Partner Center at submission time.

| Partner Center field | File | Status and use |
| --- | --- | --- |
| Required extension logo | `icons/icon-128.png` | Present; use the shared Remapad logo. |
| Optional small promotional tile | `docs/store-assets/small-promo-440x280.png` | Present; use if visual inspection confirms it is suitable for the Edge listing. |
| Optional screenshot 1 | `docs/store-assets/edge-screenshot-controller-mapping-1280x800.png` | Present and verified at 1280 × 800 from the installed Edge extension options/mapping UI. |
| Optional screenshot 2 | `docs/store-assets/edge-screenshot-virtual-keyboard-1280x800.png` | Present and verified at 1280 × 800 from the installed Edge extension's real on-screen keyboard overlay. |
| Optional large promotional tile | *(empty)* | Leave empty for this release. |
| Optional YouTube video URL | *(empty)* | Leave empty for this release. |

The existing Chrome screenshots at 640 × 400 are not assigned to the Edge
screenshot fields because that size is not one of Microsoft's accepted Edge
screenshot dimensions. The two Edge screenshots above are the captured 1280 ×
800 assets for this listing.

## Published store pages

- Firefox Add-ons: https://addons.mozilla.org/en-US/firefox/addon/remapad/
- Chrome Web Store: https://chromewebstore.google.com/detail/remapad-%E2%80%94-gamepad-browser/nbjngbeilcghlhgcofapgclljddnlaol
- Edge Add-ons: **URL not recorded; first publication pending.** Replace this line with the exact live Microsoft Edge Add-ons URL only after Microsoft approves the submission; do not report a draft or Partner Center URL as published.

### Edge publication checklist

- [ ] Build and verify `dist/remapad-edge-<version>.zip` from the shared release
  version. Keep the ZIP root flat and include the Edge manifest, LICENSE,
  packaged runtime assets, and the required logo.
- [ ] Install the exact release package in current desktop Edge and follow the
  no-login reviewer path above with a compatible gamepad. Record the package
  SHA-256, Edge version, tested URLs, and any physical-controller or streaming
  account limitation separately.
- [ ] In Partner Center, upload the verified Edge ZIP and enter the manifest
  name, existing short description, and the English long description above.
  Select only the permissions and host access declared by the package.
- [ ] Enter the privacy policy and support URLs above. Declare that the
  developer does not collect user data, that feature data is processed locally,
  and that the extension contains no remote code.
- [ ] Upload `icons/icon-128.png`; optionally upload the small tile after visual
  inspection. Upload the two captured Edge screenshots after final listing
  review; both are validated at 1280 × 800. Leave the large tile and video
  fields empty for this release.
- [ ] Add the reviewer steps above, without credentials. Record Partner Center
  draft/submission status, exact package version, and SHA-256. The Edge URL stays
  pending until certification succeeds and the public listing is reachable.

For later updates, keep the Chrome, Edge, and Firefox source versions coordinated,
build and test each store's package independently, and track each store's
submission and approval status separately. Never lower a store version or infer
Edge publication from Chrome or Firefox history.

## Reviewer test path

1. Connect a standard gamepad before opening a test site.
2. Install the browser-specific package from `dist/`.
3. Open Netflix or Prime Video, or add a test hostname from the options page and
   approve the browser's site-access prompt.
4. Move the left stick to control the virtual cursor.
5. Move the right stick to scroll.
6. Press the configured face buttons and confirm the corresponding page
   actions.
7. Open the options page to inspect or change per-site mappings.

The extension has no login, subscription, external service, or hidden test
mode.

## Listing assets

Chrome requires:

- store icon: 128 × 128 PNG;
- at least one screenshot: 1280 × 800 or 640 × 400;
- small promotional tile: 440 × 280 PNG or JPEG.

Prepared assets:

- `docs/store-assets/screenshot-controller-mapping-640x400.png`
- `docs/store-assets/screenshot-virtual-keyboard-640x400.png`
- `docs/store-assets/small-promo-440x280.png`

The promotional tile was generated from Remapad's visual language with the
built-in image generation tool, then cropped to the required store dimensions.
The screenshots contain the real extension UI and were only fitted to compliant
canvas dimensions.

Firefox listing screenshots should be uploaded from the same release build.
Do not place promotional text or claims in screenshots that the current release
does not support.
