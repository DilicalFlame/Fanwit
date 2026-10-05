const s=`<div class="fw-code" data-lang="toml" data-file="packages/toml-merge/Cargo.toml"><span class="fw-code-lang">packages/toml-merge/Cargo.toml</span><button type="button" class="fw-copy" data-copy aria-label="Copy code">Copy</button><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">package</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"fanwit-toml-merge"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">version = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"0.1.0"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">edition = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"2021"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">publish = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF">false</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">workspace = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"../../src-tauri"</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"># The desktop links this as a library (src-tauri/src/fanwit/toml.rs); the web host loads it as</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D"># WebAssembly (src/fanwit/host/toml-merge.wasm, committed). After changing it, rebuild with:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D">#   cargo build --manifest-path packages/toml-merge/Cargo.toml --release --target wasm32-unknown-unknown</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D">#   cp src-tauri/target/wasm32-unknown-unknown/release/fanwit_toml_merge.wasm src/fanwit/host/toml-merge.wasm</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">lib</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">crate-type = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"cdylib"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"rlib"</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0">dependencies</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">serde_json = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"1.0"</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">toml_edit = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF">"0.22"</span></span></code></pre></div>`;export{s as default};
