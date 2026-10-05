const s=`<div class="fw-code" data-lang="toml" data-file="src/fanwit/themes/builtin/high-contrast.toml"><span class="fw-code-lang">src/fanwit/themes/builtin/high-contrast.toml</span><button type="button" class="fw-copy" data-copy aria-label="Copy code">Copy</button><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"># High contrast theme (WCAG AAA text contrast, strong borders and focus rings).</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">meta</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">id = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fanwit-high-contrast"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"High Contrast"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">author = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"Fanwit"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">version = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"1.0.0"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">extends = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fanwit-default"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">modes = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"light"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"dark"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">common</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">border-width = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"2px"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">radius = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"0.25rem"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">light</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">background = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">muted-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.25 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">border = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">input = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">ring = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.45 0.25 264)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">primary = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.35 0.2 264)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">primary-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">titlebar = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">titlebar-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">statusbar = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">statusbar-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">activity-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.2 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">tab-border = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.35 0.2 264)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">splitter = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">selection = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.35 0.2 264 / 0.3)"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">dark</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">background = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">muted-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.85 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">border = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">input = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">ring = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.85 0.17 90)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">primary = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.85 0.17 90)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">primary-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">titlebar = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">titlebar-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">statusbar = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">statusbar-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">activity = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">activity-foreground = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.9 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">tab = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">tab-active = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.15 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">tab-border = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.85 0.17 90)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">splitter = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(1 0 0)"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">selection = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"oklch(0.85 0.17 90 / 0.35)"</span></span></code></pre></div>`;export{s as default};
