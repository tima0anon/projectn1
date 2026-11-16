#!/usr/bin/env bash
set -euo pipefail
mkdir -p app
if [ -f app/dev.keystore ]; then exit 0; fi
tag="android-development-key"
if gh release view "$tag" --json tagName >/dev/null 2>&1; then
  gh release download "$tag" --pattern dev.keystore --dir app
else
  keytool -genkeypair -keystore app/dev.keystore -storepass android -keypass android -alias androiddebugkey -dname "CN=Android Debug,O=Offline Chess,C=US" -keyalg RSA -keysize 2048 -validity 10000
  gh release create "$tag" app/dev.keystore --prerelease --title "Android development signing key" --notes "Shared development-only signing key for direct APK builds of Offline Chess 2. This key is intentionally public, uses the standard Android debug passwords, and is not a production release key."
fi
