const n=`<div class="fw-code" data-lang="text" data-file="installer/tests/e2e.sh"><span class="fw-code-lang">installer/tests/e2e.sh</span><button type="button" class="fw-copy" data-copy aria-label="Copy code">Copy</button><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e" tabindex="0"><code><span class="line"><span>#!/bin/sh</span></span>
<span class="line"><span># Install, check, uninstall, check: run inside a Linux container with the engine at /engine.</span></span>
<span class="line"><span>set -eu</span></span>
<span class="line"><span>E=/engine</span></span>
<span class="line"><span>M=/tests/e2e.toml</span></span>
<span class="line"><span>D="$HOME/.local/share/fwe2e"</span></span>
<span class="line"><span>fail() { echo "FAIL: $*"; exit 1; }</span></span>
<span class="line"><span>want() { [ -e "$1" ] || fail "missing $1"; }</span></span>
<span class="line"><span>gone() { [ ! -e "$1" ] || fail "left behind $1"; }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>echo "== plan"</span></span>
<span class="line"><span>$E plan --manifest $M</span></span>
<span class="line"><span>echo "== install"</span></span>
<span class="line"><span>$E run --phase package --manifest $M</span></span>
<span class="line"><span>for f in "$D/fwe2e" "$HOME/.local/bin/fwe2e" "$HOME/.local/share/applications/fwe2e.desktop" \\</span></span>
<span class="line"><span>         "$HOME/.config/autostart/fwe2e.desktop" "$HOME/.config/environment.d/60-fwe2e-fwe2e_home.conf" \\</span></span>
<span class="line"><span>         "$HOME/.local/share/mime/packages/fwe2e-fwe.xml" "$HOME/.local/share/applications/fwe2e-fwe2e-handler.desktop" \\</span></span>
<span class="line"><span>         "$HOME/.local/share/applications/fwe2e-tools.desktop" "$HOME/.local/share/dev.fanwit.e2e/config.toml" "$D/.install/receipt.toml"; do</span></span>
<span class="line"><span>  want "$f"</span></span>
<span class="line"><span>done</span></span>
<span class="line"><span>grep -q 'FWE2E_HOME=' "$HOME/.config/environment.d/60-fwe2e-fwe2e_home.conf" || fail "env value"</span></span>
<span class="line"><span>[ "$("$HOME/.local/bin/fwe2e")" = fwe2e ] || fail "the PATH link does not run the app"</span></span>
<span class="line"><span>echo "== again (nothing to do)"</span></span>
<span class="line"><span>$E run --phase package --manifest $M | tee /tmp/second.log</span></span>
<span class="line"><span>grep -q '\\.\\.\\.$' /tmp/second.log &#x26;&#x26; fail "a step ran twice" || true</span></span>
<span class="line"><span>echo "== uninstall"</span></span>
<span class="line"><span>$E uninstall --manifest $M</span></span>
<span class="line"><span>for f in "$D/fwe2e" "$HOME/.local/bin/fwe2e" "$HOME/.local/share/applications/fwe2e.desktop" "$HOME/.config/autostart/fwe2e.desktop" \\</span></span>
<span class="line"><span>         "$HOME/.config/environment.d/60-fwe2e-fwe2e_home.conf" "$HOME/.local/share/mime/packages/fwe2e-fwe.xml" \\</span></span>
<span class="line"><span>         "$HOME/.local/share/dev.fanwit.e2e/config.toml" "$D/.install"; do</span></span>
<span class="line"><span>  gone "$f"</span></span>
<span class="line"><span>done</span></span>
<span class="line"><span>echo "PASS $(. /etc/os-release &#x26;&#x26; echo "$PRETTY_NAME")"</span></span></code></pre></div>`;export{n as default};
