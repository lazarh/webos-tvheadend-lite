#!/usr/bin/env bash
# Generates the placeholder webOS icons (80x80 and 130x130).
# Requires ImageMagick ("magick" or "convert").
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v magick >/dev/null 2>&1; then
  IM=magick
elif command -v convert >/dev/null 2>&1; then
  IM=convert
else
  echo "ImageMagick is required to generate icons" >&2
  exit 1
fi

render() {
  local size="$1"
  local pointsize="$2"
  local output="$3"
  local inset=$((size / 10))
  local radius=$((size / 8))
  "$IM" -size "${size}x${size}" gradient:'#13294b-#04070d' \
    -fill none -stroke '#4aa3ff' -strokewidth "$((size / 26))" \
    -draw "roundrectangle ${inset},${inset} $((size - inset)),$((size - inset)) ${radius},${radius}" \
    -stroke none -fill '#eaf2ff' -font DejaVu-Sans-Bold -pointsize "${pointsize}" \
    -gravity center -annotate +0+0 'TVH' \
    -strip -depth 8 "$output"
}

render 80 24 icon.png
render 130 40 largeIcon.png

echo "Generated icon.png (80x80) and largeIcon.png (130x130)"
