#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
MANIFEST_DIR="$ROOT_DIR/manifests"
TARGET="${1:-all}"

SOURCE_DIRS=(
  "_locales"
  "assets"
  "background"
  "content"
  "icons"
  "options"
  "popup"
  "shared"
)

case "$TARGET" in
  all|chrome|firefox) ;;
  *)
    echo "Usage: bash scripts/build.sh [all|chrome|firefox]" >&2
    exit 2
    ;;
esac

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
else
  echo "Python 3 is required to validate manifests and create ZIP packages." >&2
  exit 1
fi

for source_dir in "${SOURCE_DIRS[@]}"; do
  if [[ ! -d "$ROOT_DIR/$source_dir" ]]; then
    echo "Missing source directory: $source_dir" >&2
    exit 1
  fi
done

VERSION="$("$PYTHON_BIN" - "$MANIFEST_DIR" <<'PY'
import json
import pathlib
import sys

manifest_dir = pathlib.Path(sys.argv[1])
paths = {
    "chrome": manifest_dir / "manifest.chrome.json",
    "firefox": manifest_dir / "manifest.firefox.json",
}

manifests = {}
for browser, path in paths.items():
    try:
        manifests[browser] = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Missing {browser} manifest: {path}")
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid JSON in {path}: {error}")

shared_keys = ("manifest_version", "name", "short_name", "version", "description")
for key in shared_keys:
    values = {browser: manifest.get(key) for browser, manifest in manifests.items()}
    if len(set(values.values())) != 1:
        raise SystemExit(f"Manifest field {key!r} differs: {values}")

if len(manifests["chrome"]["name"]) > 75:
    raise SystemExit("Chrome manifest name exceeds the 75-character limit")
if len(manifests["chrome"]["description"]) > 132:
    raise SystemExit("Chrome manifest description exceeds the 132-character limit")

chrome_background = manifests["chrome"].get("background", {})
if set(chrome_background) != {"service_worker"}:
    raise SystemExit("Chrome manifest background must contain only service_worker")

firefox_background = manifests["firefox"].get("background", {})
if set(firefox_background) != {"scripts"}:
    raise SystemExit("Firefox manifest background must contain only scripts")

gecko = manifests["firefox"].get("browser_specific_settings", {}).get("gecko", {})
if not gecko.get("id"):
    raise SystemExit("Firefox manifest must declare browser_specific_settings.gecko.id")

print(manifests["chrome"]["version"])
PY
)"

build_browser() {
  local browser="$1"
  local manifest_path="$MANIFEST_DIR/manifest.$browser.json"
  local output_dir="$DIST_DIR/$browser"
  local archive_path="$DIST_DIR/remapad-$browser-$VERSION.zip"

  case "$output_dir" in
    "$DIST_DIR/chrome"|"$DIST_DIR/firefox") ;;
    *)
      echo "Refusing unsafe output directory: $output_dir" >&2
      exit 1
      ;;
  esac

  rm -rf -- "$output_dir"
  mkdir -p "$output_dir"

  for source_dir in "${SOURCE_DIRS[@]}"; do
    cp -R "$ROOT_DIR/$source_dir" "$output_dir/"
  done
  cp "$manifest_path" "$output_dir/manifest.json"

  rm -f -- "$archive_path"
  "$PYTHON_BIN" - "$output_dir" "$archive_path" <<'PY'
import pathlib
import sys
import zipfile

source = pathlib.Path(sys.argv[1])
archive = pathlib.Path(sys.argv[2])

with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in sorted(source.rglob("*")):
        if path.is_file():
            output.write(path, path.relative_to(source).as_posix())
PY

  echo "Built $browser:"
  echo "  Directory: $output_dir"
  echo "  Package:   $archive_path"
}

mkdir -p "$DIST_DIR"

if [[ "$TARGET" == "all" || "$TARGET" == "chrome" ]]; then
  build_browser chrome
fi

if [[ "$TARGET" == "all" || "$TARGET" == "firefox" ]]; then
  build_browser firefox
fi
