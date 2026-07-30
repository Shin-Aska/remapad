# Store Listing Notes

This file is the source of truth for the Chrome Web Store and Firefox Add-ons
listing forms. Keep it aligned with the manifests and `PRIVACY.md`.

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

## Published store pages

- Firefox Add-ons: https://addons.mozilla.org/en-US/firefox/addon/remapad/
- Chrome Web Store: https://chromewebstore.google.com/detail/remapad-%E2%80%94-gamepad-browser/nbjngbeilcghlhgcofapgclljddnlaol

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
