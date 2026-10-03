#!/bin/sh
# Install, check, uninstall, check: run inside a Linux container with the engine at /engine.
set -eu
E=/engine
M=/tests/e2e.toml
D="$HOME/.local/share/fwe2e"
fail() { echo "FAIL: $*"; exit 1; }
want() { [ -e "$1" ] || fail "missing $1"; }
gone() { [ ! -e "$1" ] || fail "left behind $1"; }

echo "== plan"
$E plan --manifest $M
echo "== install"
$E run --phase package --manifest $M
for f in "$D/fwe2e" "$HOME/.local/bin/fwe2e" "$HOME/.local/share/applications/fwe2e.desktop" \
         "$HOME/.config/autostart/fwe2e.desktop" "$HOME/.config/environment.d/60-fwe2e-fwe2e_home.conf" \
         "$HOME/.local/share/mime/packages/fwe2e-fwe.xml" "$HOME/.local/share/applications/fwe2e-fwe2e-handler.desktop" \
         "$HOME/.local/share/applications/fwe2e-tools.desktop" "$HOME/.local/share/dev.fanwit.e2e/config.toml" "$D/.install/receipt.toml"; do
  want "$f"
done
grep -q 'FWE2E_HOME=' "$HOME/.config/environment.d/60-fwe2e-fwe2e_home.conf" || fail "env value"
[ "$("$HOME/.local/bin/fwe2e")" = fwe2e ] || fail "the PATH link does not run the app"
echo "== again (nothing to do)"
$E run --phase package --manifest $M | tee /tmp/second.log
grep -q '\.\.\.$' /tmp/second.log && fail "a step ran twice" || true
echo "== uninstall"
$E uninstall --manifest $M
for f in "$D/fwe2e" "$HOME/.local/bin/fwe2e" "$HOME/.local/share/applications/fwe2e.desktop" "$HOME/.config/autostart/fwe2e.desktop" \
         "$HOME/.config/environment.d/60-fwe2e-fwe2e_home.conf" "$HOME/.local/share/mime/packages/fwe2e-fwe.xml" \
         "$HOME/.local/share/dev.fanwit.e2e/config.toml" "$D/.install"; do
  gone "$f"
done
echo "PASS $(. /etc/os-release && echo "$PRETTY_NAME")"
