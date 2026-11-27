#!/usr/bin/env bash
# Run from mobile/android while the CI emulator is still alive.
set -uo pipefail

test_status=0
./gradlew :app:connectedDebugAndroidTest --console=plain || test_status=$?

# Collect synthetic-content screenshots even when a later test fails.
mkdir -p app/build/reports/simulator-evidence
if adb shell test -d /sdcard/Android/data/eu.voicetranslator.app/files/simulator-evidence; then
    adb pull /sdcard/Android/data/eu.voicetranslator.app/files/simulator-evidence/. app/build/reports/simulator-evidence/ || test_status=1
fi

exit "$test_status"
