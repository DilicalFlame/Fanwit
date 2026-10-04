//! Format preserving TOML writes (Section 8.7.1); the merge itself lives in
//! packages/toml-merge, shared with the web host's WebAssembly build.

use super::{err, Result, State};
use serde_json::Value;

pub use fanwit_toml_merge::merge_text;

#[tauri::command]
pub fn fw_toml_merge(state: tauri::State<State>, path: String, value: Value) -> Result<String> {
    let p = state.sandbox.check(&path)?;
    let existing = std::fs::read_to_string(&p).unwrap_or_default();
    let text = merge_text(&existing, &value).map_err(err)?;
    if text != existing {
        super::fs::atomic_write(&p, text.as_bytes())?;
    }
    Ok(text)
}

/// Same merge for any text, without touching disk.
#[tauri::command]
pub fn fw_toml_merge_text(text: String, value: Value) -> Result<String> {
    merge_text(&text, &value).map_err(err)
}
