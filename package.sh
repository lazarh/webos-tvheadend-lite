#!/usr/bin/env bash
#
# Builds a valid webOS .ipk using only standard Linux tools (ar + tar).
# No LG webOS SDK / webOS CLI needed.
#
# Output: dist/com.lazarh.tvheadend_1.0.0_all.ipk
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ID="com.lazarh.tvheadend"
VERSION="1.2.0"
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

# ------------------------------------------------ install-time defaults
# Optional: bake server settings into the package so no typing is needed on
# the TV. The password is intentionally never baked in.
#   TVH_SERVER=http://192.168.0.100:9981 TVH_USERNAME=user \
#   TVH_PROFILE=webtv-h264-aac-mpegts ./package.sh
if [[ -n "${TVH_SERVER:-}" || -n "${TVH_USERNAME:-}" || -n "${TVH_PROFILE:-}" ]]; then
  echo ">> Baking install-time config into js/config.js"
  python3 - "$APP_DIR/js/config.js" <<'PY'
import json, os, sys
cfg = {}
for env, key in [
    ('TVH_SERVER', 'server'),
    ('TVH_USERNAME', 'username'),
    ('TVH_PROFILE', 'profile'),
]:
    value = os.environ.get(env, '').strip()
    if value:
        cfg[key] = value
with open(sys.argv[1], 'w') as handle:
    handle.write('window.TVH_CONFIG = ' + json.dumps(cfg) + ';\n')
PY
fi

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
# The webOS install service rejects archives written by GNU `ar` - it expects
# the header layout used by ares-package (mode 100644, space padded member
# names, no trailing slash). Build the ar container directly with printf/cat;
# only tar, gzip and coreutils are needed.
echo ">> Assembling $PKG_NAME"
mkdir -p "$OUT_DIR"
rm -f "$IPK"

write_ar_member() {
  local file="$1" name size
  name="$(basename "$file")"
  size="$(wc -c < "$file" | tr -d '[:space:]')"
  printf '%-16s%-12s%-6s%-6s%-8s%-10s`\n' "$name" 0 0 0 100644 "$size" >> "$IPK"
  cat "$file" >> "$IPK"
  if (( size % 2 )); then
    printf '\n' >> "$IPK"
  fi
}

printf '!<arch>\n' > "$IPK"
write_ar_member "$BUILD_DIR/debian-binary"
write_ar_member "$BUILD_DIR/control.tar.gz"
write_ar_member "$BUILD_DIR/data.tar.gz"

# ------------------------------------------------------------- verify
echo ">> Verifying package"
members="$(ar t "$IPK")"
for member in debian-binary control.tar.gz data.tar.gz; do
  if ! grep -qx "$member" <<< "$members"; then
    echo "ERROR: $member is missing from $IPK" >&2
    exit 1
  fi
done

# Note: grep -q inside a pipefail pipeline can kill tar with SIGPIPE, so
# capture the listing into a variable first.
listing="$(ar p "$IPK" data.tar.gz | tar -tzf - 2>/dev/null || true)"
if ! grep -qx "./usr/palm/applications/$APP_ID/appinfo.json" <<< "$listing"; then
  echo "ERROR: app payload missing from $IPK" >&2
  exit 1
fi

echo ">> Built $IPK"
ls -lh "$IPK"
