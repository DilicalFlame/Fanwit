#!/bin/sh
# Install, check, uninstall, check on macOS (per user). Usage: e2e-macos.sh /path/to/fanwit-install
set -eu
E=$1
M=$(dirname "$0")/e2e-macos.toml
fail() { echo "FAIL: $*"; exit 1; }
"$E" run --phase package --manifest "$M"
[ -x "$HOME/Applications/fwe2e" ] || fail "binary"
[ -L "$HOME/.local/bin/fwe2e" ] || fail "PATH link"
[ -L "$HOME/Desktop/Fanwit E2E" ] || fail "desktop shortcut"
[ -f "$HOME/Library/LaunchAgents/dev.fanwit.e2e.autostart.plist" ] || fail "autostart plist"
[ "$(defaults read dev.fanwit.e2e Telemetry)" = 0 ] || fail "plist value"
grep -q 'theme = "dark"' "$HOME/Library/Application Support/dev.fanwit.e2e/config.toml" || fail "custom step"
"$E" run --phase package --manifest "$M" | grep -q '\.\.\.$' && fail "a step ran twice" || true
"$E" uninstall --manifest "$M"
[ ! -e "$HOME/Applications/fwe2e" ] || fail "binary left"
[ ! -e "$HOME/.local/bin/fwe2e" ] || fail "PATH link left"
[ ! -e "$HOME/Desktop/Fanwit E2E" ] || fail "shortcut left"
[ ! -e "$HOME/Library/LaunchAgents/dev.fanwit.e2e.autostart.plist" ] || fail "plist left"
defaults read dev.fanwit.e2e Telemetry >/dev/null 2>&1 && fail "preference left" || true
echo "PASS macOS"
