#!/bin/bash
# Package the VoiceBridge Chrome extension into a .zip for distribution.
# Output: web/public/release/voicebridge-latest.zip

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
EXT_DIR="$ROOT/extension"
OUT_DIR="$ROOT/web/public/release"

mkdir -p "$OUT_DIR"

cd "$EXT_DIR"

zip -r "$OUT_DIR/voicebridge-latest.zip" \
  manifest.json \
  popup.html popup.css popup.js \
  background.js \
  content.js \
  offscreen.html offscreen.js \
  audio-processor.js \
  recorder.html recorder.js \
  icons/ \
  -x "*.DS_Store"

echo "Packaged: $OUT_DIR/voicebridge-latest.zip"
ls -lh "$OUT_DIR/voicebridge-latest.zip"
