#!/bin/sh
set -eu

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

restore_web_build() {
  npm run build
}

trap restore_web_build EXIT

VITE_API_BASE_URL=https://microbe.monosaccharide180.com VITE_ANDROID_APP=true npm run build
npx cap sync android
(cd android && ./gradlew assembleDebug)
mkdir -p public/downloads
cp android/app/build/outputs/apk/debug/app-debug.apk microbe-growing-debug.apk
cp android/app/build/outputs/apk/debug/app-debug.apk public/downloads/microbe-growing-debug.apk
