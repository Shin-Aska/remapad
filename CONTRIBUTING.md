# Contributing to Remapad

Thanks for helping improve Remapad. Bug reports, compatibility findings,
documentation updates, and code changes are welcome.

## Before you start

- Search existing GitLab issues and merge requests to avoid duplicating work.
- Open an issue before making a large or behavior-changing contribution so the
  approach can be discussed first.
- Never include credentials, private browsing data, or copyrighted store
  packages in an issue or commit.

## Development setup

You need:

- Git
- Python 3, used by the build scripts for manifest validation and ZIP creation
- Either Bash or PowerShell
- Firefox 128+ and/or a Chromium-based browser 111+ for manual testing
- A standard USB or Bluetooth gamepad for changes to controller behavior

Clone your fork and create a focused branch:

```bash
git clone <your-fork-url>
cd remapad
git switch -c <issue-number>-short-description
```

This project has no package-manager install step. The extension uses plain
HTML, CSS, and JavaScript.

## Project layout

- `background/`: background and service-worker logic
- `content/`: scripts injected into supported pages
- `options/`: mapping editor and options page
- `popup/`: browser-action popup
- `shared/`: code shared by extension surfaces
- `manifests/`: browser-specific Manifest V3 files
- `scripts/`: Bash and PowerShell build entry points
- `_locales/`, `assets/`, and `icons/`: translations and static assets

Generated files under `dist/` must not be committed.

## Build and validation

Build and validate both browser variants before opening a merge request:

```bash
bash scripts/build.sh
```

On Windows PowerShell:

```powershell
./scripts/build.ps1
```

To build one browser while iterating, pass `chrome` or `firefox`:

```bash
bash scripts/build.sh chrome
bash scripts/build.sh firefox
```

The build scripts validate that the two manifests share required metadata,
check browser-specific manifest constraints, create unpacked builds under
`dist/`, include the project license, and produce versioned ZIP packages.

There is currently no automated test suite. Manually load the unpacked build
in each affected browser and verify:

1. The extension installs without manifest or console errors.
2. The popup and options page open and retain saved settings.
3. A connected gamepad is detected and button mappings behave as expected.
4. Site-specific behavior works on an affected page.
5. Existing mappings and unrelated extension surfaces still work.

Include the browsers, versions, controller, operating system, and sites you
tested in the merge request.

## Making changes

- Keep each change focused on one issue.
- Follow the style and naming used in the surrounding files.
- Keep Chrome and Firefox behavior aligned unless a browser difference is
  intentional and documented.
- When changing shared manifest metadata such as the extension version, name,
  or description, update both files in `manifests/`.
- Add or update documentation when behavior, setup, or user-facing controls
  change.
- Do not add minified third-party code or dependencies without explaining
  their source, license, and necessity in the merge request.

## Commits and merge requests

Write short, imperative commit subjects, such as `Fix held-button repeat
handling`. Rebase your branch on the target branch and resolve conflicts before
requesting review.

Open a GitLab merge request and:

- Explain the problem and the chosen solution.
- Link the related issue with `Closes #<issue-number>` when appropriate.
- Describe manual validation and any known limitations.
- Include screenshots or a short recording for visible UI changes.
- Keep generated `dist/` artifacts out of the changes.
- Confirm that both browser builds pass.

Maintainers may request changes. Please keep review follow-ups in the same
branch so the discussion and pipeline history remain together.

## Licensing

By submitting a contribution, you agree that it may be distributed under the
[GNU General Public License version 3](LICENSE), identified by the SPDX
expression `GPL-3.0-only`.
