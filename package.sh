#!/usr/bin/env bash
#
# Builds a valid webOS .ipk using only standard Linux tools (ar + tar).
# No LG webOS SDK / ares-cli needed.
#
# Output: dist/com.lazarh.tvheadend_1.0.0_all.ipk
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ID="com.lazarh.tvheadend"
VERSION="1.0.0"
ARCH="all"
PKG_NAME="${APP_ID}_${VERSION}_${ARCH}.ipk"

OUT_DIR="$ROOT/dist"
BUILD_DIR="$ROOT/build"
DATA_DIR="$BUILD_DIR/data"
CTRL_DIR="$BUILD_DIR/control"
APP_DIR="$DATA_DIR/usr/palm/applications/$APP_ID"
IPK="$OUT_DIR/$PKG_NAME"

APP_FILES=(appinfo.json index.html icon.png largeIcon.png css js)

cd "$ROOT"

# ---------------------------------------------------------------- icons
if [[ ! -f icon.png || ! -f largeIcon.png ]]; then
  echo ">> Generating placeholder icons"
  ./tools/make_icons.sh
fi

# ------------------------------------------------------------- staging
echo ">> Staging app files"
rm -rf "$BUILD_DIR"
mkdir -p "$APP_DIR" "$CTRL_DIR"

for entry in "${APP_FILES[@]}"; do
  if [[ ! -e "$ROOT/$entry" ]]; then
    echo "Missing app file: $entry" >&2
    exit 1
  fi
  cp -r "$ROOT/$entry" "$APP_DIR/"
done

# ------------------------------------------------------- control file
cat > "$CTRL_DIR/control" <<EOF
Package: $APP_ID
Version: $VERSION
Architecture: $ARCH
Maintainer: lazarh <lhristov@gmail.com>
Section: misc
Priority: optional
Installed-Size: $(du -sk "$APP_DIR" | cut -f1)
Description: Tvheadend TV - lightweight live TV client for LG webOS
 Homebrew webOS web app that plays live TV channels from a Tvheadend
 server using the native hardware accelerated HTML5 video element.
EOF

# -------------------------------------------- ipk members (Debian style)
echo ">> Creating control.tar.gz and data.tar.gz"
echo "2.0" > "$BUILD_DIR/debian-binary"

# Reproducible archives: normalized mtimes/ownership, no gzip timestamp.
TAR_OPTS=(--sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner)
tar -C "$CTRL_DIR" "${TAR_OPTS[@]}" -cf - . | gzip -9n > "$BUILD_DIR/control.tar.gz"
tar -C "$DATA_DIR" "${TAR_OPTS[@]}" -cf - .       | gzip -9n > "$BUILD_DIR/data.tar.gz"

# ----------------------------------------------------------- assemble
echo ">> Assembling $PKG_NAME"
mkdir -p "$OUT_DIR"
rm -f "$IPK"
(
  cd "$BUILD_DIR"
  # "D" makes ar deterministic (zero timestamps); fall back if unsupported.
  ar rcsD "$IPK" debian-binary control.tar.gz data.tar.gz 2>/dev/null \
    || ar rcs "$IPK" debian-binary control.tar.gz data.tar.gz
)

# ------------------------------------------------------------- verify
echo ">> Verifying package"
members="$(ar t "$IPK")"
for member in debian-binary control.tar.gz data.tar.gz; do
  if ! grep -qx "$member" <<< "$members"; then
    echo "ERROR: $member is missing from $IPK" >&2
    exit 1
  fi
done

if ! ar p "$IPK" data.tar.gz | tar -tzf - | grep -qx "./usr/palm/applications/$APP_ID/appinfo.json"; then
  echo "ERROR: app payload missing from $IPK" >&2
  exit 1
fi

echo ">> Built $IPK"
ls -lh "$IPK"
