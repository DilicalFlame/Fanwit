const s=`<div class="fw-code" data-lang="toml" data-file="installer/tests/e2e.toml"><span class="fw-code-lang">installer/tests/e2e.toml</span><button type="button" class="fw-copy" data-copy aria-label="Copy code">Copy</button><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"># End-to-end install test for real Linux containers (\`pnpm fw installer test --linux\`).</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"># Every step here runs without systemd, a desktop or administrator rights, so it works in Docker.</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"dev.fanwit.e2e"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"Fanwit E2E"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">slug = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fwe2e"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">version = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"1.0.0"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">installer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">scope = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"user"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">component</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"core"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">required = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">true</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"binary"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"run"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">title = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"Put the app binary in place"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">check = { command = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"test -x {installDir}/fwe2e"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">, success = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">apply = { command = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"sh -c 'mkdir -p {installDir} &#x26;&#x26; printf </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">\\"</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">#!/bin/sh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">\\n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">echo fwe2e</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">\\n\\"</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF"> > {installDir}/fwe2e &#x26;&#x26; chmod +x {installDir}/fwe2e'"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">uninstall = { remove = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8"> }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"cli"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"path"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">after = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"binary"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">target = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"menu"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"shortcut"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">after = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"binary"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">target = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"login"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"autostart"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">target = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">args = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"--headless"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"home"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"env"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"FWE2E_HOME"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">value = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"notes"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fileAssociation"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">ext = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">".fwe"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">target = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"links"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"urlScheme"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">scheme = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fwe2e"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">target = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"tools"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"desktopEntry"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fwe2e-tools"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">entry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">Name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"Fanwit E2E Tools"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">Exec = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"{installDir}/fwe2e --tools"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"config"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">type = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"custom"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">runtime = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"rust"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">handler = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"example.defaultConfig"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">phases = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"package"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">value = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"theme = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">\\"</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">dark</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">\\"\\n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"</span></span></code></pre></div>`;export{s as default};
