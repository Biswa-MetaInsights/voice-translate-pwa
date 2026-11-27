#!/usr/bin/env bash
# Run from mobile/android while the CI emulator is still alive.
set -uo pipefail

test_status=0
./gradlew :app:connectedDebugAndroidTest -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true --console=plain || test_status=$?

# Collect synthetic-content screenshots even when a later test fails.
mkdir -p app/build/reports/simulator-evidence
# This ephemeral emulator contains only synthetic test data and no credentials.
# Capture crash categories, without collecting general device/application logs.
adb logcat -d -v brief AndroidRuntime:E chromium:E '*:S' > app/build/reports/simulator-evidence/android-runtime.txt || test_status=1
if adb shell test -d /sdcard/Android/data/eu.voicetranslator.app/files/simulator-evidence; then
    adb pull /sdcard/Android/data/eu.voicetranslator.app/files/simulator-evidence/. app/build/reports/simulator-evidence/ || test_status=1
fi

exit "$test_status"
