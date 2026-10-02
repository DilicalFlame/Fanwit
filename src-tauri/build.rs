fn main() {
    // expose the bundle identifier to the CLI client binary (it finds the app's socket by it)
    let conf = std::fs::read_to_string("tauri.conf.json").unwrap_or_default();
    let id = conf
        .split("\"identifier\"")
        .nth(1)
        .and_then(|s| s.split('"').nth(1))
        .unwrap_or("com.fanwit.app");
    println!("cargo:rustc-env=FW_IDENTIFIER={id}");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
