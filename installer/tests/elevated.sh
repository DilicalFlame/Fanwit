#!/bin/sh
# Run as root: creates a normal user with sudo, then installs and uninstalls as that user.
set -eu
(command -v apt-get >/dev/null && apt-get update -qq >/dev/null && apt-get install -y -qq sudo >/dev/null) || dnf install -y -q sudo >/dev/null
useradd -m tester
echo 'tester ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/tester
fail() { echo "FAIL: $*"; exit 1; }
as() { sudo -u tester -H sh -c "$*"; }

echo "== user scope with one elevated step"
as "/engine run --phase package --manifest /tests/elevated.toml"
[ -f /opt/fwe2e-elevated ] || fail "the elevated step did not run"
[ "$(stat -c %U /opt/fwe2e-elevated)" = root ] || fail "not written as root"
[ -f /home/tester/.local/share/dev.fanwit.e2e/user-marker ] || fail "the user step did not run"
[ "$(stat -c %U /home/tester/.local/share/dev.fanwit.e2e/user-marker)" = tester ] || fail "the user step ran as root"
grep -q 'elevated = true' /home/tester/.local/share/fwe2e/.install/receipt.toml || fail "receipt does not mark the elevated step"
as "/engine uninstall --manifest /tests/elevated.toml"
[ ! -e /opt/fwe2e-elevated ] || fail "uninstall left the elevated file"
[ ! -e /home/tester/.local/share/dev.fanwit.e2e/user-marker ] || fail "uninstall left the user file"

echo "== machine scope: the whole run elevates once"
as "/engine run --phase package --scope machine --manifest /tests/elevated.toml"
[ -f /opt/fwe2e/.install/receipt.toml ] || fail "no machine receipt in /opt/fwe2e"
grep -q 'scope = "machine"' /opt/fwe2e/.install/receipt.toml || fail "receipt scope"
as "/engine uninstall --scope machine --manifest /tests/elevated.toml"
[ ! -e /opt/fwe2e/.install ] || fail "machine uninstall left the receipt"
[ ! -e /opt/fwe2e-elevated ] || fail "machine uninstall left the file"
echo "PASS elevation $(. /etc/os-release && echo "$PRETTY_NAME")"
