//! Embeds what the Setup app installs: the resolved installer.toml, an optional licence and the
//! native package (payload). `fw installer build --artefacts setup` points the env vars at them.
use std::path::Path;

fn main() {
    let out = std::env::var("OUT_DIR").unwrap();
    let pick = |var: &str, fallbacks: &[&str]| -> Option<String> {
        println!("cargo:rerun-if-env-changed={var}");
        std::env::var(var).ok().filter(|p| Path::new(p).is_file()).or_else(|| fallbacks.iter().find(|p| Path::new(p).is_file()).map(|p| p.to_string()))
    };
    let copy = |src: Option<String>, name: &str| {
        let dst = Path::new(&out).join(name);
        match &src {
            Some(s) => {
                std::fs::copy(s, &dst).unwrap();
                println!("cargo:rerun-if-changed={s}");
            }
            None => std::fs::write(&dst, b"").unwrap(),
        }
        src
    };
    copy(pick("FW_SETUP_MANIFEST", &["../gen/installer/installer.toml", "../../installer.toml"]), "installer.toml");
    copy(pick("FW_SETUP_LICENSE", &["../gen/installer/license.md"]), "license.md");
    let payload = copy(pick("FW_SETUP_PAYLOAD", &[]), "payload.bin");
    let name = payload.and_then(|p| Path::new(&p).file_name().map(|n| n.to_string_lossy().to_string())).unwrap_or_default();
    println!("cargo:rustc-env=FW_PAYLOAD_NAME={name}");
    // generate_context! needs the frontend folder to exist, even before the first vite build
    let _ = std::fs::create_dir_all("../../src-setup/dist");
    tauri_build::build()
}
